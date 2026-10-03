import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cleanSegmentText,
  corpusImportCommitSchema,
  hasHangul,
  normalizeForSearch,
  type CorpusImportPreview,
  type CorpusImportResult,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { kickAnalysis } from '../../services/morph';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { readSheets, type Sheet } from '../../lib/tabular';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { recordImportBatch } from '../import';
import { ensureProfile, indexDocument } from './catalog';

interface PendingFile {
  fileName: string;
  sheets: Sheet[];
  createdAt: number;
}

/** Archivos leídos pendientes de confirmar (se descartan a la hora). */
const pending = new Map<string, PendingFile>();

const LANG_ALIASES: Record<string, string[]> = {
  ko: [
    'ko',
    'kor',
    'korean',
    'coreano',
    '한국어',
    'kr',
    'ko-kr',
    'ko_kr',
    '원문',
    'source',
    'origen',
    'texto origen',
  ],
  es: [
    'es',
    'spa',
    'spanish',
    'español',
    'espanol',
    'es-es',
    'es_es',
    '스페인어',
    'target',
    'destino',
    'traducción',
    'traduccion',
  ],
  en: ['en', 'eng', 'english', 'inglés', 'ingles', 'en-us', 'en_us', 'en-gb', '영어'],
  ja: ['ja', 'jp', 'jpn', 'japanese', 'japonés', 'japones', '일본어'],
  zh: ['zh', 'chi', 'chinese', 'chino', 'zh-cn', 'zh-tw', '중국어'],
};
const FIELD_ALIASES: Record<'stringId' | 'speaker' | 'context', string[]> = {
  stringId: [
    'id',
    'string id',
    'stringid',
    'string_id',
    'key',
    'clave',
    'identificador',
    'texto id',
    '키',
    '스트링 id',
  ],
  speaker: ['speaker', 'hablante', 'personaje', 'character', '화자', '캐릭터', 'npc'],
  context: [
    'context',
    'contexto',
    'comment',
    'comentario',
    'comentarios',
    'description',
    'descripción',
    'descripcion',
    '설명',
    'note',
    'notes',
    'notas',
  ],
};

function suggest(headers: string[]): CorpusImportPreview['suggested'] & { headerIsData: boolean } {
  const norm = headers.map((h) => normalizeForSearch(h));
  const find = (aliases: string[]) => {
    const keys = aliases.map((a) => normalizeForSearch(a));
    const i = norm.findIndex((h) => keys.includes(h));
    return i < 0 ? null : i;
  };
  const languages: Record<string, number> = {};
  for (const [lang, aliases] of Object.entries(LANG_ALIASES)) {
    const i = find(aliases);
    if (i != null) languages[lang] = i;
  }
  const headerIsData = Object.keys(languages).length === 0;
  if (headerIsData) {
    // Sin cabeceras reconocibles: columna A = coreano, B = español.
    languages.ko = 0;
    if (headers.length > 1) languages.es = 1;
  }
  return {
    languages,
    stringId: headerIsData ? null : find(FIELD_ALIASES.stringId),
    speaker: headerIsData ? null : find(FIELD_ALIASES.speaker),
    context: headerIsData ? null : find(FIELD_ALIASES.context),
    headerIsData: headerIsData && headers.some((h) => hasHangul(h) || h.length > 25),
  };
}

export async function previewCorpusFile(
  fileName: string,
  buffer: Buffer,
): Promise<CorpusImportPreview & { headerIsData: boolean }> {
  const sheets = await readSheets(fileName, buffer);
  const token = newId();
  const limit = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of pending) if (v.createdAt < limit) pending.delete(k);
  pending.set(token, { fileName, sheets, createdAt: Date.now() });
  const s = suggest(sheets[0]!.headers);
  return {
    token,
    fileName,
    sheets: sheets.map((sh) => ({
      name: sh.name,
      headers: sh.headers,
      sample: sh.rows.slice(0, 8),
      rowCount: sh.rows.length,
    })),
    suggested: {
      languages: s.languages,
      stringId: s.stringId,
      speaker: s.speaker,
      context: s.context,
    },
    headerIsData: s.headerIsData,
  };
}

