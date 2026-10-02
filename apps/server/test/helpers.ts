import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

export interface TestApp {
  app: FastifyInstance;
  dataDir: string;
  close: () => Promise<void>;
  cleanup: () => Promise<void>;
}

/** Borrado con reintentos: en Windows un archivo recién cerrado puede seguir bloqueado un instante. */
export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

export function tempDir(prefix = 'l10n-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function createTestApp(
  options: { dataDir?: string; now?: () => Date } = {},
): Promise<TestApp> {
  const dataDir = options.dataDir ?? tempDir();
  const app = await buildApp({
    dataDir,
    migrationsDir: MIGRATIONS_DIR,
    appVersion: '0.0.0-test',
    now: options.now,
  });
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await app.close();
    }
  };
  return {
    app,
    dataDir,
    close,
    cleanup: async () => {
      await close();
      removeDir(dataDir);
    },
  };
}

/** Cuerpo multipart/form-data para app.inject. */
export function multipart(
  files: { field?: string; filename: string; content: Buffer | string; type?: string }[],
) {
  const boundary = `----l10n${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field ?? 'file'}"; filename="${f.filename}"\r\n` +
          `Content-Type: ${f.type ?? 'application/octet-stream'}\r\n\r\n`,
      ),
    );
    chunks.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
