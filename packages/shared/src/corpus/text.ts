import type { CorpusImportOptions, SearchCondition } from './corpus';

/** Etiquetas de formato habituales en los textos de los juegos: <color=#fff>, </b>, [b], [/color]… */
export const MARKUP_RE =
  /<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:[=\s][^<>]{0,120})?>|\[\/?(?:b|i|u|s|color|size|url|font|sup|sub)(?:=[^\]]{0,60})?\]/g;

/** Variables y marcadores de posición: {0}, {playerName}, %s, %1$d, %.2f, $NAME$, [PLAYER]. */
export const VARIABLE_RE =
  /\{[^{}\s]{1,40}\}|%(?:\d+\$)?[-+0 #]*\d*(?:\.\d+)?[sdifuxXc@]|\$[A-Za-z_][A-Za-z0-9_]*\$|\[[A-Z][A-Z0-9_]{1,30}\]/g;

export const VARIABLE_PLACEHOLDER = '⟨VAR⟩';

/** Limpia un texto al importarlo: Unicode NFC, saltos de línea, etiquetas y variables. */
export function cleanSegmentText(
  raw: string,
  options: Pick<CorpusImportOptions, 'markup' | 'variables' | 'literalNewlines'>,
): { text: string; markupRemoved: number; variables: number } {
  let text = raw.normalize('NFC').replace(/\r\n?/g, '\n');
  if (options.literalNewlines) text = text.replace(/\\n/g, '\n');
  let markupRemoved = 0;
  if (options.markup === 'strip') {
    text = text.replace(MARKUP_RE, () => {
      markupRemoved++;
      return '';
    });
  }
  let variables = 0;
  text = text.replace(VARIABLE_RE, (m) => {
    variables++;
    if (options.variables === 'strip') return '';
    if (options.variables === 'placeholder') return VARIABLE_PLACEHOLDER;
    return m;
  });
  text = text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  return { text, markupRemoved, variables };
}

const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’·-][\p{L}\p{M}\p{N}]+)*/gu;
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const EDGE_PUNCT_RE = /^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu;

/**
 * Unidades de recuento: en coreano, eojeol (lo que va entre espacios, sin la puntuación de los
 * extremos); en el resto de idiomas, palabras en minúsculas.
 */
export function tokenize(raw: string, lang: string): string[] {
  // Las variables ({0}, %s…) no son palabras.
  const text = raw.replace(VARIABLE_RE, ' ').replace(/⟨VAR⟩/g, ' ');
  if (lang === 'ko') {
    return text
      .split(/\s+/)
      .map((t) => t.replace(EDGE_PUNCT_RE, ''))
      .filter((t) => t && /[\p{L}\p{N}]/u.test(t));
  }
  return (text.match(WORD_RE) ?? []).map((w) => w.toLocaleLowerCase(lang));
}

export const tokenLabel = (lang: string) => (lang === 'ko' ? 'eojeol' : 'palabras');

/** Caracteres sin contar los espacios (en coreano, sílabas y signos). */
export function countCharacters(text: string): number {
  let n = 0;
  for (const ch of text) if (!/\s/.test(ch)) n++;
  return n;
}

export function hasHangul(text: string): boolean {
  return HANGUL_RE.test(text);
}

const ACCENT_CLASSES: Record<string, string> = {
  a: '[aáàâäãå]',
  e: '[eéèêë]',
  i: '[iíìîï]',
  o: '[oóòôöõ]',
  u: '[uúùûü]',
  n: '[nñ]',
  c: '[cç]',
  y: '[yýÿ]',
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Patrón que no distingue tildes («cancion» encuentra «canción»), como el índice FTS. */
function accentInsensitive(literal: string): string {
  let out = '';
  for (const ch of literal.normalize('NFC')) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (base.length === 1 && ACCENT_CLASSES[base]) out += ACCENT_CLASSES[base];
    else out += escapeRegex(ch);
  }
  return out;
}

const W = '[\\p{L}\\p{M}\\p{N}]';

/**
 * LIKE de SQLite solo ignora mayúsculas en ASCII y no ignora tildes: si el texto lleva letras
 * con tilde o mayúsculas no ASCII, o vocales que podrían llevarla, no sirve para preseleccionar
 * (se busca solo con la expresión regular).
 */
