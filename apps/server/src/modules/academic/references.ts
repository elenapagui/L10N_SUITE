import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  apaHtml,
  apaText,
  collectionInputSchema,
  compareApa,
  creatorsLabel,
  cslYear,
  duplicateKey,
  idSchema,
  makeCitationKey,
  normalizeDoi,
  parseBibtex,
  parseRis,
  quoteInputSchema,
  quoteUpdateSchema,
  referenceInputSchema,
  referenceTypeLabel,
  referenceUpdateSchema,
  toBibtex,
  toRis,
  toNFC,
  type CslItem,
  type Reference,
  type ReferenceCollection,
  type ReferenceImportResult,
  type ReferenceQuote,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { saveAttachment } from '../../services/attachments';
import { indexEntity, searchIndex } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { contentDisposition } from '../attachments';
import { recordImportBatch } from '../import';

const MAX_FULLTEXT = 2_000_000;

type Row = {
  id: string;
  csl: string;
  type: string;
  title: string;
  creators: string;
  year: number | null;
  container: string | null;
  doi: string | null;
  citationKey: string;
  readStatus: Reference['readStatus'];
  rating: number;
  notes: string | null;
  pdfAttachmentId: string | null;
  hasFullText: number;
  quoteCount: number;
  collectionIds: string;
  gameIds: string;
  publicationIds: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT = `SELECT r.id, r.csl, r.type, r.title, r.creators, r.year, r.container, r.doi, r.citation_key AS citationKey,
  r.read_status AS readStatus, r.rating, r.notes,
  CASE WHEN a.deleted_at IS NULL THEN r.pdf_attachment_id END AS pdfAttachmentId,
  (r.full_text IS NOT NULL AND r.full_text <> '') AS hasFullText,
  (SELECT COUNT(*) FROM reference_quotes q WHERE q.reference_id = r.id) AS quoteCount,
  (SELECT json_group_array(ci.collection_id) FROM reference_collection_items ci WHERE ci.reference_id = r.id) AS collectionIds,
  (SELECT json_group_array(rg.game_id) FROM reference_games rg WHERE rg.reference_id = r.id) AS gameIds,
  (SELECT json_group_array(pr.publication_id) FROM publication_references pr JOIN publications p ON p.id = pr.publication_id
     WHERE pr.reference_id = r.id AND p.deleted_at IS NULL) AS publicationIds,
  r.created_at AS createdAt, r.updated_at AS updatedAt
  FROM bib_references r LEFT JOIN attachments a ON a.id = r.pdf_attachment_id`;

const ids = (v: string) => {
  try {
    return (JSON.parse(v) as (string | null)[]).filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
};

function decode(r: Row): Reference {
  const csl = JSON.parse(r.csl) as CslItem;
  return {
    ...r,
    csl,
    hasFullText: r.hasFullText === 1,
    collectionIds: ids(r.collectionIds),
    gameIds: ids(r.gameIds),
    publicationIds: ids(r.publicationIds),
    apa: apaText(csl),
    apaHtml: apaHtml(csl),
  };
}

export function getReference(ctx: AppContext, id: string): Reference {
  const row = ctx.sqlite.prepare(`${SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`).get(id) as
    Row | undefined;
  if (!row) throw new NotFoundError('La referencia');
  return decode(row);
}

export function listReferences(
  ctx: AppContext,
  f: {
    q?: string;
    collectionId?: string;
    readStatus?: string;
    gameId?: string;
    publicationId?: string;
    ids?: string[];
  },
): Reference[] {
  const where = ['r.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.q?.trim()) {
    const hits = searchIndex(ctx, f.q, { entityTypes: ['reference'], limit: 2000 }).map(
      (h) => h.entityId,
    );
    if (!hits.length) return [];
    where.push(`r.id IN (${hits.map(() => '?').join(',')})`);
    params.push(...hits);
  }
  if (f.ids) {
    if (!f.ids.length) return [];
    where.push(`r.id IN (${f.ids.map(() => '?').join(',')})`);
    params.push(...f.ids);
  }
  if (f.collectionId) {
    where.push(
      'EXISTS (SELECT 1 FROM reference_collection_items ci WHERE ci.reference_id = r.id AND ci.collection_id = ?)',
    );
    params.push(f.collectionId);
  }
  if (f.readStatus) {
    where.push('r.read_status = ?');
    params.push(f.readStatus);
  }
  if (f.gameId) {
    where.push(
      'EXISTS (SELECT 1 FROM reference_games rg WHERE rg.reference_id = r.id AND rg.game_id = ?)',
    );
    params.push(f.gameId);
  }
  if (f.publicationId) {
    where.push(
      'EXISTS (SELECT 1 FROM publication_references pr WHERE pr.reference_id = r.id AND pr.publication_id = ?)',
    );
    params.push(f.publicationId);
  }
  return (
    ctx.sqlite
      .prepare(
        `${SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(r.creators), r.year, lower(r.title)`,
      )
      .all(...params) as Row[]
  ).map(decode);
}

function indexReference(ctx: AppContext, id: string): void {
  const row = ctx.sqlite
    .prepare('SELECT csl, notes, full_text AS fullText FROM bib_references WHERE id = ?')
    .get(id) as { csl: string; notes: string | null; fullText: string | null } | undefined;
  if (!row) return;
  const csl = JSON.parse(row.csl) as CslItem;
  const quotes = (
    ctx.sqlite
      .prepare('SELECT text, comment FROM reference_quotes WHERE reference_id = ?')
      .all(id) as { text: string; comment: string | null }[]
  )
    .map((q) => `${q.text} ${q.comment ?? ''}`)
    .join(' ');
  indexEntity(ctx, {
    entityType: 'reference',
    entityId: id,
    title: csl.title || 'Sin título',
    subtitle: [referenceTypeLabel(csl.type), creatorsLabel(csl), cslYear(csl.issued)]
      .filter(Boolean)
      .join(' · '),
    text: [
      (csl.author ?? [])
        .map((n) => `${n.given ?? ''} ${n.family ?? ''} ${n.literal ?? ''}`)
        .join(' '),
      csl['container-title'],
      csl.abstract,
      csl.keyword,
      csl.DOI,
      row.notes,
      quotes,
      row.fullText?.slice(0, 500_000),
    ]
      .filter(Boolean)
      .join(' '),
  });
}

function clean(csl: CslItem): CslItem {
  const out: CslItem = { ...csl };
  delete out.id;
  for (const k of ['title', 'container-title', 'abstract', 'publisher'] as const) {
    const v = out[k];
    if (Array.isArray(v)) out[k] = v[0] as never;
    if (typeof out[k] === 'string')
      out[k] = toNFC(
        (out[k] as string)
          .replace(/<\/?[a-zA-Z][\w:.-]*(?:\s[^<>]*)?>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      ) as never;
  }
  if (Array.isArray(out.ISSN)) out.ISSN = (out.ISSN as string[])[0];
  if (Array.isArray(out.ISBN)) out.ISBN = (out.ISBN as string[])[0];
  const doi = normalizeDoi(out.DOI);
  if (doi) out.DOI = doi;
  else delete out.DOI;
  return out;
}

function derived(csl: CslItem) {
  return {
    type: csl.type,
    title: csl.title ?? '',
    creators: creatorsLabel(csl),
    year: cslYear(csl.issued),
    container: csl['container-title'] ?? null,
    doi: csl.DOI ?? null,
    dedupe: duplicateKey(csl),
  };
}

function uniqueKey(ctx: AppContext, base: string, exceptId?: string): string {
  let key = base;
  for (let i = 2; ; i++) {
    const row = ctx.sqlite
      .prepare('SELECT id FROM bib_references WHERE citation_key = ? AND deleted_at IS NULL')
      .get(key) as { id: string } | undefined;
    if (!row || row.id === exceptId) return key;
    key = `${base}${String.fromCharCode(96 + i)}`;
  }
}

function setLinks(ctx: AppContext, refId: string, collectionIds?: string[], gameIds?: string[]) {
  if (collectionIds) {
    ctx.sqlite.prepare('DELETE FROM reference_collection_items WHERE reference_id = ?').run(refId);
    const ins = ctx.sqlite.prepare(
      'INSERT OR IGNORE INTO reference_collection_items (collection_id, reference_id) SELECT id, ? FROM reference_collections WHERE id = ?',
    );
    for (const c of collectionIds) ins.run(refId, c);
  }
  if (gameIds) {
    ctx.sqlite.prepare('DELETE FROM reference_games WHERE reference_id = ?').run(refId);
    const ins = ctx.sqlite.prepare(
      'INSERT OR IGNORE INTO reference_games (reference_id, game_id) SELECT ?, id FROM games WHERE id = ? AND deleted_at IS NULL',
    );
    for (const g of gameIds) ins.run(refId, g);
  }
}

export function createReference(ctx: AppContext, raw: unknown): Reference {
  const input = parse(referenceInputSchema, raw);
  const csl = clean(input.csl);
  const d = derived(csl);
  const id = newId();
  const now = ctx.nowISO();
  const key = uniqueKey(ctx, (csl['citation-key'] as string | undefined) || makeCitationKey(csl));
  ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare(
        `INSERT INTO bib_references (id, csl, type, title, creators, year, container, doi, citation_key, dedupe_key,
           read_status, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        JSON.stringify({ ...csl, 'citation-key': key }),
        d.type,
        d.title,
        d.creators,
        d.year,
        d.container,
        d.doi,
        key,
        d.dedupe,
        input.readStatus,
        input.rating,
        input.notes,
        now,
        now,
      );
    setLinks(ctx, id, input.collectionIds, input.gameIds);
  })();
  indexReference(ctx, id);
  return getReference(ctx, id);
}

export function updateReference(ctx: AppContext, id: string, raw: unknown): Reference {
  const before = getReference(ctx, id);
  const patch = parse(referenceUpdateSchema, raw);
  ctx.sqlite.transaction(() => {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.csl) {
      const csl = clean(patch.csl);
      const d = derived(csl);
      const key = uniqueKey(
        ctx,
        (csl['citation-key'] as string | undefined) || makeCitationKey(csl),
        id,
      );
      sets.push(
        'csl = ?',
        'type = ?',
        'title = ?',
        'creators = ?',
        'year = ?',
        'container = ?',
        'doi = ?',
        'citation_key = ?',
        'dedupe_key = ?',
      );
      params.push(
        JSON.stringify({ ...csl, 'citation-key': key }),
        d.type,
        d.title,
        d.creators,
        d.year,
        d.container,
        d.doi,
        key,
        d.dedupe,
      );
    }
    if (patch.readStatus !== undefined) {
      sets.push('read_status = ?');
      params.push(patch.readStatus);
    }
    if (patch.rating !== undefined) {
      sets.push('rating = ?');
      params.push(patch.rating);
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length)
      ctx.sqlite
        .prepare(`UPDATE bib_references SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
    setLinks(ctx, id, patch.collectionIds, patch.gameIds);
  })();
  indexReference(ctx, id);
  const after = getReference(ctx, id);
  if (patch.readStatus === 'read' && before.readStatus !== 'read') {
    logActivity(ctx, {
      entityType: 'reference',
      entityId: id,
      action: 'estado',
      summary: `Lectura terminada: «${after.title || 'Sin título'}»`,
    });
  }
  return after;
}

/** Detecta el formato del texto: BibTeX, RIS o CSL-JSON. */
export function parseReferences(text: string): CslItem[] {
  const s = text.replace(/^\uFEFF/, '').trim();
  if (!s) return [];
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const data = JSON.parse(s) as unknown;
      const list = (Array.isArray(data) ? data : [data]) as CslItem[];
      return list.filter((x) => x && typeof x === 'object' && typeof x.type === 'string');
    } catch {
      throw new ValidationError('El JSON no es válido.');
    }
  }
  if (/^\s*TY\s{2}-/m.test(s)) return parseRis(s);
  if (s.includes('@')) return parseBibtex(s);
  throw new ValidationError('Formato no reconocido. Usa BibTeX (.bib), RIS (.ris) o CSL-JSON.');
}

