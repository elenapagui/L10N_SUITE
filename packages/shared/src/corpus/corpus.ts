import { z } from 'zod';
import { optionalText, patchSchema, requiredText } from '../schemas/common';

/** Fases de construcción del corpus de cada juego. */
export const CORPUS_PHASES = [
  { value: 'identified', label: 'Identificado' },
  { value: 'obtained', label: 'Texto obtenido' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'alignment', label: 'Alineación' },
  { value: 'review', label: 'Revisión' },
  { value: 'annotation', label: 'Anotación' },
  { value: 'included', label: 'Incluido' },
] as const;
export type CorpusPhase = (typeof CORPUS_PHASES)[number]['value'];

export const CORPUS_TEXT_TYPES = [
  { value: 'dialogue', label: 'Diálogos' },
  { value: 'ui', label: 'Interfaz' },
  { value: 'item', label: 'Objetos' },
  { value: 'skill', label: 'Habilidades' },
  { value: 'quest', label: 'Misiones' },
  { value: 'lore', label: 'Trasfondo' },
  { value: 'tutorial', label: 'Tutoriales' },
  { value: 'system', label: 'Mensajes del sistema' },
  { value: 'store', label: 'Tienda y marketing' },
  { value: 'patch_notes', label: 'Notas de parche' },
  { value: 'other', label: 'Otros' },
] as const;
export type CorpusTextType = (typeof CORPUS_TEXT_TYPES)[number]['value'];

export const TRANSLATION_DIRECTIONS = [
  { value: 'direct', label: 'Directa (KO → ES)' },
  { value: 'pivot_en', label: 'A través del inglés' },
  { value: 'unknown', label: 'Desconocida' },
] as const;
export type TranslationDirection = (typeof TRANSLATION_DIRECTIONS)[number]['value'];

export const RIGHTS_STATUSES = [
  { value: 'unknown', label: 'Sin determinar' },
  { value: 'research', label: 'Uso de investigación (cita)' },
  { value: 'permission', label: 'Con permiso de la empresa' },
  { value: 'public', label: 'Publicado con licencia abierta' },
  { value: 'restricted', label: 'Uso restringido' },
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number]['value'];

export const CORPUS_LANGS = [
  { value: 'ko', label: 'Coreano' },
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'ja', label: 'Japonés' },
  { value: 'zh', label: 'Chino' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
  { value: 'pt', label: 'Portugués' },
  { value: 'it', label: 'Italiano' },
] as const;
export const langLabel = (code: string) =>
  CORPUS_LANGS.find((l) => l.value === code)?.label ?? code.toUpperCase();
const langSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'Código de idioma no válido');

export const corpusProfileInputSchema = z.object({
  phase: z
    .enum(CORPUS_PHASES.map((p) => p.value) as [CorpusPhase, ...CorpusPhase[]])
    .default('identified'),
  gameVersion: optionalText(100),
  textDate: optionalText(40),
  acquisitionMethod: optionalText(500),
  languages: z.array(langSchema).min(1).max(10).default(['ko', 'es']),
  translationDirection: z.enum(['direct', 'pivot_en', 'unknown']).default('unknown'),
  localizationCompany: optionalText(200),
  rights: z.enum(['unknown', 'research', 'permission', 'public', 'restricted']).default('unknown'),
  rightsNotes: optionalText(5000),
  methodNotes: optionalText(20_000),
  restricted: z.boolean().default(false),
});
export const corpusProfileUpdateSchema = patchSchema(corpusProfileInputSchema);

