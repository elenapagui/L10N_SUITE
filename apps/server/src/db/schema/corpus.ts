import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';
import { attachments } from './core';
import { games } from './work';

/** Ficha de corpus de un juego (1:1 con el juego). */
export const corpusProfiles = sqliteTable('corpus_profiles', {
  gameId: text('game_id')
    .primaryKey()
    .references(() => games.id, { onDelete: 'cascade' }),
  phase: text('phase').notNull().default('identified'),
  gameVersion: text('game_version'),
  textDate: text('text_date'),
  acquisitionMethod: text('acquisition_method'),
  languages: text('languages', { mode: 'json' }).notNull().default('["ko","es"]'),
  translationDirection: text('translation_direction').notNull().default('unknown'),
  localizationCompany: text('localization_company'),
  rights: text('rights').notNull().default('unknown'),
  rightsNotes: text('rights_notes'),
  methodNotes: text('method_notes'),
  /** Material de uso restringido: no se incluye en las exportaciones salvo que se pida. */
  restricted: integer('restricted', { mode: 'boolean' }).notNull().default(false),
  ...timestamps(),
});

export const corpusDocuments = sqliteTable(
  'corpus_documents',
  {
    id: id(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    textType: text('text_type').notNull().default('dialogue'),
    sourceFile: text('source_file'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('corpus_documents_game_idx').on(t.gameId)],
);

/** Segmento (una cadena del juego) con sus textos por idioma. Id numérico: puede haber millones. */
export const segments = sqliteTable(
  'segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentId: text('document_id')
      .notNull()
      .references(() => corpusDocuments.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    stringId: text('string_id'),
    speaker: text('speaker'),
    context: text('context'),
    /** Tipo de texto propio del segmento (si no, el del documento). */
    textType: text('text_type'),
    notes: text('notes'),
  },
  (t) => [
    index('segments_document_idx').on(t.documentId, t.position),
    index('segments_speaker_idx').on(t.speaker),
  ],
);

export const segmentTexts = sqliteTable(
  'segment_texts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    segmentId: integer('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    lang: text('lang').notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    uniqueIndex('segment_texts_segment_lang_idx').on(t.segmentId, t.lang),
    index('segment_texts_lang_idx').on(t.lang),
  ],
);

/**
 * Análisis morfológico del coreano (Kiwi): un morfema por fila, con su lema (los verbos y
 * adjetivos con «-다») y su categoría. Posiciones en caracteres dentro del texto coreano.
 */
export const segmentMorphs = sqliteTable(
  'segment_morphs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    segmentId: integer('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    lemma: text('lemma').notNull(),
    tag: text('tag').notNull(),
    start: integer('start').notNull(),
    end: integer('end').notNull(),
  },
  (t) => [
    index('segment_morphs_lemma_idx').on(t.lemma),
    index('segment_morphs_segment_idx').on(t.segmentId),
  ],
);

/** Segmentos cuyo texto coreano ya se ha analizado (se borra si el texto cambia). */
export const segmentMorphDone = sqliteTable('segment_morph_done', {
  segmentId: integer('segment_id')
    .primaryKey()
    .references(() => segments.id, { onDelete: 'cascade' }),
  analyzedAt: text('analyzed_at').notNull(),
});

/** Esquema de anotación jerárquico (técnicas de traducción, honoríficos…). */
export const annotationTags = sqliteTable(
  'annotation_tags',
  {
    id: id(),
    parentId: text('parent_id').references((): AnySQLiteColumn => annotationTags.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6366f1'),
    description: text('description'),
    position: integer('position').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('annotation_tags_parent_idx').on(t.parentId)],
);

/** Anotación de un segmento entero o de un fragmento de uno de sus textos. */
export const annotations = sqliteTable(
  'annotations',
  {
    id: id(),
    segmentId: integer('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => annotationTags.id, { onDelete: 'cascade' }),
    lang: text('lang'),
    start: integer('start'),
    end: integer('end'),
    /** Texto anotado (para mostrarlo aunque luego se corrija el segmento). */
    quote: text('quote'),
    comment: text('comment'),
    ...timestamps(),
  },
  (t) => [
    index('annotations_segment_idx').on(t.segmentId),
    index('annotations_tag_idx').on(t.tagId),
  ],
);

/** Versiones fechadas del corpus para citarlas en los artículos. */
export const corpusVersions = sqliteTable('corpus_versions', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  stats: text('stats', { mode: 'json' }).notNull(),
  filters: text('filters', { mode: 'json' }).notNull().default('{}'),
  attachmentId: text('attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
  ...timestamps(),
});

/** Búsquedas guardadas del concordanciador. */
export const savedSearches = sqliteTable('saved_searches', {
  id: id(),
  name: text('name').notNull(),
  query: text('query', { mode: 'json' }).notNull(),
  ...timestamps(),
});
