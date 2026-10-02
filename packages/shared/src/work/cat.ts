import { amountFromVolume } from '../money';

/**
 * Análisis de coincidencias del CAT y volumen ponderado.
 * Cada banda lleva su porcentaje de pago; el volumen ponderado es Σ recuento × % / 100.
 */
export const CAT_BANDS = [
  { key: 'context', label: '101 % / contexto (ICE)', defaultPct: 10 },
  { key: 'repetitions', label: 'Repeticiones', defaultPct: 25 },
  { key: 'm100', label: '100 %', defaultPct: 25 },
  { key: 'm95', label: '95–99 %', defaultPct: 50 },
  { key: 'm85', label: '85–94 %', defaultPct: 70 },
  { key: 'm75', label: '75–84 %', defaultPct: 100 },
  { key: 'm50', label: '50–74 %', defaultPct: 100 },
  { key: 'new', label: 'Sin coincidencia', defaultPct: 100 },
] as const;

export type CatBandKey = (typeof CAT_BANDS)[number]['key'];

export interface CatBand {
  key: string;
  count: number;
  pct: number;
}

export type CatGrid = Record<string, number>;

export const DEFAULT_CAT_GRID: CatGrid = Object.fromEntries(
  CAT_BANDS.map((b) => [b.key, b.defaultPct]),
);

/** Bandas vacías con los porcentajes de la rejilla del cliente (o los predeterminados). */
export function emptyAnalysis(grid?: CatGrid | null): CatBand[] {
  return CAT_BANDS.map((b) => ({ key: b.key, count: 0, pct: grid?.[b.key] ?? b.defaultPct }));
}

export function rawVolume(bands: CatBand[]): number {
  return bands.reduce((sum, b) => sum + (Number.isFinite(b.count) ? b.count : 0), 0);
}

/** Volumen ponderado, redondeado a 2 decimales. */
export function weightedVolume(bands: CatBand[]): number {
  const total = bands.reduce((sum, b) => sum + (b.count * b.pct) / 100, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Importe de un encargo en céntimos: volumen (ponderado si hay análisis) × tarifa,
 * con mínimo de facturación si el cliente lo tiene.
 */
export function jobAmount(input: {
  volume: number | null;
  rateMicros: number | null;
  minimumCents?: number | null;
}): number | null {
  if (input.volume == null || input.rateMicros == null) return null;
  const amount = amountFromVolume(input.volume, input.rateMicros);
  if (input.minimumCents && amount < input.minimumCents) return input.minimumCents;
  return amount;
}

/**
 * Lee un análisis pegado desde Excel o desde el informe del CAT: líneas «banda<TAB>recuento».
 * Reconoce los nombres habituales de memoQ, Trados y Phrase.
 */
export function parseCatAnalysis(text: string, grid?: CatGrid | null): CatBand[] {
  const bands = emptyAnalysis(grid);
  const find = (label: string): string | null => {
    const l = label.toLowerCase().replace(/\s+/g, ' ').trim();
    if (/context|ice|101|perfect|x-?translated/.test(l)) return 'context';
    if (/repet|cross-?file|repeti/.test(l)) return 'repetitions';
    if (/^100|100 ?%|100%/.test(l)) return 'm100';
    if (/95/.test(l)) return 'm95';
    if (/85/.test(l)) return 'm85';
    if (/75/.test(l)) return 'm75';
    if (/50/.test(l)) return 'm50';
    if (/no ?match|new|nuev|sin coinc|0 ?%|fuzzy.*0/.test(l)) return 'new';
    return null;
  };
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split(/\t|;|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const key = find(cells[0]!);
    if (!key) continue;
    const num = cells
      .slice(1)
      .map((c) => Number(c.replace(/[.\s]/g, '').replace(',', '.')))
      .find((n) => Number.isFinite(n));
    if (num == null) continue;
    const band = bands.find((b) => b.key === key);
    if (band) band.count += num;
  }
  return bands;
}
