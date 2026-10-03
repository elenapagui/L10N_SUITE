import { normalizeDoi, type CslDate, type CslItem, type CslName } from './csl';

/**
 * Referencias en estilo APA 7 (adaptación al español: «y» en lugar de «&», «s. f.», «En»,
 * «(Ed.)/(Eds.)», «(Trad.)», «(pp. x–y)», «[Videojuego]»…).
 *
 * El resultado son fragmentos de texto con o sin cursiva, para copiarlo como texto o HTML.
 */
export interface Run {
  text: string;
  italic?: boolean;
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((p) => (p.length ? `${[...p][0]!.toUpperCase()}.` : ''))
        .join('-'),
    )
    .join(' ');
}

/** «Pérez García, A. M.» (o el nombre institucional tal cual). */
function invertedName(n: CslName): string {
  if (n.literal) return n.literal;
  if (!n.given) return n.family ?? '';
  return `${n.family}, ${initials(n.given)}`;
}

/** «A. M. Pérez García» (para editores dentro de «En …»). */
function directName(n: CslName): string {
  if (n.literal) return n.literal;
  return [n.given ? initials(n.given) : null, n.family].filter(Boolean).join(' ');
}

/** Lista APA: «A, B y C»; con 21 o más, los 19 primeros, «…» y el último. */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length >= 21) return `${names.slice(0, 19).join(', ')}, … ${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function datePart(d: CslDate | undefined, full: boolean): string {
  const p = d?.['date-parts']?.[0];
  if (!p?.[0]) return d?.literal ?? 's. f.';
  const [y, rawMonth, rawDay] = p.map((x) => Number(x));
  // Meses fuera de 1–12 (o las estaciones de CSL, 21–24) y días imposibles no se muestran.
  const m = rawMonth && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : 0;
  const day = m && rawDay && rawDay >= 1 && rawDay <= 31 ? rawDay : 0;
  if (!full || !m) return String(y);
  return day ? `${y}, ${day} de ${MONTHS_ES[m - 1]}` : `${y}, ${MONTHS_ES[m - 1]}`;
}

function ensurePeriod(s: string): string {
  return /[.?!…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
}

function pages(p: string): string {
  return p.replace(/\s*[-–—]+\s*/g, '–');
}

function link(item: CslItem): string | null {
  const doi = normalizeDoi(item.DOI);
  if (doi) return `https://doi.org/${doi}`;
  return item.URL ?? null;
}

function edition(e: string | number | undefined): string | null {
  if (e == null || e === '' || String(e) === '1') return null;
  const n = Number(String(e).replace(/\D/g, ''));
  return n ? `${n}.ª ed.` : String(e);
}

