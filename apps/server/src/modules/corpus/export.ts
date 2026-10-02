import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import yazl from 'yazl';
import { z } from 'zod';
import {
  CORPUS_TEXT_TYPES,
  corpusFiltersSchema,
  formatDateES,
  formatNumber,
  idSchema,
  labelOf,
  langLabel,
  todayISO,
  type CorpusExportFormat,
  type CorpusFilters,
  type CorpusStats,
  type CorpusVersion,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { ensureDir, safeFileName } from '../../lib/fs';
import { newId } from '../../lib/ids';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { saveAttachment } from '../../services/attachments';
import { moveToTrash } from '../../services/trash';
import { contentDisposition } from '../attachments';
import { CORPUS_JOINS, filterSql } from './filters';
import { corpusStats, parseFilters } from './stats';

export interface ExportSegment {
  id: number;
  gameTitle: string;
  documentTitle: string;
  textType: string;
  stringId: string | null;
  speaker: string | null;
  context: string | null;
  texts: Record<string, string>;
}

/** Recorre los segmentos del subcorpus en orden (juego, documento, posición). */
export function* iterateSegments(
  ctx: AppContext,
  filters: CorpusFilters,
): Generator<ExportSegment> {
  const f = filterSql(ctx, filters);
  const where = f.where.length ? `WHERE ${f.where.join(' AND ')}` : '';
  const sql = `SELECT s.id, g.title AS gameTitle, d.title AS documentTitle, coalesce(s.text_type, d.text_type) AS textType,
      s.string_id AS stringId, s.speaker, s.context, st.lang, st.text
    FROM segments s ${CORPUS_JOINS} JOIN segment_texts st ON st.segment_id = s.id
    ${where} ORDER BY lower(g.title), d.created_at, d.id, s.position, s.id`;
  let current: ExportSegment | null = null;
  for (const r of ctx.sqlite.prepare(sql).iterate(...f.params) as Iterable<
    ExportSegment & { lang: string; text: string }
  >) {
    if (!current || current.id !== r.id) {
      if (current) yield current;
      current = {
        id: r.id,
        gameTitle: r.gameTitle,
        documentTitle: r.documentTitle,
        textType: r.textType,
        stringId: r.stringId,
        speaker: r.speaker,
        context: r.context,
        texts: {},
      };
    }
    current.texts[r.lang] = r.text;
  }
  if (current) yield current;
}

const XML_LANG: Record<string, string> = {
  ko: 'ko-KR',
  es: 'es-ES',
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
  it: 'it-IT',
};
// XML 1.0 no admite caracteres de control (salvo tabulador y saltos de línea): se eliminan.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(CONTROL_RE, '');

function presentLanguages(ctx: AppContext, filters: CorpusFilters): string[] {
  const f = filterSql(ctx, filters);
  const where = f.where.length ? `WHERE ${f.where.join(' AND ')}` : '';
  return (
    ctx.sqlite
      .prepare(
        `SELECT st.lang, COUNT(*) AS n FROM segment_texts st JOIN segments s ON s.id = st.segment_id ${CORPUS_JOINS} ${where} GROUP BY st.lang ORDER BY n DESC`,
      )
      .all(...f.params) as { lang: string }[]
  ).map((r) => r.lang);
}

/** Escribe un flujo de texto a disco respetando la contrapresión. */
async function writeLines(file: string, lines: Iterable<string>): Promise<void> {
  const out = fs.createWriteStream(file, { encoding: 'utf8' });
  for (const line of lines) {
    if (!out.write(line)) await new Promise<void>((r) => out.once('drain', () => r()));
  }
  await new Promise<void>((resolve, reject) =>
    out.end((err?: Error | null) => (err ? reject(err) : resolve())),
  );
}

function* tmxLines(
  ctx: AppContext,
  filters: CorpusFilters,
  langs: string[],
  meta: { name: string },
): Generator<string> {
  const src = langs[0] ?? 'ko';
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tmx SYSTEM "tmx14.dtd">\n<tmx version="1.4">\n';
  yield `  <header creationtool="L10N Suite" creationtoolversion="1" datatype="plaintext" segtype="sentence" adminlang="es-ES" srclang="${XML_LANG[src] ?? src}" o-tmf="L10N Suite" creationdate="${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z">\n`;
  yield `    <prop type="x-corpus">${xml(meta.name)}</prop>\n  </header>\n  <body>\n`;
  for (const s of iterateSegments(ctx, filters)) {
    const tuvs = langs.filter((l) => s.texts[l]);
    if (tuvs.length < 2 && langs.length > 1) continue;
    let tu = `    <tu tuid="${s.id}">\n      <prop type="x-game">${xml(s.gameTitle)}</prop>\n      <prop type="x-document">${xml(s.documentTitle)}</prop>\n      <prop type="x-text-type">${xml(s.textType)}</prop>\n`;
    if (s.stringId) tu += `      <prop type="x-string-id">${xml(s.stringId)}</prop>\n`;
    if (s.speaker) tu += `      <prop type="x-speaker">${xml(s.speaker)}</prop>\n`;
    for (const l of tuvs)
      tu += `      <tuv xml:lang="${XML_LANG[l] ?? l}"><seg>${xml(s.texts[l]!)}</seg></tuv>\n`;
    yield `${tu}    </tu>\n`;
  }
  yield '  </body>\n</tmx>\n';
}

function columnsFor(langs: string[]) {
  return [
    { header: 'Juego', key: 'game', width: 24 },
    { header: 'Documento', key: 'doc', width: 22 },
    { header: 'Tipo de texto', key: 'type', width: 16 },
    { header: 'ID de cadena', key: 'sid', width: 18 },
    { header: 'Hablante', key: 'speaker', width: 14 },
    { header: 'Contexto', key: 'context', width: 24 },
    ...langs.map((l) => ({ header: langLabel(l), key: `t_${l}`, width: 50 })),
  ];
}

function record(s: ExportSegment, langs: string[]) {
  return {
    game: s.gameTitle,
    doc: s.documentTitle,
    type: labelOf(CORPUS_TEXT_TYPES, s.textType as never) || s.textType,
    sid: s.stringId ?? '',
    speaker: s.speaker ?? '',
    context: s.context ?? '',
    ...Object.fromEntries(langs.map((l) => [`t_${l}`, s.texts[l] ?? ''])),
  };
}

async function zipFiles(files: { file: string; name: string }[], target: string): Promise<void> {
  const zip = new yazl.ZipFile();
  for (const f of files) zip.addFile(f.file, f.name);
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(target));
}