export function importReferences(
  ctx: AppContext,
  items: CslItem[],
  opts: { fileName?: string | null; skipDuplicates?: boolean; collectionId?: string | null } = {},
): ReferenceImportResult {
  const existing = new Set(
    (
      ctx.sqlite
        .prepare('SELECT dedupe_key AS k FROM bib_references WHERE deleted_at IS NULL')
        .all() as { k: string }[]
    ).map((r) => r.k),
  );
  const created: string[] = [];
  let duplicates = 0;
  ctx.sqlite.transaction(() => {
    for (const raw of items) {
      const csl = clean(raw);
      const key = duplicateKey(csl);
      if (existing.has(key)) {
        duplicates++;
        if (opts.skipDuplicates !== false) continue;
      }
      existing.add(key);
      created.push(
        createReference(ctx, { csl, collectionIds: opts.collectionId ? [opts.collectionId] : [] })
          .id,
      );
    }
  })();
  const batchId = created.length
    ? recordImportBatch(
        ctx,
        'Bibliografía',
        opts.fileName ?? null,
        created.map((id) => ({ entityType: 'reference', entityId: id })),
      )
    : null;
  if (created.length) {
    logActivity(ctx, {
      entityType: 'reference',
      entityId: created[0]!,
      action: 'importar',
      summary: `${created.length} referencias importadas`,
    });
  }
  return { created: created.length, duplicates, ids: created, batchId };
}