export interface CorpusProfile {
  gameId: string;
  gameTitle: string;
  originalTitle: string | null;
  releaseYear: number | null;
  genres: string[];
  platforms: string[];
  phase: CorpusPhase;
  gameVersion: string | null;
  textDate: string | null;
  acquisitionMethod: string | null;
  languages: string[];
  translationDirection: TranslationDirection;
  localizationCompany: string | null;
  rights: RightsStatus;
  rightsNotes: string | null;
  methodNotes: string | null;
  restricted: boolean;
  documentCount: number;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export const documentUpdateSchema = z.object({
  title: requiredText('Título', 300).optional(),
  textType: z
    .enum(CORPUS_TEXT_TYPES.map((t) => t.value) as [CorpusTextType, ...CorpusTextType[]])
    .optional(),
  notes: optionalText(10_000).optional(),
});

export interface CorpusDocument {
  id: string;
  gameId: string;
  gameTitle: string;
  title: string;
  textType: CorpusTextType;
  sourceFile: string | null;
  notes: string | null;
  segmentCount: number;
  languages: string[];
  annotationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentAnnotation {
  id: string;
  segmentId: number;
  tagId: string;
  tagName: string;
  tagColor: string;
  lang: string | null;
  start: number | null;
  end: number | null;
  quote: string | null;
  comment: string | null;
}

export interface Segment {
  id: number;
  documentId: string;
  position: number;
  stringId: string | null;
  speaker: string | null;
  context: string | null;
  textType: string | null;
  notes: string | null;
  texts: Record<string, string>;
  annotations: SegmentAnnotation[];
}

export const segmentUpdateSchema = z.object({
  texts: z.record(langSchema, z.string().max(100_000)).optional(),
  stringId: optionalText(300).optional(),
  speaker: optionalText(200).optional(),
  context: optionalText(5000).optional(),
  notes: optionalText(5000).optional(),
});

/** Tratamiento de etiquetas de formato y variables al importar. */
export const corpusImportOptionsSchema = z.object({
  markup: z.enum(['keep', 'strip']).default('strip'),
  variables: z.enum(['keep', 'strip', 'placeholder']).default('keep'),
  /** «\n» escrito literalmente (habitual en los archivos de los juegos) → salto de línea. */
  literalNewlines: z.boolean().default(true),
  skipDuplicates: z.boolean().default(false),
  skipMisaligned: z.boolean().default(false),
});
export type CorpusImportOptions = z.infer<typeof corpusImportOptionsSchema>;

export const corpusImportCommitSchema = z.object({
  token: z.string().min(1),
  sheet: z.number().int().min(0).default(0),
  gameId: z.string().min(1, 'Elige un juego'),
  title: requiredText('Título del documento', 300),
  textType: z
    .enum(CORPUS_TEXT_TYPES.map((t) => t.value) as [CorpusTextType, ...CorpusTextType[]])
    .default('dialogue'),
  /** Columna (índice) de cada idioma. */
  languages: z
    .record(langSchema, z.number().int().min(0))
    .refine((v) => Object.keys(v).length > 0, 'Elige al menos una columna de texto'),
  stringId: z.number().int().min(0).nullish(),
  speaker: z.number().int().min(0).nullish(),
  context: z.number().int().min(0).nullish(),
  textTypeColumn: z.number().int().min(0).nullish(),
  options: corpusImportOptionsSchema.default({
    markup: 'strip',
    variables: 'keep',
    literalNewlines: true,
    skipDuplicates: false,
    skipMisaligned: false,
  }),
});
export type CorpusImportCommit = z.input<typeof corpusImportCommitSchema>;

export interface CorpusImportPreview {
  token: string;
  fileName: string;
  sheets: { name: string; headers: string[]; sample: string[][]; rowCount: number }[];
  /** Propuesta de columnas para la primera hoja. */
  suggested: {
    languages: Record<string, number>;
    stringId: number | null;
    speaker: number | null;
    context: number | null;
  };
}

export interface CorpusImportResult {
  documentId: string;
  segments: number;
  skippedEmpty: number;
  misaligned: number;
  duplicates: number;
  markupRemoved: number;
  variablesFound: number;
}

/** Filtros comunes (concordanciador, estadísticas, exportación y versiones). */
export const corpusFiltersSchema = z
  .object({
    gameIds: z.array(z.string()).max(500).optional(),
    documentIds: z.array(z.string()).max(2000).optional(),
    genres: z.array(z.string()).max(50).optional(),
    platforms: z.array(z.string()).max(50).optional(),
    yearFrom: z.number().int().min(1950).max(2100).nullish(),
    yearTo: z.number().int().min(1950).max(2100).nullish(),
    textTypes: z.array(z.string()).max(20).optional(),
    directions: z.array(z.string()).max(5).optional(),
    phases: z.array(z.string()).max(10).optional(),
    speaker: z.string().max(200).optional(),
    tagIds: z.array(z.string()).max(100).optional(),
    includeRestricted: z.boolean().optional(),
  })
  .default({});
export type CorpusFilters = z.infer<typeof corpusFiltersSchema>;

export const SEARCH_MODES = [
  {
    value: 'text',
    label: 'Contiene',
    help: 'Texto en cualquier posición (sin distinguir mayúsculas ni tildes)',
  },
  { value: 'word', label: 'Palabra completa', help: 'La palabra entera, no dentro de otra' },
  {
    value: 'prefix',
    label: 'Empieza por',
    help: 'Palabras que empiezan así (útil en coreano: 마법사 → 마법사가)',
  },
  {
    value: 'wildcard',
    label: 'Comodines',
    help: '* = cualquier secuencia; ? = un carácter (dentro de una palabra)',
  },
  {
    value: 'regex',
    label: 'Expresión regular',
    help: 'Sintaxis de JavaScript, sin distinguir mayúsculas',
  },
  {
    value: 'lemma',
    label: 'Lema (coreano)',
    help: 'Todas las formas de la palabra: 먹다 → 먹었다, 먹고…; 마법사 → 마법사가, 마법사를…',
  },
] as const;
export type SearchMode = (typeof SEARCH_MODES)[number]['value'];

export const searchConditionSchema = z.object({
  lang: langSchema,
  mode: z.enum(['text', 'word', 'prefix', 'wildcard', 'regex', 'lemma']).default('text'),
  query: z.string().trim().min(1, 'Escribe qué buscar').max(500),
  negate: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
});
export type SearchCondition = z.infer<typeof searchConditionSchema>;

export const concordanceQuerySchema = z.object({
  conditions: z.array(searchConditionSchema).min(1).max(6),
  filters: corpusFiltersSchema,
  sort: z.enum(['document', 'left', 'right', 'match']).default('document'),
  contextChars: z.number().int().min(10).max(300).default(60),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type ConcordanceQuery = z.input<typeof concordanceQuerySchema>;

export interface ConcordanceHit {
  segmentId: number;
  lang: string;
  start: number;
  end: number;
  left: string;
  match: string;
  right: string;
  parallel: Record<string, string>;
  gameId: string;
  gameTitle: string;
  documentId: string;
  documentTitle: string;
  /** Posición del segmento en su documento (para abrirlo ahí). */
  position: number;
  stringId: string | null;
  speaker: string | null;
  textType: string;
  annotationCount: number;
}

export interface ConcordanceResult {
  hits: ConcordanceHit[];
  /** Coincidencias (líneas KWIC) y segmentos distintos. */
  total: number;
  segments: number;
  /** Se alcanzó el máximo de coincidencias que se ordenan; el total es exacto igualmente. */
  truncated: boolean;
  elapsedMs: number;
  /** Aviso (por ejemplo, análisis morfológico aún en curso). */
  notice?: string;
}

export interface FrequencyRow {
  token: string;
  /** Categoría gramatical (solo en las listas por lema del coreano). */
  tag?: string;
  count: number;
  segments: number;
}

export interface CorpusStats {
  games: number;
  documents: number;
  segments: number;
  annotations: number;
  languages: {
    lang: string;
    texts: number;
    characters: number;
    tokens: number;
    types: number;
    tokenLabel: string;
  }[];
  byGenre: { key: string; label: string; segments: number; games: number }[];
  byPlatform: { key: string; label: string; segments: number; games: number }[];
  byYear: { key: string; label: string; segments: number; games: number }[];
  byTextType: { key: string; label: string; segments: number; games: number }[];
  byPhase: { key: string; label: string; segments: number; games: number }[];
  byDirection: { key: string; label: string; segments: number; games: number }[];
}

export interface CorpusVersion {
  id: string;
  name: string;
  description: string | null;
  stats: CorpusStats;
  filters: CorpusFilters;
  attachmentId: string | null;
  createdAt: string;
  /** Texto para citar la versión en un artículo. */
  citation: string;
}

export interface AnnotationTag {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  description: string | null;
  position: number;
  count: number;
}

export const annotationTagInputSchema = z.object({
  name: requiredText('Nombre', 120),
  parentId: z.string().max(64).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#6366f1'),
  description: optionalText(2000),
  position: z.number().int().optional(),
});
export const annotationTagUpdateSchema = patchSchema(annotationTagInputSchema);

export const annotationInputSchema = z
  .object({
    segmentId: z.number().int().positive(),
    tagId: z.string().min(1),
    lang: langSchema.nullish(),
    start: z.number().int().min(0).nullish(),
    end: z.number().int().min(0).nullish(),
    comment: optionalText(5000),
  })
  .refine(
    (a) =>
      (a.start == null) === (a.end == null) && (a.start == null || (a.lang && a.end! > a.start)),
    {
      message: 'El fragmento anotado no es válido',
    },
  );
export const annotationUpdateSchema = z.object({
  tagId: z.string().min(1).optional(),
  comment: optionalText(5000).optional(),
});

export const EXPORT_FORMATS = [
  { value: 'tmx', label: 'TMX (memoria de traducción)' },
  { value: 'txt', label: 'TXT por idioma (AntConc, Sketch Engine, LancsBox)' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
] as const;
export type CorpusExportFormat = (typeof EXPORT_FORMATS)[number]['value'];

/** Estado del análisis morfológico del coreano. */
export interface MorphStatus {
  version: string;
  installed: boolean;
  downloading: { received: number; total: number | null } | null;
  analyzing: { done: number; total: number } | null;
  /** Segmentos con texto coreano y cuántos están analizados. */
  total: number;
  analyzed: number;
  error: string | null;
}

/** Categorías gramaticales de Kiwi (etiquetas del Sejong) en español. */
export function koreanPosLabel(tag: string): string {
  if (tag === 'NNG' || tag === 'NNB') return 'sustantivo';
  if (tag === 'NNP') return 'nombre propio';
  if (tag === 'NP') return 'pronombre';
  if (tag === 'NR') return 'numeral';
  if (tag === 'VV') return 'verbo';
  if (tag === 'VA') return 'adjetivo';
  if (tag === 'VX') return 'auxiliar';
  if (tag === 'VCP' || tag === 'VCN') return 'cópula';
  if (tag === 'MM') return 'determinante';
  if (tag === 'MAG' || tag === 'MAJ') return 'adverbio';
  if (tag === 'IC') return 'interjección';
  if (tag.startsWith('J')) return 'partícula';
  if (tag.startsWith('E')) return 'terminación';
  if (tag === 'XPN') return 'prefijo';
  if (tag.startsWith('XS')) return 'sufijo';
  if (tag === 'XR') return 'raíz';
  if (tag === 'SL') return 'palabra extranjera';
  if (tag === 'SH') return 'hanja';
  if (tag === 'SN') return 'número';
  return tag;
}
