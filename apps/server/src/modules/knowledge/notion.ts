import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import yauzl from 'yauzl';
import { z } from 'zod';
import { formatDateES, todayISO, toNFC } from '@l10n/shared';
import type { AppContext } from '../../context';
import { ValidationError } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { saveAttachment } from '../../services/attachments';
import { recordImportBatch } from '../import';
import { createPage, updatePage } from './pages';
import { importTables } from './tables';

/** Límite de lo que se descomprime en memoria (las exportaciones de Notion suelen ser pequeñas). */
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

/** Lee todas las entradas de un ZIP en memoria (descomprimiendo también los ZIP anidados). */
async function readZip(
  buffer: Buffer,
  prefix = '',
  budget = { bytes: 0, entries: 0 },
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, z) =>
      err || !z ? reject(err ?? new Error('ZIP')) : resolve(z),
    ),
  ).catch(() => {
    throw new ValidationError(
      'El archivo no es un ZIP válido. Exporta desde Notion en «Markdown & CSV».',
    );
  });
  const nested: [string, Buffer][] = [];
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve());
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName.replace(/\\/g, '/');
      if (name.endsWith('/') || name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(name)) {
        zip.readEntry();
        return;
      }
      budget.entries++;
      budget.bytes += entry.uncompressedSize;
      if (budget.entries > MAX_ENTRIES || budget.bytes > MAX_TOTAL_BYTES) {
        reject(
          new ValidationError(
            'La exportación es demasiado grande. Exporta los espacios de Notion por partes.',
          ),
        );
        return;
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('No se puede leer una entrada del ZIP'));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('error', reject);
        stream.on('end', () => {
          const data = Buffer.concat(chunks);
          if (name.toLowerCase().endsWith('.zip')) nested.push([name, data]);
          else files.set(prefix + toNFC(name), data);
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
  for (const [name, data] of nested) {
    const inner = await readZip(data, prefix, budget);
    for (const [k, v] of inner) files.set(k, v);
    void name;
  }
  return files;
}

/** «Mi página 1a2b3c…(32 hex)» → «Mi página». */
export function cleanNotionName(name: string): string {
  return name
    .replace(/\.(md|csv)$/i, '')
    .replace(/_all$/i, '')
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/\s+[0-9a-f]{5,}$/i, (m) => (/\d/.test(m) && /[a-f]/i.test(m) ? '' : m))
    .trim();
}

