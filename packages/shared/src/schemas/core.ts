import { z } from 'zod';
import { colorSchema, entityTypeSchema, idSchema, requiredText } from './common';

export const tagInputSchema = z.object({
  name: requiredText('Nombre', 60),
  color: colorSchema.default('#6b7280'),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export const tagUpdateSchema = tagInputSchema.partial();

export const taggingInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: idSchema,
  tagIds: z.array(idSchema).max(100),
});

export const entityRefSchema = z.object({
  entityType: entityTypeSchema,
  entityId: idSchema,
});

export interface Tag {
  id: string;
  name: string;
  color: string;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  entityType: string | null;
  entityId: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  absolutePath: string;
  createdAt: string;
}

export interface TrashItem {
  entityType: string;
  entityId: string;
  title: string;
  deletedAt: string;
  purgeAt: string;
}

export interface SearchResult {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
}

export type BackupKind =
  'auto' | 'manual' | 'pre-migration' | 'close' | 'pre-restore' | 'pre-import';

export interface BackupInfo {
  fileName: string;
  kind: BackupKind;
  createdAt: string;
  size: number;
}

export interface AppInfo {
  name: string;
  version: string;
  schemaVersion: number;
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  desktop: boolean;
  integrity: 'ok' | 'error';
  startedAt: string;
}

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
}
