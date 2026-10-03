import {
  cslDate,
  makeCitationKey,
  normalizeDoi,
  parseName,
  type CslItem,
  type CslName,
} from './csl';

const ACCENTS: Record<string, string> = {
  "'": '\u0301',
  '`': '\u0300',
  '^': '\u0302',
  '"': '\u0308',
  '~': '\u0303',
  '=': '\u0304',
  '.': '\u0307',
  u: '\u0306',
  v: '\u030c',
  H: '\u030b',
  c: '\u0327',
  k: '\u0328',
  r: '\u030a',
};
const SYMBOLS: Record<string, string> = {
  ss: 'ß',
  o: 'ø',
  O: 'Ø',
  aa: 'å',
  AA: 'Å',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  l: 'ł',
  L: 'Ł',
  i: 'ı',
  j: 'ȷ',
};

/** Convierte los comandos de LaTeX habituales de BibTeX a Unicode («{\'a}» → «á»). */
const TEXT_COMMANDS: Record<string, string> = {
  textquoteleft: '‘',
  textquoteright: '’',
  textquotedblleft: '“',
  textquotedblright: '”',
  textendash: '–',
  textemdash: '—',
  textellipsis: '…',
  ldots: '…',
  dots: '…',
  guillemotleft: '«',
  guillemotright: '»',
  textregistered: '®',
  texttrademark: '™',
  copyright: '©',
  textasciitilde: '\uE001',
  textasciicircum: '^',
};

/** Marcador temporal de «\textbackslash» (para que los pasos siguientes no lo traten como orden). */
const BACKSLASH = '';

