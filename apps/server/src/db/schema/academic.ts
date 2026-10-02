import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';
import { attachments } from './core';
import { corpusVersions } from './corpus';
import { games } from './work';

export const journals = sqliteTable('journals', {
  id: id(),
  name: text('name').notNull(),
  issn: text('issn'),
  eissn: text('eissn'),
  publisher: text('publisher'),
  url: text('url'),
  guidelinesUrl: text('guidelines_url'),
  indexing: text('indexing', { mode: 'json' }).notNull().default('[]'),
  quartile: text('quartile'),
  openAccess: text('open_access').notNull().default('unknown'),
  apcCents: integer('apc_cents'),
  apcCurrency: text('apc_currency').notNull().default('EUR'),
  citationStyle: text('citation_style'),
  languages: text('languages'),
  wordLimit: integer('word_limit'),
  notes: text('notes'),
  ...timestamps(),
  ...softDelete(),
});

export const publications = sqliteTable(
  'publications',
  {
    id: id(),
    title: text('title').notNull(),
    type: text('type').notNull().default('article'),
    status: text('status').notNull().default('idea'),
    abstract: text('abstract'),
    keywords: text('keywords', { mode: 'json' }).notNull().default('[]'),
    language: text('language'),
    journalId: text('journal_id').references(() => journals.id, { onDelete: 'set null' }),
    doi: text('doi'),
    url: text('url'),
    citation: text('citation'),
    corpusVersionId: text('corpus_version_id').references(() => corpusVersions.id, {
      onDelete: 'set null',
    }),
    deadline: text('deadline'),
    wordCount: integer('word_count'),
    notes: text('notes'),
    /** Autoría (orden, afiliación, ORCID…) como JSON. */
    authors: text('authors', { mode: 'json' }).notNull().default('[]'),
    position: real('position').notNull().default(0),
    statusChangedAt: text('status_changed_at').notNull(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('publications_status_idx').on(t.status)],
);

export const publicationGames = sqliteTable(
  'publication_games',
  {
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.gameId] })],
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: id(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    journalId: text('journal_id').references(() => journals.id, { onDelete: 'set null' }),
    venue: text('venue'),
    manuscriptId: text('manuscript_id'),
    submittedAt: text('submitted_at').notNull(),
    decision: text('decision').notNull().default('pending'),
    decisionAt: text('decision_at'),
    revisionDue: text('revision_due'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [
    index('submissions_publication_idx').on(t.publicationId),
    index('submissions_journal_idx').on(t.journalId),
  ],
);

export const references = sqliteTable('bib_references', {
  id: id(),
  /** Datos bibliográficos completos en CSL-JSON. */
  csl: text('csl', { mode: 'json' }).notNull(),
  type: text('type').notNull(),
  title: text('title').notNull().default(''),
  creators: text('creators').notNull().default(''),
  year: integer('year'),
  container: text('container'),
  doi: text('doi'),
  citationKey: text('citation_key').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  readStatus: text('read_status').notNull().default('unread'),
  rating: integer('rating').notNull().default(0),
  notes: text('notes'),
  pdfAttachmentId: text('pdf_attachment_id').references(() => attachments.id, {
    onDelete: 'set null',
  }),
  /** Texto extraído del PDF (para buscar dentro). */
  fullText: text('full_text'),
  ...timestamps(),
  ...softDelete(),
});

export const referenceQuotes = sqliteTable(
  'reference_quotes',
  {
    id: id(),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    page: text('page'),
    comment: text('comment'),
    ...timestamps(),
  },
  (t) => [index('reference_quotes_ref_idx').on(t.referenceId)],
);

export const referenceCollections = sqliteTable('reference_collections', {
  id: id(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  ...timestamps(),
});

export const referenceCollectionItems = sqliteTable(
  'reference_collection_items',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => referenceCollections.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.referenceId] })],
);

export const referenceGames = sqliteTable(
  'reference_games',
  {
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.referenceId, t.gameId] })],
);

/** Bibliografía de cada publicación propia. */
export const publicationReferences = sqliteTable(
  'publication_references',
  {
    publicationId: text('publication_id')
      .notNull()
      .references(() => publications.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.referenceId] }),
    index('publication_references_ref_idx').on(t.referenceId),
  ],
);