/** Datos de un DOI desde doi.org (negociación de contenido: CSL-JSON). */
export async function lookupDoi(raw: string): Promise<CslItem> {
  const doi = normalizeDoi(raw);
  if (!doi) throw new ValidationError('El DOI no es válido (p. ej., 10.1234/abcd).');
  let res: Response;
  try {
    res = await fetch(`https://doi.org/${encodeURIComponent(doi).replace(/%2F/gi, '/')}`, {
      headers: { Accept: 'application/vnd.citationstyles.csl+json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ValidationError(
      'No se ha podido consultar doi.org. Comprueba la conexión a internet.',
    );
  }
  if (res.status === 404) throw new ValidationError('Ese DOI no existe en doi.org.');
  if (!res.ok) throw new ValidationError(`doi.org ha respondido con un error (${res.status}).`);
  let data: CslItem;
  try {
    data = (await res.json()) as CslItem;
  } catch {
    throw new ValidationError('doi.org no ha devuelto datos bibliográficos para ese DOI.');
  }
  if (!data || typeof data.type !== 'string')
    throw new ValidationError('doi.org no ha devuelto datos bibliográficos para ese DOI.');
  return clean({ ...data, DOI: doi });
}

export function exportReferences(
  items: Reference[],
  format: 'bibtex' | 'ris' | 'csljson' | 'apa',
): { body: string; type: string; ext: string } {
  const csl = items.map((r) => r.csl);
  if (format === 'bibtex')
    return { body: toBibtex(csl), type: 'application/x-bibtex; charset=utf-8', ext: 'bib' };
  if (format === 'ris')
    return {
      body: toRis(csl),
      type: 'application/x-research-info-systems; charset=utf-8',
      ext: 'ris',
    };
  if (format === 'csljson')
    return {
      body: JSON.stringify(
        csl.map((c, i) => ({ id: items[i]!.citationKey, ...c })),
        null,
        2,
      ),
      type: 'application/json',
      ext: 'json',
    };
  const sorted = [...csl].sort(compareApa);
  return {
    body: `${sorted.map(apaText).join('\n\n')}\n`,
    type: 'text/plain; charset=utf-8',
    ext: 'txt',
  };
}

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 } as never);
    const { text } = await extractText(pdf, { mergePages: true });
    const t = (Array.isArray(text) ? text.join('\n') : text).replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, MAX_FULLTEXT) : null;
  } catch {
    return null;
  }
}