export function decodeLatex(input: string): string {
  let s = input.replace(/\\textbackslash(?![a-zA-Z])\s?(?:\{\})?/g, BACKSLASH);
  // \href{url}{texto} → texto
  s = s.replace(/\\href\s*\{[^{}]*\}\s*\{/g, '{');
  // Letras especiales antes que los acentos: «\L\"odz» → «Łódź».
  s = s.replace(
    /\\(ss|aa|AA|ae|AE|oe|OE|o|O|l|L|i|j)(?![a-zA-Z])\s?/g,
    (_m, sym: string) => SYMBOLS[sym]!,
  );
  // Acentos: \'{a}, \'a, {\'a}, \'{\i}
  s = s.replace(
    /\\(['`^"~=.])\s*(?:\{([a-zA-Zıȷ])\}|([a-zA-Zıȷ]))/g,
    (_m, acc: string, a?: string, b?: string) =>
      `${(a ?? b ?? '').replace('ı', 'i').replace('ȷ', 'j')}${ACCENTS[acc]}`,
  );
  s = s.replace(
    /\\([uvHckr])\s*(?:\{([a-zA-Zıȷ])\}|\s+([a-zA-Zıȷ]))/g,
    (_m, acc: string, a?: string, b?: string) =>
      `${(a ?? b ?? '').replace('ı', 'i').replace('ȷ', 'j')}${ACCENTS[acc]}`,
  );
  s = s.replace(
    /\\(textquoteleft|textquoteright|textquotedblleft|textquotedblright|textendash|textemdash|textellipsis|ldots|dots|guillemotleft|guillemotright|textregistered|texttrademark|copyright|textasciitilde|textasciicircum)(?![a-zA-Z])\s?(?:\{\})?/g,
    (_m, cmd: string) => TEXT_COMMANDS[cmd]!,
  );
  s = s
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/(?<!\\)~/g, ' ')
    .replace(/\\,/g, ' ')
    // Cualquier otra orden (\textit, \url, \emph…) se quita y se conserva su contenido.
    .replace(/\\[a-zA-Z]+\*?\s*/g, '')
    .replace(/[{}]/g, '')
    .replaceAll(BACKSLASH, '\\')
    .replaceAll('\uE001', '~');
  return s.replace(/\s+/g, ' ').trim().normalize('NFC');
}

/** URL y DOI: sin descodificar (la «~» y los «--» son parte de la dirección). */
function rawLatex(input: string): string {
  return input
    .replace(/\\(?:url|path)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\([&%$#_{}~])/g, '$1')
    .replace(/[{}]/g, '')
    .trim();
}

const TYPE_TO_CSL: Record<string, string> = {
  article: 'article-journal',
  book: 'book',
  booklet: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  proceedings: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  report: 'report',
  online: 'webpage',
  electronic: 'webpage',
  www: 'webpage',
  software: 'software',
  dataset: 'dataset',
  unpublished: 'manuscript',
  manual: 'book',
  misc: 'document',
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

interface RawEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Lee el texto de un archivo .bib y devuelve sus entradas (sin interpretar los campos). */
export function parseBibtexEntries(src: string): RawEntry[] {
  const out: RawEntry[] = [];
  const macros: Record<string, string> = Object.fromEntries(Object.keys(MONTHS).map((m) => [m, m]));
  let i = 0;
  const n = src.length;
  const skipWs = () => {
    while (i < n && /\s/.test(src[i]!)) i++;
  };
  const readUntilBalanced = (open: string, close: string): string => {
    let depth = 1;
    const start = i;
    while (i < n && depth > 0) {
      const ch = src[i]!;
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) depth--;
      i++;
    }
    return src.slice(start, i - 1);
  };
  const readValue = (): string => {
    const parts: string[] = [];
    for (;;) {
      skipWs();
      const ch = src[i];
      if (ch === '{') {
        i++;
        parts.push(readUntilBalanced('{', '}'));
      } else if (ch === '"') {
        i++;
        const start = i;
        let depth = 0;
        while (i < n) {
          const c = src[i]!;
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '"' && depth === 0) break;
          i++;
        }
        parts.push(src.slice(start, i));
        i++;
      } else {
        const m = /^[^\s,#})]+/.exec(src.slice(i));
        if (!m) break;
        i += m[0].length;
        const word = m[0];
        parts.push(/^\d+$/.test(word) ? word : (macros[word.toLowerCase()] ?? word));
      }
      skipWs();
      if (src[i] === '#') {
        i++;
        continue;
      }
      break;
    }
    return parts.join('');
  };

  while (i < n) {
    const at = src.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const typeMatch = /^([a-zA-Z]+)\s*([{(])/.exec(src.slice(i));
    if (!typeMatch) continue;
    const type = typeMatch[1]!.toLowerCase();
    const close = typeMatch[2] === '{' ? '}' : ')';
    i += typeMatch[0].length;
    if (type === 'comment' || type === 'preamble') {
      readUntilBalanced(typeMatch[2]!, close);
      continue;
    }
    if (type === 'string') {
      skipWs();
      const nm = /^([^\s=]+)\s*=/.exec(src.slice(i));
      if (nm) {
        i += nm[0].length;
        macros[nm[1]!.toLowerCase()] = readValue();
      }
      readUntilBalanced(typeMatch[2]!, close);
      continue;
    }
    skipWs();
    const keyMatch = /^([^,\s]*)\s*,/.exec(src.slice(i));
    let key = '';
    if (keyMatch) {
      key = keyMatch[1]!;
      i += keyMatch[0].length;
    }
    const fields: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (i >= n || src[i] === close) {
        i++;
        break;
      }
      if (src[i] === ',') {
        i++;
        continue;
      }
      const fm = /^([a-zA-Z][\w:+.-]*)\s*=/.exec(src.slice(i));
      if (!fm) {
        // Entrada mal formada: se salta hasta el cierre.
        readUntilBalanced(typeMatch[2]!, close);
        break;
      }
      i += fm[0].length;
      fields[fm[1]!.toLowerCase()] = readValue();
    }
    out.push({ type, key, fields });
  }
  return out;
}

function splitNames(value: string): CslName[] {
  const names: string[] = [];
  let depth = 0;
  let current = '';
  const tokens = value.split(/(\s+and\s+|[{}])/i);
  for (const t of tokens) {
    if (t === '{') depth++;
    if (t === '}') depth--;
    if (depth === 0 && /^\s+and\s+$/i.test(t)) {
      names.push(current);
      current = '';
    } else current += t;
  }
  names.push(current);
  return names
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      // {Nombre de institución} entre llaves → autoría institucional.
      if (/^\{[^{}]*\}$/.test(raw)) return { literal: decodeLatex(raw) };
      const parts = raw.split(',');
      if (parts.length === 3) {
        return { family: decodeLatex(parts[0]!), given: decodeLatex(`${parts[2]!} ${parts[1]!}`) };
      }
      const decoded = decodeLatex(raw);
      return decoded.toLowerCase() === 'others' ? { literal: 'et al.' } : parseName(decoded);
    });
}

function entryToCsl(e: RawEntry): CslItem {
  const f = (k: string) => (e.fields[k] != null ? decodeLatex(e.fields[k]!) : undefined);
  const item: CslItem = { type: TYPE_TO_CSL[e.type] ?? 'document' };
  if (e.key) item['citation-key'] = e.key;
  const title = f('title');
  if (title) item.title = title;
  if (e.fields.author) item.author = splitNames(e.fields.author);
  if (e.fields.editor) item.editor = splitNames(e.fields.editor);
  if (e.fields.translator) item.translator = splitNames(e.fields.translator);
  const container = f('journal') ?? f('journaltitle') ?? f('booktitle');
  if (container) item['container-title'] = container;
  if (f('series')) item['collection-title'] = f('series');
  const publisher = f('publisher') ?? f('school') ?? f('institution') ?? f('organization');
  if (publisher) item.publisher = publisher;
  const place = f('address') ?? f('location');
  if (place) item['publisher-place'] = place;
  const date = f('date');
  const year = Number((f('year') ?? date ?? '').slice(0, 4)) || null;
  const monthRaw = (f('month') ?? '').toLowerCase().slice(0, 3);
  const month =
    MONTHS[monthRaw] ??
    (Number(f('month')) || (date && date.length >= 7 ? Number(date.slice(5, 7)) : null));
  const day = date && date.length >= 10 ? Number(date.slice(8, 10)) : null;
  const issued = cslDate(year, month, day);
  if (issued) item.issued = issued;
  for (const [bib, csl] of [
    ['volume', 'volume'],
    ['number', 'issue'],
    ['issue', 'issue'],
    ['edition', 'edition'],
    ['isbn', 'ISBN'],
    ['issn', 'ISSN'],
    ['abstract', 'abstract'],
    ['language', 'language'],
    ['note', 'note'],
  ] as const) {
    const v = f(bib);
    if (v && item[csl] == null) item[csl] = v;
  }
  const pages = f('pages');
  if (pages) item.page = pages.replace(/\s*[–—-]+\s*/g, '-');
  const url = e.fields.url ?? e.fields.howpublished;
  if (url && /^\s*(\\url\s*\{)?\s*(https?:|ftp:|www\.)/i.test(url)) item.URL = rawLatex(url);
  const doi = normalizeDoi(e.fields.doi != null ? rawLatex(e.fields.doi) : undefined);
  if (doi) item.DOI = doi;
  const kw = f('keywords');
  if (kw) item.keyword = kw;
  if (e.type === 'phdthesis') item.genre = 'Tesis doctoral';
  if (e.type === 'mastersthesis') item.genre = 'Trabajo de fin de máster';
  if (f('type') && !item.genre) item.genre = f('type');
  if (e.type === 'inproceedings' || e.type === 'conference') {
    if (f('eventtitle')) item['event-title'] = f('eventtitle');
  }
  if (f('urldate')) {
    const d = f('urldate')!;
    item.accessed = cslDate(
      Number(d.slice(0, 4)),
      Number(d.slice(5, 7)) || null,
      Number(d.slice(8, 10)) || null,
    );
  }
  return item;
}

export function parseBibtex(src: string): CslItem[] {
  return parseBibtexEntries(src).map(entryToCsl);
}

const CSL_TO_TYPE: Record<string, string> = {
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  book: 'book',
  chapter: 'incollection',
  'paper-conference': 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  webpage: 'online',
  'post-weblog': 'online',
  software: 'software',
  dataset: 'dataset',
  manuscript: 'unpublished',
};

const BIB_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};
const escapeBib = (s: string) =>
  s.replace(/[{}]/g, '').replace(/[\\~^&%$#_]/g, (c) => BIB_ESCAPES[c] ?? `\\${c}`);

/** Sufijo de las claves repetidas: a…z, aa, ab… (solo letras, válido en cualquier BibTeX). */
function keySuffix(n: number): string {
  let out = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26))
    out = String.fromCharCode(97 + ((k - 1) % 26)) + out;
  return out;
}
const namesBib = (names: CslName[]) =>
  names
    .map((n) =>
      n.literal
        ? `{${escapeBib(n.literal)}}`
        : [n.family, n.given]
            .filter(Boolean)
            .map((x) => escapeBib(x!))
            .join(', '),
    )
    .join(' and ');

/** Exporta a BibTeX (UTF-8, como lo leen biber, Zotero y Overleaf). */
export function toBibtex(items: CslItem[]): string {
  const used = new Set<string>();
  return items
    .map((item) => {
      let key = (item['citation-key'] as string | undefined) || makeCitationKey(item);
      const base = key;
      for (let k = 2; used.has(key); k++) key = `${base}${keySuffix(k)}`;
      used.add(key);
      let type = CSL_TO_TYPE[item.type] ?? 'misc';
      if (item.type === 'thesis' && /m[aá]ster|master/i.test(item.genre ?? ''))
        type = 'mastersthesis';
      const fields: [string, string | undefined][] = [
        ['author', item.author?.length ? namesBib(item.author) : undefined],
        ['editor', item.editor?.length ? namesBib(item.editor) : undefined],
        ['translator', item.translator?.length ? namesBib(item.translator) : undefined],
        ['title', item.title ? `{${escapeBib(item.title)}}` : undefined],
        [
          type === 'article' ? 'journal' : 'booktitle',
          item['container-title'] ? escapeBib(item['container-title']) : undefined,
        ],
        ['series', item['collection-title'] ? escapeBib(item['collection-title']) : undefined],
        [
          'year',
          item.issued?.['date-parts']?.[0]?.[0] != null
            ? String(item.issued['date-parts'][0][0])
            : undefined,
        ],
        ['volume', item.volume != null ? String(item.volume) : undefined],
        ['number', item.issue != null ? String(item.issue) : undefined],
        ['pages', item.page ? item.page.replace(/[–-]/g, '--') : undefined],
        ['edition', item.edition != null ? String(item.edition) : undefined],
        [
          type.endsWith('thesis') ? 'school' : 'publisher',
          item.publisher ? escapeBib(item.publisher) : undefined,
        ],
        ['address', item['publisher-place'] ? escapeBib(item['publisher-place']) : undefined],
        ['type', item.genre && item.type !== 'thesis' ? escapeBib(item.genre) : undefined],
        ['doi', item.DOI],
        ['url', item.URL],
        ['isbn', item.ISBN],
        ['issn', item.ISSN],
        ['language', item.language],
        ['keywords', item.keyword ? escapeBib(item.keyword) : undefined],
        ['abstract', item.abstract ? escapeBib(item.abstract) : undefined],
        ['note', item.note ? escapeBib(item.note) : undefined],
      ];
      const body = fields
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(',\n');
      return `@${type}{${key},\n${body}\n}`;
    })
    .join('\n\n')
    .concat('\n');
}
