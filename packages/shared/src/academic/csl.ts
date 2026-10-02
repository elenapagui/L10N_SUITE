/**
 * Referencias bibliográficas en CSL-JSON (el formato de Zotero, Mendeley y citeproc).
 * https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html
 */
export interface CslName {
  family?: string;
  given?: string;
  /** Autoría institucional («Ministerio de Cultura»). */
  literal?: string;
}

export interface CslDate {
  'date-parts'?: (number | string)[][];
  literal?: string;
  raw?: string;
}

export interface CslItem {
  id?: string;
  type: string;
  title?: string;
  'title-short'?: string;
  author?: CslName[];
  editor?: CslName[];
  translator?: CslName[];
  'container-title'?: string;
  'collection-title'?: string;
  publisher?: string;
  'publisher-place'?: string;
  'event-title'?: string;
  'event-place'?: string;
  genre?: string;
  issued?: CslDate;
  accessed?: CslDate;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  edition?: string | number;
  number?: string | number;
  DOI?: string;
  URL?: string;
  ISBN?: string;
  ISSN?: string;
  abstract?: string;
  keyword?: string;
  language?: string;
  note?: string;
  medium?: string;
  'citation-key'?: string;
  [key: string]: unknown;
}

/** Tipos de referencia que se ofrecen en la app (tipos CSL). */
export const REFERENCE_TYPES = [
  { value: 'article-journal', label: 'Artículo de revista' },
  { value: 'book', label: 'Libro' },
  { value: 'chapter', label: 'Capítulo de libro' },
  { value: 'paper-conference', label: 'Ponencia o comunicación' },
  { value: 'thesis', label: 'Tesis o TFM' },
  { value: 'report', label: 'Informe' },
  { value: 'webpage', label: 'Página web' },
  { value: 'post-weblog', label: 'Entrada de blog' },
  { value: 'software', label: 'Videojuego o software' },
  { value: 'motion_picture', label: 'Película o vídeo' },
  { value: 'article-magazine', label: 'Artículo de revista divulgativa' },
  { value: 'article-newspaper', label: 'Artículo de periódico' },
  { value: 'entry-dictionary', label: 'Entrada de diccionario' },
  { value: 'dataset', label: 'Conjunto de datos' },
  { value: 'manuscript', label: 'Manuscrito o inédito' },
  { value: 'document', label: 'Otro documento' },
] as const;

export function referenceTypeLabel(type: string): string {
  return REFERENCE_TYPES.find((t) => t.value === type)?.label ?? 'Otro documento';
}

/** Año de una fecha CSL (o null). */
export function cslYear(d: CslDate | undefined): number | null {
  const y = d?.['date-parts']?.[0]?.[0];
  if (y != null && /^\d{4}$/.test(String(y))) return Number(y);
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(d?.literal ?? d?.raw ?? '');
  return m ? Number(m[1]) : null;
}

export function cslDate(
  year?: number | null,
  month?: number | null,
  day?: number | null,
): CslDate | undefined {
  if (!year) return undefined;
  const parts: number[] = [year];
  if (month) parts.push(month);
  if (month && day) parts.push(day);
  return { 'date-parts': [parts] };
}

/** «Pérez García, Ana» o «Ana Pérez García» → { family, given }. */
export function parseName(raw: string): CslName {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { literal: '' };
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    const given = rest.join(',').trim();
    return given ? { family: family!.trim(), given } : { family: family!.trim() };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { family: s };
  // Partículas («de», «van der», «del»…) van con el apellido.
  let i = parts.length - 1;
  while (i > 1 && /^(de|del|la|las|los|van|von|der|da|dos|du|le)$/i.test(parts[i - 1]!)) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i).join(' ') };
}

export function nameText(n: CslName): string {
  if (n.literal) return n.literal;
  return [n.family, n.given].filter(Boolean).join(', ');
}

/** Primer autor (o editor) para ordenar y mostrar. */
export function creatorsLabel(item: CslItem, max = 3): string {
  const names = item.author?.length ? item.author : (item.editor ?? []);
  if (!names.length) return '';
  const fam = names.map((n) => n.literal ?? n.family ?? n.given ?? '');
  if (fam.length > max) return `${fam[0]} et al.`;
  if (fam.length === 1) return fam[0]!;
  return `${fam.slice(0, -1).join(', ')} y ${fam[fam.length - 1]}`;
}

export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(10\.\d{4,9}\/\S+)/i.exec(raw.trim().replace(/^doi:\s*/i, ''));
  return m ? m[1]!.replace(/[.,;]+$/, '').toLowerCase() : null;
}

/** Clave para detectar duplicados: DOI o título normalizado + año. */
export function duplicateKey(item: CslItem): string {
  const doi = normalizeDoi(item.DOI);
  if (doi) return `doi:${doi}`;
  const title = (item.title ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return `t:${title}|${cslYear(item.issued) ?? ''}`;
}

/** Clave de cita para BibTeX: «perez2020localizacion». */
export function makeCitationKey(item: CslItem): string {
  const first = item.author?.[0] ?? item.editor?.[0];
  const fam = (first?.family ?? first?.literal ?? 'anon').split(/\s+/)[0]!;
  const word = (item.title ?? '')
    .split(/\s+/)
    .find(
      (w) =>
        w.length > 3 && !/^(the|una?|los|las|el|la|del|and|for|from|with|para|sobre)$/i.test(w),
    );
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return `${clean(fam) || 'anon'}${cslYear(item.issued) ?? 'sf'}${clean(word ?? '')}`.slice(0, 60);
}
