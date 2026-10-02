import { z } from 'zod';
import { toISODate } from './dates';
import { normalizeForSearch } from './text';

/** Tipos de ficha que se pueden importar desde CSV o Excel (ClickUp, Google Sheets, Notion…). */
export const IMPORT_TARGETS = {
  clients: {
    label: 'Clientes',
    fields: [
      {
        key: 'name',
        label: 'Nombre',
        required: true,
        aliases: ['nombre', 'cliente', 'client', 'name', 'empresa', 'company'],
      },
      { key: 'kind', label: 'Tipo', aliases: ['tipo', 'type', 'kind'] },
      { key: 'country', label: 'País', aliases: ['pais', 'country'] },
      { key: 'email', label: 'Correo', aliases: ['email', 'correo', 'e-mail', 'mail'] },
      { key: 'website', label: 'Web', aliases: ['web', 'website', 'url', 'sitio'] },
      { key: 'currency', label: 'Moneda', aliases: ['moneda', 'currency', 'divisa'] },
      { key: 'taxId', label: 'NIF / VAT', aliases: ['nif', 'cif', 'vat', 'tax id', 'nif/vat'] },
      {
        key: 'platform',
        label: 'Plataforma o CAT',
        aliases: ['plataforma', 'platform', 'cat', 'herramienta'],
      },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes', 'comentarios', 'observaciones'] },
    ],
  },
  games: {
    label: 'Juegos',
    fields: [
      {
        key: 'title',
        label: 'Título',
        required: true,
        aliases: ['titulo', 'title', 'juego', 'game', 'nombre', 'name'],
      },
      {
        key: 'originalTitle',
        label: 'Título original',
        aliases: ['titulo original', 'original title', 'original', '원제'],
      },
      {
        key: 'titleEs',
        label: 'Título en español',
        aliases: ['titulo es', 'titulo en espanol', 'spanish title'],
      },
      {
        key: 'titleEn',
        label: 'Título en inglés',
        aliases: ['titulo en', 'titulo en ingles', 'english title'],
      },
      {
        key: 'developer',
        label: 'Desarrolladora',
        aliases: ['desarrolladora', 'developer', 'estudio', 'studio'],
      },
      { key: 'publisher', label: 'Editora', aliases: ['editora', 'publisher', 'distribuidora'] },
      {
        key: 'releaseYear',
        label: 'Año',
        aliases: ['ano', 'año', 'year', 'release year', 'lanzamiento'],
      },
      {
        key: 'genres',
        label: 'Géneros (separados por comas)',
        aliases: ['genero', 'generos', 'genre', 'genres'],
      },
      {
        key: 'platforms',
        label: 'Plataformas (separadas por comas)',
        aliases: ['plataforma', 'plataformas', 'platform', 'platforms'],
      },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes'] },
    ],
  },
  projects: {
    label: 'Proyectos',
    fields: [
      {
        key: 'name',
        label: 'Nombre',
        required: true,
        aliases: ['nombre', 'proyecto', 'project', 'name', 'list name', 'folder name'],
      },
      { key: 'client', label: 'Cliente (por nombre)', aliases: ['cliente', 'client', 'agencia'] },
      { key: 'game', label: 'Juego (por título)', aliases: ['juego', 'game', 'titulo'] },
      {
        key: 'sourceLang',
        label: 'Idioma de origen (ko, en…)',
        aliases: ['origen', 'source', 'idioma origen', 'source language'],
      },
      {
        key: 'targetLang',
        label: 'Idioma de destino',
        aliases: ['destino', 'target', 'idioma destino', 'target language'],
      },
      { key: 'status', label: 'Estado', aliases: ['estado', 'status'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes', 'descripcion', 'description'] },
    ],
  },
  tasks: {
    label: 'Tareas',
    fields: [
      {
        key: 'title',
        label: 'Título',
        required: true,
        aliases: ['task name', 'titulo', 'tarea', 'title', 'name', 'nombre'],
      },
      {
        key: 'description',
        label: 'Descripción',
        aliases: ['task content', 'descripcion', 'description', 'content', 'notas'],
      },
      { key: 'status', label: 'Estado', aliases: ['status', 'estado'] },
      { key: 'priority', label: 'Prioridad', aliases: ['priority', 'prioridad'] },
      {
        key: 'dueDate',
        label: 'Fecha límite',
        aliases: ['due date', 'fecha limite', 'vencimiento', 'fecha', 'due'],
      },
      {
        key: 'startDate',
        label: 'Fecha de inicio',
        aliases: ['start date', 'fecha inicio', 'inicio'],
      },
      { key: 'area', label: 'Área (espacio)', aliases: ['space name', 'espacio', 'area', 'space'] },
      { key: 'list', label: 'Lista', aliases: ['list name', 'lista', 'list'] },
      {
        key: 'project',
        label: 'Proyecto (por nombre)',
        aliases: ['proyecto', 'project', 'folder name'],
      },
      {
        key: 'tags',
        label: 'Etiquetas (separadas por comas)',
        aliases: ['tags', 'etiquetas', 'tag'],
      },
      {
        key: 'estimate',
        label: 'Estimación',
        aliases: ['time estimated text', 'time estimated', 'estimacion', 'estimate'],
      },
      { key: 'externalId', label: 'ID en el origen (para subtareas)', aliases: ['task id', 'id'] },
      {
        key: 'parentExternalId',
        label: 'ID de la tarea principal',
        aliases: ['parent id', 'parent', 'id padre'],
      },
    ],
  },
} as const;

export type ImportTarget = keyof typeof IMPORT_TARGETS;
export const IMPORT_TARGET_KEYS = Object.keys(IMPORT_TARGETS) as ImportTarget[];

export const importCommitSchema = z.object({
  token: z.string().min(1).max(100),
  target: z.enum(IMPORT_TARGET_KEYS as [ImportTarget, ...ImportTarget[]]),
  /** campo → nombre de columna */
  mapping: z.record(z.string(), z.string().max(300)),
  dateFormat: z.enum(['auto', 'dmy', 'mdy']).default('auto'),
  skipDuplicates: z.boolean().default(true),
});
export type ImportCommit = z.input<typeof importCommitSchema>;

export interface ImportPreview {
  token: string;
  fileName: string;
  sheetName: string | null;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export interface ImportResult {
  batchId: string;
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface ImportBatch {
  id: string;
  kind: string;
  fileName: string | null;
  rowCount: number;
  createdAt: string;
  undoneAt: string | null;
}

/** Sugiere qué columna corresponde a cada campo comparando los encabezados con los alias. */
export function autoMap(headers: string[], target: ImportTarget): Record<string, string> {
  const norm = headers.map((h) => ({ h, n: normalizeForSearch(h) }));
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of IMPORT_TARGETS[target].fields) {
    const aliases = (field.aliases as readonly string[]).map(normalizeForSearch);
    const hit = norm.find((x) => !used.has(x.h) && aliases.includes(x.n));
    if (hit) {
      mapping[field.key] = hit.h;
      used.add(hit.h);
    }
  }
  return mapping;
}

/**
 * Fecha flexible: ISO, «dd/mm/aaaa» (o «mm/dd/aaaa» si se indica), marca de tiempo Unix en
 * milisegundos (ClickUp) o en segundos, y fechas de Excel ya convertidas.
 */
export function parseFlexibleDate(
  value: unknown,
  format: 'auto' | 'dmy' | 'mdy' = 'auto',
): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toISODate(value);
  const s = String(value).trim();
  if (s === '') return null;
  if (/^\d{12,14}$/.test(s)) return toISODate(new Date(Number(s)));
  if (/^\d{9,10}$/.test(s)) return toISODate(new Date(Number(s) * 1000));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (parts) {
    let [a, b] = [Number(parts[1]), Number(parts[2])];
    let year = Number(parts[3]);
    if (year < 100) year += 2000;
    let day: number;
    let month: number;
    if (format === 'mdy' || (format === 'auto' && b > 12 && a <= 12)) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    [a, b] = [day, month];
    return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : toISODate(new Date(parsed));
}

/** «1h 30m», «1:30», «90», «1,5 h», «2 horas» → minutos. */
export function parseDurationMinutes(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase().replace(',', '.');
  if (s === '') return null;
  const hm = /^(\d+):(\d{1,2})$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(
    /(\d+(?:\.\d+)?)\s*(h|hora|horas|hours?|m|min|mins|minutos?|d|dias?|days?)/g,
  )) {
    matched = true;
    const n = Number(m[1]);
    const unit = m[2]!;
    if (unit.startsWith('h')) total += n * 60;
    else if (unit.startsWith('d')) total += n * 8 * 60;
    else total += n;
  }
  if (matched) return Math.round(total);
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function splitList(value: unknown): string[] {
  if (value == null) return [];
  return String(value)
    .replace(/^\[|\]$/g, '')
    .split(/[,;|]/)
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}