function folderKey(filePath: string): string {
  return filePath.replace(/\.(md|csv)$/i, '').replace(/_all$/i, '');
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Importa una exportación de Notion («Markdown & CSV»): las páginas conservan su jerarquía
 * dentro de una página contenedora; las bases de datos (CSV) pasan a ser tablas, y las
 * imágenes y archivos se guardan como adjuntos de su página.
 */
export async function importNotion(
  ctx: AppContext,
  fileName: string,
  buffer: Buffer,
): Promise<{
  rootPageId: string;
  pages: number;
  tables: number;
  attachments: number;
  batchId: string;
}> {
  const files = await readZip(buffer);
  const mdFiles = [...files.keys()]
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const csvFiles = [...files.keys()].filter((f) => f.toLowerCase().endsWith('.csv'));
  if (mdFiles.length === 0 && csvFiles.length === 0) {
    throw new ValidationError(
      'No hay páginas ni bases de datos en el ZIP. Exporta desde Notion en «Markdown & CSV».',
    );
  }
  const created: { entityType: string; entityId: string }[] = [];
  const root = createPage(ctx, {
    title: `Importación de Notion · ${formatDateES(todayISO(ctx.now()))}`,
    icon: '📥',
    contentFormat: 'markdown',
    content: `Páginas importadas de **${fileName}**. Puedes arrastrarlas a otro lugar del árbol.`,
  });
  created.push({ entityType: 'page', entityId: root.id });
  // Carpeta (ruta sin extensión) → página, para colgar las subpáginas.
  const folderToPage = new Map<string, string>();
  let attachmentCount = 0;

  const parentFor = (filePath: string): string => {
    const dir = path.posix.dirname(filePath);
    if (dir === '.' || dir === '') return root.id;
    const existing = folderToPage.get(dir);
    if (existing) return existing;
    // Carpeta sin página propia (p. ej. las filas de una base de datos): se crea una contenedora.
    const page = createPage(ctx, {
      title: cleanNotionName(path.posix.basename(dir)) || 'Sin título',
      parentId: parentFor(dir),
      contentFormat: 'markdown',
      content: '',
    });
    created.push({ entityType: 'page', entityId: page.id });
    folderToPage.set(dir, page.id);
    return page.id;
  };

  for (const file of mdFiles) {
    let md = files
      .get(file)!
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');
    let title = cleanNotionName(path.posix.basename(file));
    const h1 = /^#\s+(.+)\n?/.exec(md);
    if (h1) {
      title = h1[1]!.trim();
      md = md.slice(h1[0].length).replace(/^\n+/, '');
    }
    const page = createPage(ctx, {
      title: title.slice(0, 500),
      parentId: parentFor(file),
      contentFormat: 'markdown',
      content: '',
    });
    created.push({ entityType: 'page', entityId: page.id });
    folderToPage.set(folderKey(file), page.id);

    // Imágenes y archivos locales → adjuntos de la página; enlaces a otras páginas → texto.
    const dir = path.posix.dirname(file);
    const replacements: [string, string][] = [];
    for (const m of md.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const [whole, bang, text, target] = m;
      if (/^[a-z]+:/i.test(target!) || target!.startsWith('#')) continue;
      const rel = path.posix.normalize(
        path.posix.join(dir === '.' ? '' : dir, safeDecode(target!)),
      );
      if (rel.toLowerCase().endsWith('.md') || rel.toLowerCase().endsWith('.csv')) {
        replacements.push([whole!, text || cleanNotionName(path.posix.basename(rel))]);
        continue;
      }
      const data = files.get(toNFC(rel));
      if (!data) continue;
      const att = await saveAttachment(ctx, {
        fileName: path.posix.basename(rel),
        mimeType: MIME[path.posix.extname(rel).toLowerCase()] ?? 'application/octet-stream',
        source: data,
        entityType: 'page',
        entityId: page.id,
      });
      attachmentCount++;
      const url = `./api/attachments/${att.id}/content`;
      replacements.push([whole!, `${bang}[${text || att.fileName}](${url})`]);
    }
    for (const [from, to] of replacements) md = md.split(from).join(to);
    if (md.trim()) updatePage(ctx, page.id, { content: md, contentFormat: 'markdown' });
  }

  // Bases de datos: si existe «X_all.csv» se prefiere a «X.csv» (incluye todas las filas).
  const chosen = new Map<string, string>();
  for (const f of csvFiles) {
    const key = folderKey(f);
    if (!chosen.has(key) || /_all\.csv$/i.test(f)) chosen.set(key, f);
  }
  let tableCount = 0;
  for (const f of chosen.values()) {
    const tables = await importTables(
      ctx,
      `${cleanNotionName(path.posix.basename(f))}.csv`,
      files.get(f)!,
    );
    for (const t of tables) {
      created.push({ entityType: 'custom_table', entityId: t.id });
      tableCount++;
    }
  }
  const batchId = recordImportBatch(ctx, 'Notion', fileName, created);
  logActivity(ctx, {
    entityType: 'page',
    entityId: root.id,
    action: 'importar',
    summary: `Notion importado: ${created.filter((c) => c.entityType === 'page').length - 1} páginas y ${tableCount} tablas`,
  });
  return {
    rootPageId: root.id,
    pages: created.filter((c) => c.entityType === 'page').length - 1,
    tables: tableCount,
    attachments: attachmentCount,
    batchId,
  };
}

/** Importa un archivo Markdown suelto como página nueva. */
export function importMarkdownPage(
  ctx: AppContext,
  fileName: string,
  text: string,
  parentId: string | null,
) {
  let md = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  let title = cleanNotionName(fileName.replace(/\.(md|markdown|txt)$/i, ''));
  const h1 = /^#\s+(.+)\n?/.exec(md);
  if (h1) {
    title = h1[1]!.trim();
    md = md.slice(h1[0].length).replace(/^\n+/, '');
  }
  return createPage(ctx, { title, parentId, contentFormat: 'markdown', content: md });
}

export async function notionRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.post('/api/import/notion', async (req) => {
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    const buffer = await part.toBuffer();
    return importNotion(ctx, part.filename, buffer);
  });

  app.post('/api/import/markdown', async (req, reply) => {
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    const fields = part.fields as Record<string, { value?: string } | undefined>;
    const parentId = parse(z.string().max(64).nullish(), fields.parentId?.value || null) ?? null;
    const buffer = await part.toBuffer();
    if (buffer.length > 20 * 1024 * 1024)
      throw new ValidationError('El archivo es demasiado grande.');
    reply.code(201);
    return importMarkdownPage(ctx, part.filename, buffer.toString('utf8'), parentId);
  });
}
