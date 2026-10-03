import { z } from 'zod';
import { colorSchema, entityTypeSchema, idSchema, patchSchema, requiredText } from './common';

export const tagInputSchema = z.object({
  name: requiredText('Nombre', 60),
  color: colorSchema.default('#6b7280'),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export const tagUpdateSchema = patchSchema(tagInputSchema);

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
  'auto' | 'manual' | 'pre-migration' | 'close' | 'pre-restore' | 'pre-import' | 'pre-sync';

/** Estado que cada ordenador deja en la carpeta de sincronización (`estado.json`). */
export interface SyncRemoteState {
  format: 'l10n-suite-sincronizacion';
  version: 1;
  seq: number;
  deviceId: string;
  deviceName: string;
  savedAt: string;
  schemaVersion: number;
  appVersion: string;
  sha256: string;
  /** Hash de la versión de la que partía este ordenador al enviar (null si era la primera). */
  baseSha?: string | null;
  size: number;
}

export interface SyncStatus {
  configured: boolean;
  /** Carpeta elegida (la de OneDrive, iCloud…). */
  directory: string | null;
  /** Subcarpeta donde la app deja sus archivos. */
  folder: string | null;
  deviceName: string;
  lastSyncAt: string | null;
  /** Hay cambios en este ordenador sin enviar. */
  dirty: boolean;
  remote: SyncRemoteState | null;
  /** Hay una versión más reciente del otro ordenador. */
  incoming: boolean;
  /** Hay cambios en los dos ordenadores: hay que elegir. */
  conflict: boolean;
  lastEvent: {
    kind: 'sent' | 'received' | 'conflict' | 'error';
    at: string;
    deviceName: string | null;
    message?: string;
  } | null;
}

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
