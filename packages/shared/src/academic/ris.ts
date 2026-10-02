import { cslDate, normalizeDoi, parseName, type CslItem, type CslName } from './csl';

const RIS_TO_CSL: Record<string, string> = {
  JOUR: 'article-journal',
  JFULL: 'article-journal',
  EJOUR: 'article-journal',
  MGZN: 'article-magazine',
  NEWS: 'article-newspaper',
  BOOK: 'book',
  EBOOK: 'book',
  EDBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  CONF: 'paper-conference',
  CPAPER: 'paper-conference',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  WEB: 'webpage',
  BLOG: 'post-weblog',
  COMP: 'software',
  VIDEO: 'motion_picture',
  DICT: 'entry-dictionary',
  DATA: 'dataset',
  UNPB: 'manuscript',
  MANSCPT: 'manuscript',
  GEN: 'document',
};

const CSL_TO_RIS: Record<string, string> = Object.fromEntries([
  ['article-journal', 'JOUR'],
  ['article-magazine', 'MGZN'],
  ['article-newspaper', 'NEWS'],
  ['book', 'BOOK'],
  ['chapter', 'CHAP'],
  ['paper-conference', 'CPAPER'],
  ['thesis', 'THES'],
  ['report', 'RPRT'],
  ['webpage', 'ELEC'],
  ['post-weblog', 'BLOG'],
  ['software', 'COMP'],
  ['motion_picture', 'VIDEO'],
  ['entry-dictionary', 'DICT'],
  ['dataset', 'DATA'],
  ['manuscript', 'UNPB'],
]);

function parseRisDate(v: string): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  const m = /^(\d{4})(?:[/-](\d{1,2})?(?:[/-](\d{1,2})?)?)?/.exec(v.trim());
  if (!m) return { year: null, month: null, day: null };
  return { year: Number(m[1]), month: m[2] ? Number(m[2]) : null, day: m[3] ? Number(m[3]) : null };
}

/** Lee un archivo RIS (Zotero, Mendeley, EndNote, catálogos y bases de datos). */
export function parseRis(src: string): CslItem[] {
  const items: CslItem[] = [];
  let tags: [string, string][] = [];
  const flush = () => {
    if (!tags.length) return;
    const get = (...keys: string[]) => tags.find(([k]) => keys.includes(k))?.[1];
    const all = (...keys: string[]) => tags.filter(([k]) => keys.includes(k)).map(([, v]) => v);
    const type = RIS_TO_CSL[get('TY') ?? 'GEN'] ?? 'document';
    const item: CslItem = { type };
    const title = get('TI', 'T1', 'CT');
    if (title) item.title = title;
    const names = (keys: string[]): CslName[] => all(...keys).map((n) => parseName(n));
    const authors = names(['AU', 'A1']);
    if (authors.length) item.author = authors;
    const editors = names(['A2', 'ED', 'A3']);
    if (editors.length && type !== 'article-journal') item.editor = editors;
    const container = get('T2', 'JO', 'JF', 'JA', 'BT', 'T3');
    if (container) item['container-title'] = container;
    const d = parseRisDate(get('PY', 'Y1', 'DA') ?? '');
    const issued = cslDate(d.year, d.month, d.day);
    if (issued) item.issued = issued;
    for (const [ris, csl] of [
      ['VL', 'volume'],
      ['IS', 'issue'],
      ['ET', 'edition'],
      ['PB', 'publisher'],
      ['CY', 'publisher-place'],
      ['UR', 'URL'],
      ['AB', 'abstract'],
      ['LA', 'language'],
      ['N1', 'note'],
      ['M3', 'genre'],
    ] as const) {
      const v = get(ris);
      if (v) item[csl] = v;
    }
    const sn = get('SN');
    if (sn) {
      if (/^\d{4}-?\d{3}[\dxX]$/.test(sn.trim())) item.ISSN = sn.trim();
      else item.ISBN = sn.trim();
    }
    const sp = get('SP');
    const ep = get('EP');
    if (sp) item.page = ep ? `${sp}-${ep}` : sp;
    const doi = normalizeDoi(get('DO'));
    if (doi) item.DOI = doi;
    const kw = all('KW');
    if (kw.length) item.keyword = kw.join(', ');
    items.push(item);
    tags = [];
  };
  for (const raw of src.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9]) {2}-(?: (.*))?$/.exec(raw.trimEnd());
    if (!m) {
      // Línea de continuación del campo anterior.
      const last = tags[tags.length - 1];
      if (last && raw.trim()) last[1] = `${last[1]} ${raw.trim()}`;
      continue;
    }
    const [, tag, value = ''] = m;
    if (tag === 'TY') flush();
    if (tag === 'ER') {
      flush();
      continue;
    }
    tags.push([tag!, value.trim()]);
  }
  flush();
  return items;
}

export function toRis(items: CslItem[]): string {
  const lines: string[] = [];
  for (const item of items) {
    const add = (tag: string, v: unknown) => {
      if (v != null && v !== '') lines.push(`${tag}  - ${String(v).replace(/\s*\n\s*/g, ' ')}`);
    };
    add('TY', CSL_TO_RIS[item.type] ?? 'GEN');
    item.author?.forEach((n) =>
      add('AU', n.literal ?? [n.family, n.given].filter(Boolean).join(', ')),
    );
    item.editor?.forEach((n) =>
      add('A2', n.literal ?? [n.family, n.given].filter(Boolean).join(', ')),
    );
    add('TI', item.title);
    add('T2', item['container-title']);
    const p = item.issued?.['date-parts']?.[0];
    if (p?.[0]) add('PY', p[0]);
    if (p?.[0] && p[1])
      add(
        'DA',
        `${p[0]}/${String(p[1]).padStart(2, '0')}/${p[2] ? String(p[2]).padStart(2, '0') : ''}`,
      );
    add('VL', item.volume);
    add('IS', item.issue);
    if (item.page) {
      const [sp, ep] = item.page.split(/[–-]/);
      add('SP', sp);
      add('EP', ep);
    }
    add('ET', item.edition);
    add('PB', item.publisher);
    add('CY', item['publisher-place']);
    add('SN', item.ISBN ?? item.ISSN);
    add('DO', item.DOI);
    add('UR', item.URL);
    add('LA', item.language);
    add('M3', item.genre);
    (item.keyword ?? '')
      .split(/[,;]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .forEach((k) => add('KW', k));
    add('AB', item.abstract);
    add('N1', item.note);
    lines.push('ER  - ', '');
  }
  return lines.join('\r\n');
}
