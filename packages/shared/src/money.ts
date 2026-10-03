/**
 * Dinero sin errores de redondeo:
 * - Los importes se guardan como enteros en céntimos (×100), sea cual sea la moneda.
 * - Las tarifas se guardan como enteros en millonésimas (×1 000 000), porque las tarifas
 *   por palabra o carácter tienen muchos decimales (0,075 €/palabra → 75 000).
 */

export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'Dólar estadounidense ($)' },
  { code: 'GBP', label: 'Libra esterlina (£)' },
  { code: 'KRW', label: 'Won surcoreano (₩)' },
  { code: 'JPY', label: 'Yen japonés (¥)' },
  { code: 'CNY', label: 'Yuan chino (¥)' },
  { code: 'CHF', label: 'Franco suizo' },
  { code: 'CAD', label: 'Dólar canadiense' },
  { code: 'AUD', label: 'Dólar australiano' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const RATE_SCALE = 1_000_000;
export const CENTS_SCALE = 100;

/** Interpreta un número escrito a la española o a la inglesa: «1.234,56», «1234.56», «0,075». */
/**
 * `dotDecimal`: un único punto es siempre decimal («1.085» → 1,085), para campos como los tipos
 * de cambio, donde no se escriben miles.
 */
export function parseDecimal(
  input: string | number | null | undefined,
  options: { dotDecimal?: boolean } = {},
): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = input.trim().replace(/[\s\u00a0\u202f\u20ac$\u00a3\u20a9\u00a5]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  // Los separadores de miles solo valen en grupos de tres («1.234.567»); «1,2,3» no es un número.
  const grouped = (int: string, sep: string) =>
    !int.includes(sep) || new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(int);
  if (lastComma > -1 && lastDot > -1) {
    // El separador que aparece en último lugar es el decimal.
    const [dec, thousands] = lastComma > lastDot ? [',', '.'] : ['.', ','];
    const cut = Math.max(lastComma, lastDot);
    const int = s.slice(0, cut);
    if (int.includes(dec) || !grouped(int, thousands)) return null;
    s = `${int.split(thousands).join('')}.${s.slice(cut + 1)}`;
  } else if (lastComma > -1) {
    const commas = s.split(',').length - 1;
    // «1,234,567» → miles; «0,075» o «12,5» → decimal.
    if (commas > 1) {
      if (!grouped(s, ',')) return null;
      s = s.replace(/,/g, '');
    } else s = s.replace(',', '.');
  } else if (lastDot > -1) {
    const dots = s.split('.').length - 1;
    // «1.234.567» y «1.200» → miles a la española; «0.075» o «1.5» → decimal.
    if (dots > 1) {
      if (!grouped(s, '.')) return null;
      s = s.replace(/\./g, '');
    } else if (!options.dotDecimal && /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Redondeo al entero más próximo, con los medios alejándose del cero (como en las facturas) y
 * sin los errores de coma flotante (1,005 × 100 = 100,49999…).
 */
function roundHalfAway(x: number): number {
  const fixed = Number(Math.abs(x).toFixed(6));
  return Math.sign(x) * Math.round(fixed) || 0;
}

export function toCents(amount: number): number {
  return roundHalfAway(amount * CENTS_SCALE);
}

export function fromCents(cents: number): number {
  return cents / CENTS_SCALE;
}

export function toRateMicros(rate: number): number {
  return Math.round(rate * RATE_SCALE);
}

export function fromRateMicros(micros: number): number {
  return micros / RATE_SCALE;
}

/** Importe (en céntimos) de un volumen por una tarifa (en millonésimas). */
export function amountFromVolume(volume: number, rateMicros: number): number {
  return Math.round((volume * rateMicros) / (RATE_SCALE / CENTS_SCALE));
}

/** Porcentaje de un importe en céntimos, redondeado al céntimo. */
export function percentOf(cents: number, percent: number): number {
  // Simétrico: el IVA de un abono (−10,05 €) es el del cargo con el signo cambiado.
  return roundHalfAway((cents * percent) / 100);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number | null | undefined, currency: string = 'EUR'): string {
  if (cents == null) return '—';
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, f);
  }
  return f.format(fromCents(cents));
}

export function formatRate(micros: number | null | undefined, currency: string = 'EUR'): string {
  if (micros == null) return '—';
  const value = fromRateMicros(micros);
  const decimals = Math.min(6, Math.max(2, (value.toString().split('.')[1] ?? '').length));
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: maxDecimals }).format(value);
}