/**
 * Genera la exportación en la carpeta temporal. Devuelve la ruta del archivo; quien la usa
 * debe borrarla después.
 */
export async function exportCorpus(
  ctx: AppContext,
  format: CorpusExportFormat,
  filters: CorpusFilters,
  opts: { langs?: string[]; name?: string } = {},
): Promise<{ file: string; name: string; type: string }> {
  const langs = opts.langs?.length ? opts.langs : presentLanguages(ctx, filters);
  if (!langs.length) throw new ValidationError('No hay textos en el corpus con estos filtros.');
  const name = opts.name ?? `Corpus ${todayISO(ctx.now())}`;
  const dir = path.join(ctx.config.tmpDir, `corpus-${newId()}`);
  ensureDir(dir);
  const base = safeFileName(name);
  try {
    if (format === 'tmx') {
      const file = path.join(dir, `${base}.tmx`);
      await writeLines(file, tmxLines(ctx, filters, langs, { name }));
      return { file, name: `${base}.tmx`, type: 'application/x-tmx+xml' };
    }
    if (format === 'txt') {
      // Un archivo por idioma (un segmento por línea) y, dentro de cada idioma, uno por juego.
      const outs = new Map<string, fs.WriteStream>();
      const entries: { file: string; name: string }[] = [];
      const open = (key: string, zipName: string) => {
        let s = outs.get(key);
        if (!s) {
          const file = path.join(dir, `${outs.size}.txt`);
          s = fs.createWriteStream(file, { encoding: 'utf8' });
          outs.set(key, s);
          entries.push({ file, name: zipName });
        }
        return s;
      };
      for (const seg of iterateSegments(ctx, filters)) {
        for (const l of langs) {
          const t = seg.texts[l];
          if (!t) continue;
          const line = `${t.replace(/\s*\n\s*/g, ' ')}\n`;
          const all = open(`all:${l}`, `${base}-${l}.txt`);
          if (!all.write(line)) await new Promise<void>((r) => all.once('drain', () => r()));
          const byGame = open(`${l}:${seg.gameTitle}`, `${l}/${safeFileName(seg.gameTitle)}.txt`);
          if (!byGame.write(line)) await new Promise<void>((r) => byGame.once('drain', () => r()));
        }
      }
      await Promise.all([...outs.values()].map((s) => new Promise<void>((r) => s.end(() => r()))));
      const target = path.join(dir, `${base}-txt.zip`);
      await zipFiles(entries, target);
      return { file: target, name: `${base}-txt.zip`, type: 'application/zip' };
    }
    if (format === 'xlsx') {
      const file = path.join(dir, `${base}.xlsx`);
      const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useStyles: true });
      const ws = wb.addWorksheet('Corpus');
      ws.columns = columnsFor(langs);
      ws.getRow(1).font = { bold: true };
      for (const s of iterateSegments(ctx, filters)) ws.addRow(record(s, langs)).commit();
      ws.commit();
      await wb.commit();
      return {
        file,
        name: `${base}.xlsx`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (format === 'csv') {
      const file = path.join(dir, `${base}.csv`);
      const cols = columnsFor(langs);
      function* lines() {
        yield `\uFEFF${Papa.unparse({ fields: cols.map((c) => c.header), data: [] })}\r\n`;
        for (const s of iterateSegments(ctx, filters)) {
          const r = record(s, langs) as Record<string, string>;
          yield `${Papa.unparse([cols.map((c) => r[c.key] ?? '')])}\r\n`;
        }
      }
      await writeLines(file, lines());
      return { file, name: `${base}.csv`, type: 'text/csv; charset=utf-8' };
    }
    const file = path.join(dir, `${base}.json`);
    function* json() {
      yield '[\n';
      let first = true;
      for (const s of iterateSegments(ctx, filters)) {
        yield `${first ? '' : ',\n'}${JSON.stringify({
          id: s.id,
          game: s.gameTitle,
          document: s.documentTitle,
          textType: s.textType,
          stringId: s.stringId,
          speaker: s.speaker,
          context: s.context,
          texts: s.texts,
        })}`;
        first = false;
      }
      yield '\n]\n';
    }
    await writeLines(file, json());
    return { file, name: `${base}.json`, type: 'application/json' };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function citation(name: string, date: string, stats: CorpusStats): string {
  const langs = stats.languages.map((l) => langLabel(l.lang).toLowerCase()).join('-');
  return `Corpus de videojuegos ${langs || 'multilingüe'}, versión ${name} (${formatDateES(date.slice(0, 10))}): ${formatNumber(stats.games, 0)} juegos, ${formatNumber(stats.documents, 0)} documentos y ${formatNumber(stats.segments, 0)} segmentos.`;
}

type VersionRow = Omit<CorpusVersion, 'stats' | 'filters' | 'citation'> & {
  stats: string;
  filters: string;
};

function decodeVersion(r: VersionRow): CorpusVersion {
  const stats = JSON.parse(r.stats) as CorpusStats;
  return {
    ...r,
    stats,
    filters: JSON.parse(r.filters) as CorpusFilters,
    citation: citation(r.name, r.createdAt, stats),
  };
}

export function listVersions(ctx: AppContext): CorpusVersion[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT v.id, v.name, v.description, v.stats, v.filters, v.created_at AS createdAt,
           CASE WHEN a.deleted_at IS NULL THEN v.attachment_id END AS attachmentId
         FROM corpus_versions v LEFT JOIN attachments a ON a.id = v.attachment_id
         ORDER BY v.created_at DESC`,
      )
      .all() as VersionRow[]
  ).map(decodeVersion);
}

/** Crea una versión fechada: estadísticas y un ZIP con TMX, TXT, CSV y el manifiesto. */
export async function createVersion(
  ctx: AppContext,
  input: { name: string; description: string | null; filters: CorpusFilters },
): Promise<CorpusVersion> {
  const stats = corpusStats(ctx, input.filters);
  if (stats.segments === 0) throw new ValidationError('No hay segmentos con estos filtros.');
  const id = newId();
  const now = ctx.nowISO();
  const parts: { file: string; name: string }[] = [];
  const cleanup: string[] = [];
  try {
    for (const format of ['tmx', 'txt', 'csv'] as const) {
      const out = await exportCorpus(ctx, format, input.filters, { name: `Corpus ${input.name}` });
      parts.push({ file: out.file, name: out.name });
      cleanup.push(path.dirname(out.file));
    }
    const manifestFile = path.join(ctx.config.tmpDir, `manifiesto-${id}.json`);
    fs.writeFileSync(
      manifestFile,
      JSON.stringify(
        {
          name: input.name,
          description: input.description,
          createdAt: now,
          filters: input.filters,
          stats,
          citation: citation(input.name, now, stats),
        },
        null,
        2,
      ),
    );
    cleanup.push(manifestFile);
    parts.push({ file: manifestFile, name: 'manifiesto.json' });
    const zipPath = path.join(ctx.config.tmpDir, `version-${id}.zip`);
    cleanup.push(zipPath);
    await zipFiles(parts, zipPath);
    const att = await saveAttachment(ctx, {
      fileName: `${safeFileName(`Corpus ${input.name}`)}.zip`,
      mimeType: 'application/zip',
      source: fs.createReadStream(zipPath),
      entityType: 'corpus_version',
      entityId: id,
    });
    ctx.sqlite
      .prepare(
        'INSERT INTO corpus_versions (id, name, description, stats, filters, attachment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.name,
        input.description,
        JSON.stringify(stats),
        JSON.stringify(input.filters),
        att.id,
        now,
        now,
      );
  } finally {
    for (const p of cleanup) fs.rmSync(p, { recursive: true, force: true });
  }
  logActivity(ctx, {
    entityType: 'corpus_version',
    entityId: id,
    action: 'crear',
    summary: `Versión del corpus «${input.name}» creada`,
  });
  return listVersions(ctx).find((v) => v.id === id)!;
}

export async function exportRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/corpus/export', async (req, reply) => {
    const q = parse(
      z.object({
        format: z.enum(['tmx', 'txt', 'xlsx', 'csv', 'json']).default('tmx'),
        filters: z.string().optional(),
        langs: z.string().optional(),
      }),
      req.query,
    );
    const out = await exportCorpus(ctx, q.format, parseFilters(q.filters), {
      langs: q.langs?.split(',').filter(Boolean),
    });
    const stream = fs.createReadStream(out.file);
    stream.on('close', () => fs.rmSync(path.dirname(out.file), { recursive: true, force: true }));
    reply.type(out.type).header('Content-Disposition', contentDisposition('attachment', out.name));
    return reply.send(stream);
  });

  app.get('/api/corpus/versions', async () => listVersions(ctx));

  app.post('/api/corpus/versions', async (req, reply) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(1, 'Ponle un nombre (p. ej., v0.3)').max(60),
        description: z.string().max(2000).nullish(),
        filters: corpusFiltersSchema,
      }),
      req.body,
    );
    if (ctx.sqlite.prepare('SELECT 1 FROM corpus_versions WHERE name = ?').get(input.name)) {
      throw new ValidationError(`Ya existe una versión «${input.name}».`);
    }
    reply.code(201);
    return createVersion(ctx, {
      name: input.name,
      description: input.description ?? null,
      filters: input.filters,
    });
  });

  app.delete('/api/corpus/versions/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    const row = ctx.sqlite
      .prepare('SELECT attachment_id AS a FROM corpus_versions WHERE id = ?')
      .get(id) as { a: string | null } | undefined;
    if (!row) throw new NotFoundError('La versión');
    ctx.sqlite.prepare('DELETE FROM corpus_versions WHERE id = ?').run(id);
    if (row.a) {
      try {
        moveToTrash(ctx, 'attachment', row.a);
      } catch {
        /* el adjunto ya no existe */
      }
    }
    return { ok: true };
  });
}