export function commitCorpusImport(ctx: AppContext, raw: unknown): CorpusImportResult {
  const input = parse(
    corpusImportCommitSchema.and(z.object({ headerIsData: z.boolean().default(false) })),
    raw,
  );
  const file = pending.get(input.token);
  if (!file) throw new ValidationError('El archivo ya no está disponible. Vuelve a subirlo.');
  const sheet = file.sheets[input.sheet];
  if (!sheet) throw new NotFoundError('La hoja');
  const game = ctx.sqlite
    .prepare('SELECT 1 FROM games WHERE id = ? AND deleted_at IS NULL')
    .get(input.gameId);
  if (!game) throw new NotFoundError('El juego');
  const rows = input.headerIsData
    ? [sheet.headers.map((h) => (/^Columna \d+( \(\d+\))?$/.test(h) ? '' : h)), ...sheet.rows]
    : sheet.rows;
  const langs = Object.entries(input.languages);
  const width = sheet.headers.length;
  for (const [, col] of langs)
    if (col >= width) throw new ValidationError('Columna de texto no válida.');

  const result: CorpusImportResult = {
    documentId: '',
    segments: 0,
    skippedEmpty: 0,
    misaligned: 0,
    duplicates: 0,
    markupRemoved: 0,
    variablesFound: 0,
  };
  const cell = (r: string[], i: number | null | undefined) =>
    i == null ? null : (r[i] ?? '').trim() || null;
  const seen = new Set<string>();
  const documentId = newId();
  const now = ctx.nowISO();

  ctx.sqlite.transaction(() => {
    ensureProfile(ctx, input.gameId);
    ctx.sqlite
      .prepare(
        `INSERT INTO corpus_documents (id, game_id, title, text_type, source_file, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        documentId,
        input.gameId,
        input.title,
        input.textType,
        `${file.fileName}${file.sheets.length > 1 ? ` · ${sheet.name}` : ''}`,
        now,
        now,
      );
    const insertSeg = ctx.sqlite.prepare(
      'INSERT INTO segments (document_id, position, string_id, speaker, context, text_type) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertText = ctx.sqlite.prepare(
      'INSERT INTO segment_texts (segment_id, lang, text) VALUES (?, ?, ?)',
    );
    let position = 0;
    for (const r of rows) {
      const texts: [string, string][] = [];
      for (const [lang, col] of langs) {
        const c = cleanSegmentText(r[col] ?? '', input.options);
        result.markupRemoved += c.markupRemoved;
        result.variablesFound += c.variables;
        if (c.text) texts.push([lang, c.text]);
      }
      if (texts.length === 0) {
        result.skippedEmpty++;
        continue;
      }
      if (langs.length > 1 && texts.length < langs.length) {
        result.misaligned++;
        if (input.options.skipMisaligned) continue;
      }
      const key = texts.map(([l, t]) => `${l}:${t}`).join('\u0001');
      if (seen.has(key)) {
        result.duplicates++;
        if (input.options.skipDuplicates) continue;
      }
      seen.add(key);
      const seg = insertSeg.run(
        documentId,
        ++position,
        cell(r, input.stringId),
        cell(r, input.speaker),
        cell(r, input.context),
        cell(r, input.textTypeColumn),
      );
      for (const [lang, text] of texts) insertText.run(seg.lastInsertRowid, lang, text);
      result.segments++;
    }
    if (result.segments === 0)
      throw new ValidationError('No hay ningún texto que importar en las columnas elegidas.');
    // Los idiomas del documento se añaden a la ficha del juego.
    const profile = ctx.sqlite
      .prepare('SELECT languages FROM corpus_profiles WHERE game_id = ?')
      .get(input.gameId) as { languages: string };
    const current = new Set(JSON.parse(profile.languages) as string[]);
    for (const [lang] of langs) current.add(lang);
    ctx.sqlite
      .prepare('UPDATE corpus_profiles SET languages = ?, updated_at = ? WHERE game_id = ?')
      .run(JSON.stringify([...current]), now, input.gameId);
  })();

  pending.delete(input.token);
  result.documentId = documentId;
  indexDocument(ctx, documentId);
  recordImportBatch(ctx, 'Corpus', file.fileName, [
    { entityType: 'corpus_document', entityId: documentId },
  ]);
  logActivity(ctx, {
    entityType: 'corpus_document',
    entityId: documentId,
    action: 'importar',
    summary: `Textos importados al corpus: «${input.title}» (${result.segments} segmentos)`,
  });
  return result;
}

export async function corpusImportRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.post('/api/corpus/import/preview', async (req) => {
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    return previewCorpusFile(part.filename, await part.toBuffer());
  });

  app.post('/api/corpus/import/commit', async (req) => {
    const result = commitCorpusImport(ctx, req.body);
    // Si el analizador del coreano está instalado, los textos nuevos se analizan en segundo plano.
    kickAnalysis(ctx);
    return result;
  });
}