export function listCollections(ctx: AppContext): ReferenceCollection[] {
  return ctx.sqlite
    .prepare(
      `SELECT c.id, c.name, c.color,
         (SELECT COUNT(*) FROM reference_collection_items ci JOIN bib_references r ON r.id = ci.reference_id
            WHERE ci.collection_id = c.id AND r.deleted_at IS NULL) AS count
       FROM reference_collections c ORDER BY lower(c.name)`,
    )
    .all() as ReferenceCollection[];
}

export function registerReferenceEntity(): void {
  registerTrashable({
    type: 'reference',
    table: 'bib_references',
    titleSql: "CASE WHEN title = '' THEN 'Sin título' ELSE title END",
    onRestore: (ctx, id) => indexReference(ctx, id),
  });
}

export async function referenceRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/references', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(300).optional(),
        collectionId: idSchema.optional(),
        readStatus: z.enum(['unread', 'reading', 'read']).optional(),
        gameId: idSchema.optional(),
        publicationId: idSchema.optional(),
      }),
      req.query,
    );
    return listReferences(ctx, q);
  });

  app.get('/api/references/export', async (req, reply) => {
    const q = parse(
      z.object({
        format: z.enum(['bibtex', 'ris', 'csljson', 'apa']).default('bibtex'),
        ids: z.string().optional(),
        collectionId: idSchema.optional(),
        publicationId: idSchema.optional(),
      }),
      req.query,
    );
    const items = listReferences(ctx, {
      ids: q.ids ? q.ids.split(',').filter(Boolean) : undefined,
      collectionId: q.collectionId,
      publicationId: q.publicationId,
    });
    const out = exportReferences(items, q.format);
    reply
      .type(out.type)
      .header('Content-Disposition', contentDisposition('attachment', `Referencias.${out.ext}`));
    return out.body;
  });

  app.get('/api/references/:id', async (req) => getReference(ctx, parse(idParam, req.params).id));

  app.post('/api/references', async (req, reply) => {
    reply.code(201);
    return createReference(ctx, req.body);
  });

  app.patch('/api/references/:id', async (req) =>
    updateReference(ctx, parse(idParam, req.params).id, req.body),
  );

  app.delete('/api/references/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getReference(ctx, id);
    moveToTrash(ctx, 'reference', id);
    return { ok: true };
  });

  /** Importa BibTeX, RIS o CSL-JSON, pegado como texto o subido como archivo. */
  app.post('/api/references/import', async (req) => {
    let text: string;
    let fileName: string | null = null;
    let collectionId: string | null;
    let skipDuplicates: boolean;
    if (req.isMultipart()) {
      const part = await req.file();
      if (!part) throw new ValidationError('Falta el archivo.');
      const buffer = await part.toBuffer();
      if (buffer.length > 50 * 1024 * 1024)
        throw new ValidationError('El archivo es demasiado grande.');
      text = buffer.toString('utf8');
      fileName = part.filename;
      const fields = part.fields as Record<string, { value?: string } | undefined>;
      collectionId = fields.collectionId?.value || null;
      skipDuplicates = fields.skipDuplicates?.value !== 'false';
    } else {
      const body = parse(
        z.object({
          text: z.string().min(1).max(20_000_000),
          collectionId: z.string().nullish(),
          skipDuplicates: z.boolean().default(true),
        }),
        req.body,
      );
      text = body.text;
      collectionId = body.collectionId ?? null;
      skipDuplicates = body.skipDuplicates;
    }
    const items = parseReferences(text);
    if (!items.length) throw new ValidationError('No se ha encontrado ninguna referencia.');
    return importReferences(ctx, items, { fileName, skipDuplicates, collectionId });
  });

  app.post('/api/references/doi', async (req) => {
    const { doi } = parse(z.object({ doi: z.string().min(3).max(300) }), req.body);
    const csl = await lookupDoi(doi);
    const dup = ctx.sqlite
      .prepare('SELECT id FROM bib_references WHERE dedupe_key = ? AND deleted_at IS NULL')
      .get(duplicateKey(csl)) as { id: string } | undefined;
    return { csl, duplicateOf: dup?.id ?? null, apa: apaText(csl) };
  });

  app.post('/api/references/:id/pdf', async (req) => {
    const { id } = parse(idParam, req.params);
    const ref = getReference(ctx, id);
    if (!req.isMultipart()) throw new ValidationError('Sube el PDF como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    const buffer = await part.toBuffer();
    if (!/\.pdf$/i.test(part.filename) && part.mimetype !== 'application/pdf')
      throw new ValidationError('El archivo no es un PDF.');
    const att = await saveAttachment(ctx, {
      fileName: part.filename,
      mimeType: 'application/pdf',
      source: buffer,
      entityType: 'reference',
      entityId: id,
    });
    const text = await extractPdfText(buffer);
    ctx.sqlite
      .prepare(
        'UPDATE bib_references SET pdf_attachment_id = ?, full_text = ?, updated_at = ? WHERE id = ?',
      )
      .run(att.id, text, ctx.nowISO(), id);
    if (ref.pdfAttachmentId && ref.pdfAttachmentId !== att.id) {
      try {
        moveToTrash(ctx, 'attachment', ref.pdfAttachmentId);
      } catch {
        /* ya no existe */
      }
    }
    indexReference(ctx, id);
    return { ...getReference(ctx, id), extracted: Boolean(text) };
  });

  app.delete('/api/references/:id/pdf', async (req) => {
    const { id } = parse(idParam, req.params);
    const ref = getReference(ctx, id);
    ctx.sqlite
      .prepare(
        'UPDATE bib_references SET pdf_attachment_id = NULL, full_text = NULL, updated_at = ? WHERE id = ?',
      )
      .run(ctx.nowISO(), id);
    if (ref.pdfAttachmentId) {
      try {
        moveToTrash(ctx, 'attachment', ref.pdfAttachmentId);
      } catch {
        /* ya no existe */
      }
    }
    indexReference(ctx, id);
    return getReference(ctx, id);
  });

  // Citas textuales
  app.get('/api/references/:id/quotes', async (req) => {
    const { id } = parse(idParam, req.params);
    return ctx.sqlite
      .prepare(
        'SELECT id, reference_id AS referenceId, text, page, comment, created_at AS createdAt FROM reference_quotes WHERE reference_id = ? ORDER BY created_at',
      )
      .all(id) as ReferenceQuote[];
  });
  app.post('/api/quotes', async (req, reply) => {
    const input = parse(quoteInputSchema, req.body);
    getReference(ctx, input.referenceId);
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        'INSERT INTO reference_quotes (id, reference_id, text, page, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, input.referenceId, toNFC(input.text), input.page, input.comment, now, now);
    indexReference(ctx, input.referenceId);
    reply.code(201);
    return { id, ...input, createdAt: now };
  });
  app.patch('/api/quotes/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(quoteUpdateSchema, req.body);
    const row = ctx.sqlite
      .prepare('SELECT reference_id AS r FROM reference_quotes WHERE id = ?')
      .get(id) as { r: string } | undefined;
    if (!row) throw new NotFoundError('La cita');
    const cols = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (cols.length) {
      ctx.sqlite
        .prepare(
          `UPDATE reference_quotes SET ${cols.map(([k]) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        )
        .run(...cols.map(([, v]) => v), ctx.nowISO(), id);
    }
    indexReference(ctx, row.r);
    return { ok: true };
  });
  app.delete('/api/quotes/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const row = ctx.sqlite
      .prepare('SELECT reference_id AS r FROM reference_quotes WHERE id = ?')
      .get(id) as { r: string } | undefined;
    if (!row) throw new NotFoundError('La cita');
    ctx.sqlite.prepare('DELETE FROM reference_quotes WHERE id = ?').run(id);
    indexReference(ctx, row.r);
    return { ok: true };
  });

  // Colecciones
  app.get('/api/reference-collections', async () => listCollections(ctx));
  app.post('/api/reference-collections', async (req, reply) => {
    const input = parse(collectionInputSchema, req.body);
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        'INSERT INTO reference_collections (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.name, input.color, now, now);
    reply.code(201);
    return listCollections(ctx).find((c) => c.id === id);
  });
  app.patch('/api/reference-collections/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(collectionInputSchema.partial(), req.body);
    const res = ctx.sqlite
      .prepare(
        'UPDATE reference_collections SET name = coalesce(?, name), color = coalesce(?, color), updated_at = ? WHERE id = ?',
      )
      .run(input.name ?? null, input.color ?? null, ctx.nowISO(), id);
    if (!res.changes) throw new NotFoundError('La colección');
    return listCollections(ctx).find((c) => c.id === id);
  });
  app.delete('/api/reference-collections/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ctx.sqlite.prepare('DELETE FROM reference_collections WHERE id = ?').run(id);
    return { ok: true };
  });
  /** Añadir o quitar varias referencias de una colección. */
  app.post('/api/reference-collections/:id/items', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({ add: z.array(idSchema).default([]), remove: z.array(idSchema).default([]) }),
      req.body,
    );
    ctx.sqlite.transaction(() => {
      const ins = ctx.sqlite.prepare(
        'INSERT OR IGNORE INTO reference_collection_items (collection_id, reference_id) VALUES (?, ?)',
      );
      const del = ctx.sqlite.prepare(
        'DELETE FROM reference_collection_items WHERE collection_id = ? AND reference_id = ?',
      );
      for (const r of body.add) ins.run(id, r);
      for (const r of body.remove) del.run(id, r);
    })();
    return listCollections(ctx).find((c) => c.id === id);
  });
}
