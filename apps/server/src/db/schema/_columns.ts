import { text } from 'drizzle-orm/sqlite-core';

/** Columnas comunes: identificador UUIDv7 y marcas de tiempo ISO 8601 (UTC). */
export const id = () => text('id').primaryKey();

export const timestamps = () => ({
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Borrado lógico: las fichas con deleted_at van a la papelera. */
export const softDelete = () => ({
  deletedAt: text('deleted_at'),
});
