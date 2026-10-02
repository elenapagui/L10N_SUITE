import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: id(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6b7280'),
  ...timestamps(),
  ...softDelete(),
});

export const taggings = sqliteTable(
  'taggings',
  {
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.entityType, t.entityId] }),
    index('taggings_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: id(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    fileName: text('file_name').notNull(),
    /** Ruta relativa dentro de la carpeta de adjuntos (con «/» como separador). */
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)],
);

export const activityLog = sqliteTable(
  'activity_log',
  {
    id: id(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('activity_entity_idx').on(t.entityType, t.entityId),
    index('activity_created_idx').on(t.createdAt),
  ],
);

export const importBatches = sqliteTable('import_batches', {
  id: id(),
  kind: text('kind').notNull(),
  fileName: text('file_name'),
  rowCount: integer('row_count').notNull().default(0),
  /** Fichas creadas por la importación ([{ entityType, entityId }]), para poder deshacerla. */
  items: text('items', { mode: 'json' }).notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  undoneAt: text('undone_at'),
});
