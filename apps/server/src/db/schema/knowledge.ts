import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';
import { games } from './work';

/** Páginas en árbol (sustituyen a Notion). */
export const pages = sqliteTable(
  'pages',
  {
    id: id(),
    parentId: text('parent_id').references((): AnySQLiteColumn => pages.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull().default(''),
    icon: text('icon'),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    /** Bloques del editor (JSON) o Markdown pendiente de convertir. */
    content: text('content').notNull().default('[]'),
    contentFormat: text('content_format').notNull().default('blocks'),
    /** Texto plano para la búsqueda. */
    contentText: text('content_text').notNull().default(''),
    /** Se incrementa con cada guardado del contenido (control de cambios concurrentes). */
    version: integer('version').notNull().default(1),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    position: real('position').notNull().default(0),
    lastOpenedAt: text('last_opened_at'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('pages_parent_idx').on(t.parentId, t.position),
    index('pages_game_idx').on(t.gameId),
  ],
);

/** Versiones anteriores del contenido de una página. */
export const pageRevisions = sqliteTable(
  'page_revisions',
  {
    id: id(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    contentFormat: text('content_format').notNull().default('blocks'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('page_revisions_page_idx').on(t.pageId, t.createdAt)],
);

/** Vínculos entre fichas (menciones con «@» en las páginas). */
export const links = sqliteTable(
  'links',
  {
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceType, t.sourceId, t.targetType, t.targetId] }),
    index('links_target_idx').on(t.targetType, t.targetId),
  ],
);

/** Tablas personalizadas (sustituyen a Google Sheets). */
export const customTables = sqliteTable('custom_tables', {
  id: id(),
  name: text('name').notNull(),
  icon: text('icon'),
  description: text('description'),
  gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
  ...timestamps(),
  ...softDelete(),
});

export const customColumns = sqliteTable(
  'custom_columns',
  {
    id: id(),
    tableId: text('table_id')
      .notNull()
      .references(() => customTables.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().default('text'),
    options: text('options', { mode: 'json' }).notNull().default('{}'),
    width: integer('width'),
    position: real('position').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('custom_columns_table_idx').on(t.tableId, t.position)],
);

export const customRows = sqliteTable(
  'custom_rows',
  {
    id: id(),
    tableId: text('table_id')
      .notNull()
      .references(() => customTables.id, { onDelete: 'cascade' }),
    /** Valores por id de columna. */
    values: text('values', { mode: 'json' }).notNull().default('{}'),
    position: real('position').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('custom_rows_table_idx').on(t.tableId, t.position)],
);

export const customViews = sqliteTable(
  'custom_views',
  {
    id: id(),
    tableId: text('table_id')
      .notNull()
      .references(() => customTables.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().default('grid'),
    config: text('config', { mode: 'json' }).notNull().default('{}'),
    position: real('position').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('custom_views_table_idx').on(t.tableId, t.position)],
);

/** Glosario de cada juego. */
export const glossaryTerms = sqliteTable(
  'glossary_terms',
  {
    id: id(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    termKo: text('term_ko'),
    termEs: text('term_es'),
    termEn: text('term_en'),
    category: text('category'),
    status: text('status').notNull().default('proposed'),
    context: text('context'),
    source: text('source'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('glossary_terms_game_idx').on(t.gameId)],
);

/** Personajes de cada juego. */
export const characters = sqliteTable(
  'characters',
  {
    id: id(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    nameKo: text('name_ko'),
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en'),
    gender: text('gender').notNull().default('unknown'),
    addressForm: text('address_form'),
    koSpeechLevel: text('ko_speech_level'),
    speechStyle: text('speech_style'),
    description: text('description'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('characters_game_idx').on(t.gameId)],
);