function likeSafe(literal: string): boolean {
  for (const ch of literal.normalize('NFC')) {
    if (/\p{M}/u.test(ch.normalize('NFD')) || ACCENT_CLASSES[ch.toLowerCase()]) return false;
    if (ch.toLowerCase() !== ch.toUpperCase() && !/[a-z]/i.test(ch)) return false;
  }
  return true;
}

export interface CompiledCondition {
  condition: SearchCondition;
  regex: RegExp;
  /** Texto literal (3+ caracteres) para preseleccionar con el índice FTS; null si no hay. */
  ftsLiteral: string | null;
  /** Texto literal corto para preseleccionar con LIKE cuando no se puede usar el índice. */
  likeLiteral: string | null;
}

export class SearchSyntaxError extends Error {}

export function compileCondition(c: SearchCondition): CompiledCondition {
  const q = c.query.trim().normalize('NFC');
  const flags = c.caseSensitive ? 'gu' : 'giu';
  let pattern: string;
  let literal: string | null = q;
  switch (c.mode) {
    case 'word':
      pattern = `(?<!${W})${c.caseSensitive ? escapeRegex(q) : accentInsensitive(q)}(?!${W})`;
      break;
    case 'prefix':
      pattern = `(?<!${W})${c.caseSensitive ? escapeRegex(q) : accentInsensitive(q)}${W}*`;
      break;
    case 'wildcard': {
      const parts = q.split(/([*?])/);
      pattern = `(?<!${W})${parts
        .map((p) =>
          p === '*'
            ? `${W}*`
            : p === '?'
              ? W
              : c.caseSensitive
                ? escapeRegex(p)
                : accentInsensitive(p),
        )
        .join('')}(?!${W})`;
      literal =
        parts.filter((p) => p !== '*' && p !== '?').sort((a, b) => b.length - a.length)[0] ?? null;
      break;
    }
    case 'regex':
      pattern = q;
      literal = null;
      break;
    default:
      pattern = c.caseSensitive ? escapeRegex(q) : accentInsensitive(q);
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    throw new SearchSyntaxError(`La expresión «${q}» no es válida.`);
  }
  // Un patrón que puede coincidir con la cadena vacía daría infinitas coincidencias.
  if (regex.test(''))
    throw new SearchSyntaxError(`La búsqueda «${q}» encuentra texto vacío; concrétala más.`);
  regex.lastIndex = 0;
  const lit = literal && [...literal].length >= 3 ? literal : null;
  return {
    condition: c,
    regex,
    ftsLiteral: lit,
    likeLiteral: !lit && literal && likeSafe(literal) ? literal : null,
  };
}

export interface KwicLine {
  start: number;
  end: number;
  left: string;
  match: string;
  right: string;
}

/** Líneas de concordancia (KWIC): una por coincidencia, con el contexto a cada lado. */
export function kwic(text: string, regex: RegExp, contextChars: number, max = 50): KwicLine[] {
  const out: KwicLine[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) && out.length < max) {
    if (m[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    const flat = (s: string) => s.replace(/\s+/g, ' ');
    out.push({
      start,
      end,
      left: flat(text.slice(Math.max(0, start - contextChars), start)),
      match: m[0],
      right: flat(text.slice(end, end + contextChars)),
    });
  }
  regex.lastIndex = 0;
  return out;
}

export function matches(text: string, regex: RegExp): boolean {
  regex.lastIndex = 0;
  const r = regex.test(text);
  regex.lastIndex = 0;
  return r;
}

/** Palabras vacías del español (para las listas de frecuencia). */
export const SPANISH_STOPWORDS = new Set(
  'a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eres es esa esas ese eso esos esta estaba estas este esto estos fue fueron ha había han has hasta hay la las le les lo los me mi mis muy más nada ni no nos nosotros o os otra otro para pero poco por porque que quien se sea ser si sin sobre son su sus también te tiene tu tus tú un una uno unos y ya yo él'.split(
    ' ',
  ),
);
export const ENGLISH_STOPWORDS = new Set(
  'a an and are as at be but by for from has have he her his i in is it its me my of on or our she so that the their them they this to was we were what will with you your'.split(
    ' ',
  ),
);