export function formatApa(item: CslItem): Run[] {
  const runs: Run[] = [];
  const push = (text: string, italic = false) => {
    if (text) runs.push(italic ? { text, italic } : { text });
  };
  const authors = item.author?.length ? item.author : [];
  const editorsAsAuthors = !authors.length && Boolean(item.editor?.length);
  const fullDate = [
    'webpage',
    'post-weblog',
    'article-newspaper',
    'article-magazine',
    'paper-conference',
  ].includes(item.type);
  const date = datePart(item.issued, fullDate);
  const title = item.title?.trim() ?? '';
  const container = item['container-title']?.trim() ?? '';
  const isStandalone = [
    'book',
    'thesis',
    'report',
    'webpage',
    'post-weblog',
    'software',
    'motion_picture',
    'dataset',
    'manuscript',
    'document',
  ].includes(item.type);

  // Autoría
  let authorText = '';
  if (authors.length) authorText = joinNames(authors.map(invertedName));
  else if (editorsAsAuthors)
    authorText = `${joinNames(item.editor!.map(invertedName))} (${item.editor!.length > 1 ? 'Eds.' : 'Ed.'})`;

  // Título con sus añadidos: edición, traducción, descripción entre corchetes.
  const extras: string[] = [];
  const ed = edition(item.edition);
  if (ed && isStandalone) extras.push(ed);
  if (item.type === 'report' && item.number) extras.push(`Informe n.º ${item.number}`);
  if (item.volume && item.type === 'book') extras.push(`Vol. ${item.volume}`);
  const trans = item.translator?.length
    ? `${joinNames(item.translator.map(directName))}, Trad.`
    : null;
  const bracket =
    item.type === 'software'
      ? `[${item.genre ?? 'Videojuego'}]`
      : item.type === 'thesis'
        ? `[${[item.genre ?? 'Tesis doctoral', item.publisher].filter(Boolean).join(', ')}]`
        : item.type === 'motion_picture'
          ? `[${item.genre ?? 'Vídeo'}]`
          : item.type === 'paper-conference' && !container
            ? `[${item.genre ?? 'Ponencia'}]`
            : item.genre && ['dataset', 'manuscript', 'document'].includes(item.type)
              ? `[${item.genre}]`
              : null;

  if (authorText) {
    push(`${ensurePeriod(authorText)} (${date}). `);
  } else if (title) {
    // Sin autoría: el título ocupa su lugar.
    push(title, isStandalone);
    push(`${/[.?!…]$/.test(title) ? '' : '.'} (${date}). `);
  }

  if (authorText && title) {
    const italicTitle = isStandalone || (item.type === 'paper-conference' && !container);
    const suffix = [
      extras.length || trans ? ` (${[...extras, trans].filter(Boolean).join('; ')})` : '',
      bracket ? ` ${bracket}` : '',
    ].join('');
    push(title, italicTitle);
    push(`${suffix}${!suffix && /[.?!…]$/.test(title) ? '' : '.'} `);
  } else if (!authorText && (extras.length || bracket)) {
    push(`${[...extras.map((e) => `(${e})`), bracket].filter(Boolean).join(' ')}. `);
  }

  switch (item.type) {
    case 'article-journal':
    case 'article-magazine':
    case 'article-newspaper': {
      if (container) {
        push(container, true);
        if (item.volume) {
          push(', ');
          push(String(item.volume), true);
        }
        if (item.issue) push(`(${item.issue})`);
        if (item.page) push(`, ${pages(item.page)}`);
        push('. ');
      }
      break;
    }
    case 'chapter':
    case 'entry-dictionary':
    case 'paper-conference': {
      if (container) {
        const eds =
          item.editor?.length && !editorsAsAuthors
            ? `${joinNames(item.editor.map(directName))} (${item.editor.length > 1 ? 'Eds.' : 'Ed.'}), `
            : '';
        push(`En ${eds}`);
        push(container, true);
        const inParens = [
          edition(item.edition),
          item.volume ? `Vol. ${item.volume}` : null,
          item.page ? `pp. ${pages(item.page)}` : null,
        ].filter(Boolean);
        if (inParens.length) push(` (${inParens.join(', ')})`);
        push('. ');
        if (item.publisher) push(`${ensurePeriod(item.publisher)} `);
      } else if (item.type === 'paper-conference') {
        const ev = [item['event-title'], item['event-place'] ?? item['publisher-place']]
          .filter(Boolean)
          .join(', ');
        if (ev) push(`${ensurePeriod(ev)} `);
      }
      break;
    }
    case 'software':
    case 'motion_picture':
    case 'book':
    case 'report':
    case 'dataset':
    case 'manuscript':
    case 'document': {
      if (item.publisher && !(authors.length === 1 && authors[0]!.literal === item.publisher))
        push(`${ensurePeriod(item.publisher)} `);
      break;
    }
    case 'thesis': {
      if (container) push(`${ensurePeriod(container)} `);
      break;
    }
    case 'webpage':
    case 'post-weblog': {
      if (container && !(authors[0]?.literal && authors[0].literal === container))
        push(`${ensurePeriod(container)} `);
      break;
    }
    default:
      if (container) {
        push(container, true);
        push('. ');
      }
      if (item.publisher) push(`${ensurePeriod(item.publisher)} `);
  }
  const url = link(item);
  const urlRun = url ? runs.length : -1;
  if (url) push(url);
  // Limpieza: espacios dobles, «..» (pero no «...»), espacio final. El DOI o la URL no se tocan.
  return runs
    .map((r, i) =>
      i === urlRun
        ? r
        : { ...r, text: r.text.replace(/\s{2,}/g, ' ').replace(/(?<![.…])\.\.(?!\.)/g, '.') },
    )
    .filter((r, i, all) => r.text !== '' && !(i === all.length - 1 && r.text === ' '))
    .map((r, i, all) => (i === all.length - 1 ? { ...r, text: r.text.trimEnd() } : r));
}

export function apaText(item: CslItem): string {
  return formatApa(item)
    .map((r) => r.text)
    .join('');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function apaHtml(item: CslItem): string {
  return formatApa(item)
    .map((r) => (r.italic ? `<i>${escapeHtml(r.text)}</i>` : escapeHtml(r.text)))
    .join('');
}

/** Cita en el texto: (Pérez, 2020), (Pérez y Kim, 2020), (Pérez et al., 2020). */
export function apaInText(item: CslItem, page?: string): string {
  const names = item.author?.length ? item.author : (item.editor ?? []);
  const fam = names.map((n) => n.literal ?? n.family ?? '');
  const who =
    fam.length === 0
      ? (item.title ?? '').split(/\s+/).slice(0, 4).join(' ')
      : fam.length === 1
        ? fam[0]
        : fam.length === 2
          ? `${fam[0]} y ${fam[1]}`
          : `${fam[0]} et al.`;
  const year = datePart(item.issued, false);
  return `(${who}, ${year}${page ? `, p. ${page}` : ''})`;
}

/** Orden de la lista de referencias: primer apellido, año y título. */
export function compareApa(a: CslItem, b: CslItem): number {
  const key = (i: CslItem) => {
    const n = i.author?.[0] ?? i.editor?.[0];
    return [
      n?.literal ?? n?.family ?? i.title ?? '',
      datePart(i.issued, false),
      i.title ?? '',
    ].join('\u0000');
  };
  return key(a).localeCompare(key(b), 'es', { sensitivity: 'base' });
}
