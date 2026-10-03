import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PUBLICATION_STATUSES,
  PUBLICATION_TYPES,
  idSchema,
  journalInputSchema,
  journalUpdateSchema,
  labelOf,
  publicationInputSchema,
  publicationUpdateSchema,
  submissionInputSchema,
  submissionUpdateSchema,
  todayISO,
  type Journal,
  type Publication,
  type Submission,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { assertExists, columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

const JOURNAL_COLUMNS = columns({
  id: 'id',
  name: 'name',
  issn: 'issn',
  eissn: 'eissn',
  publisher: 'publisher',
  url: 'url',
  guidelinesUrl: 'guidelines_url',
  indexing: { col: 'indexing', json: true },
  quartile: 'quartile',
  openAccess: 'open_access',
  apcCents: 'apc_cents',
  apcCurrency: 'apc_currency',
  citationStyle: 'citation_style',
  languages: 'languages',
  wordLimit: 'word_limit',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/** Días entre el envío y la decisión (solo envíos con decisión distinta de «pendiente»). */
const RESPONSE_DAYS = `(julianday(sb.decision_at) - julianday(sb.submitted_at))`;

// Solo cuentan los envíos de publicaciones que no están en la papelera.
const LIVE_SUBMISSIONS = `submissions sb JOIN publications sp ON sp.id = sb.publication_id AND sp.deleted_at IS NULL`;

const JOURNAL_SELECT = `SELECT ${selectList(JOURNAL_COLUMNS, 'j')},
  (SELECT COUNT(*) FROM ${LIVE_SUBMISSIONS} WHERE sb.journal_id = j.id) AS "submissionCount",
  (SELECT ROUND(AVG(${RESPONSE_DAYS})) FROM ${LIVE_SUBMISSIONS}
     WHERE sb.journal_id = j.id AND sb.decision_at IS NOT NULL AND sb.decision <> 'pending') AS "avgResponseDays",
  (SELECT CAST(SUM(sb.decision = 'accept') AS REAL) / COUNT(*) FROM ${LIVE_SUBMISSIONS}
     WHERE sb.journal_id = j.id AND sb.decision IN ('accept', 'reject', 'desk_reject')) AS "acceptanceRate"
  FROM journals j`;

export function getJournal(ctx: AppContext, id: string): Journal {
  const row = ctx.sqlite
    .prepare(`${JOURNAL_SELECT} WHERE j.id = ? AND j.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('La revista');
  return decodeRow<Journal>(JOURNAL_COLUMNS, row as Record<string, unknown>);
}

export function listJournals(ctx: AppContext): Journal[] {
  return (
    ctx.sqlite
      .prepare(`${JOURNAL_SELECT} WHERE j.deleted_at IS NULL ORDER BY lower(j.name)`)
      .all() as Record<string, unknown>[]
  ).map((r) => decodeRow<Journal>(JOURNAL_COLUMNS, r));
}

function indexJournal(ctx: AppContext, j: Journal) {
  indexEntity(ctx, {
    entityType: 'journal',
    entityId: j.id,
    title: j.name,
    subtitle: ['Revista', j.publisher, j.issn ?? j.eissn, j.quartile].filter(Boolean).join(' · '),
    text: [j.indexing.join(' '), j.notes].filter(Boolean).join(' '),
  });
}

const PUB_COLUMNS = columns({
  id: 'id',
  title: 'title',
  type: 'type',
  status: 'status',
  abstract: 'abstract',
  keywords: { col: 'keywords', json: true },
  language: 'language',
  journalId: 'journal_id',
  doi: 'doi',
  url: 'url',
  citation: 'citation',
  corpusVersionId: 'corpus_version_id',
  deadline: 'deadline',
  wordCount: 'word_count',
  notes: 'notes',
  authors: { col: 'authors', json: true },
  position: 'position',
  statusChangedAt: 'status_changed_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const PUB_SELECT = `SELECT ${selectList(PUB_COLUMNS, 'p')}, j.name AS "journalName", cv.name AS "corpusVersionName",
  (SELECT json_group_array(pg.game_id) FROM publication_games pg WHERE pg.publication_id = p.id) AS "gameIds",
  (SELECT json_group_array(pr.reference_id) FROM publication_references pr JOIN bib_references r ON r.id = pr.reference_id
     WHERE pr.publication_id = p.id AND r.deleted_at IS NULL) AS "referenceIds",
  (SELECT COUNT(*) FROM submissions sb WHERE sb.publication_id = p.id) AS "submissionCount",
  (SELECT COUNT(*) FROM tasks t JOIN task_statuses ts ON ts.id = t.status_id
     WHERE t.related_type = 'publication' AND t.related_id = p.id AND t.deleted_at IS NULL AND ts.category <> 'done') AS "openTaskCount"
  FROM publications p
  LEFT JOIN journals j ON j.id = p.journal_id AND j.deleted_at IS NULL
  LEFT JOIN corpus_versions cv ON cv.id = p.corpus_version_id`;

function decodePub(r: Record<string, unknown>): Publication {
  const p = decodeRow<Publication & { gameIds: unknown; referenceIds: unknown }>(PUB_COLUMNS, r);
  const arr = (v: unknown) => {
    try {
      return (JSON.parse(String(v ?? '[]')) as (string | null)[]).filter((x): x is string =>
        Boolean(x),
      );
    } catch {
      return [];
    }
  };
  return { ...p, gameIds: arr(r.gameIds), referenceIds: arr(r.referenceIds) };
}

export function getPublication(ctx: AppContext, id: string): Publication {
  const row = ctx.sqlite.prepare(`${PUB_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('La publicación');
  return decodePub(row as Record<string, unknown>);
}

export function listPublications(ctx: AppContext): Publication[] {
  return (
    ctx.sqlite
      .prepare(`${PUB_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.position, p.created_at`)
      .all() as Record<string, unknown>[]
  ).map(decodePub);
}

function indexPublication(ctx: AppContext, p: Publication) {
  indexEntity(ctx, {
    entityType: 'publication',
    entityId: p.id,
    title: p.title,
    subtitle: [
      labelOf(PUBLICATION_TYPES, p.type),
      labelOf(PUBLICATION_STATUSES, p.status),
      p.journalName,
    ]
      .filter(Boolean)
      .join(' · '),
    text: [p.abstract, p.keywords.join(' '), p.authors.map((a) => a.name).join(' '), p.notes]
      .filter(Boolean)
      .join(' '),
  });
}

function setLinks(
  ctx: AppContext,
  table: 'publication_games' | 'publication_references',
  col: 'game_id' | 'reference_id',
  pubId: string,
  ids: string[],
) {
  ctx.sqlite.prepare(`DELETE FROM ${table} WHERE publication_id = ?`).run(pubId);
  const ins = ctx.sqlite.prepare(
    `INSERT OR IGNORE INTO ${table} (publication_id, ${col}) VALUES (?, ?)`,
  );
  const check =
    col === 'game_id'
      ? ctx.sqlite.prepare('SELECT 1 FROM games WHERE id = ? AND deleted_at IS NULL')
      : ctx.sqlite.prepare('SELECT 1 FROM bib_references WHERE id = ? AND deleted_at IS NULL');
  for (const id of new Set(ids)) if (check.get(id)) ins.run(pubId, id);
}

export function createPublication(ctx: AppContext, raw: unknown): Publication {
  const input = parse(publicationInputSchema, raw);
  assertExists(ctx, 'journals', input.journalId, 'La revista');
  const { gameIds, referenceIds, ...rest } = input;
  const max = ctx.sqlite.prepare('SELECT MAX(position) AS p FROM publications').get() as {
    p: number | null;
  };
  let id = '';
  ctx.sqlite.transaction(() => {
    id = insertRow(ctx, 'publications', PUB_COLUMNS, {
      ...rest,
      position: (max.p ?? 0) + 1,
      statusChangedAt: ctx.nowISO(),
    });
    setLinks(ctx, 'publication_games', 'game_id', id, gameIds);
    setLinks(ctx, 'publication_references', 'reference_id', id, referenceIds);
  })();
  const p = getPublication(ctx, id);
  indexPublication(ctx, p);
  logActivity(ctx, {
    entityType: 'publication',
    entityId: id,
    action: 'crear',
    summary: `Publicación «${p.title}» creada`,
  });
  return p;
}

export function updatePublication(ctx: AppContext, id: string, raw: unknown): Publication {
  const patch = parse(publicationUpdateSchema, raw);
  const before = getPublication(ctx, id);
  assertExists(ctx, 'journals', patch.journalId, 'La revista');
  const { gameIds, referenceIds, ...rest } = patch;
  ctx.sqlite.transaction(() => {
    const values: Record<string, unknown> = { ...rest };
    if (patch.status && patch.status !== before.status) values.statusChangedAt = ctx.nowISO();
    updateRow(ctx, 'publications', PUB_COLUMNS, id, values, { what: 'La publicación' });
    if (gameIds) setLinks(ctx, 'publication_games', 'game_id', id, gameIds);
    if (referenceIds) setLinks(ctx, 'publication_references', 'reference_id', id, referenceIds);
  })();
  const p = getPublication(ctx, id);
  indexPublication(ctx, p);
  if (patch.status && patch.status !== before.status) {
    logActivity(ctx, {
      entityType: 'publication',
      entityId: id,
      action: 'estado',
      summary: `«${p.title}»: ${labelOf(PUBLICATION_STATUSES, before.status)} → ${labelOf(PUBLICATION_STATUSES, p.status)}`,
    });
  }
  return p;
}

const SUB_SELECT = `SELECT sb.id, sb.publication_id AS publicationId, sb.journal_id AS journalId, j.name AS journalName,
  sb.venue, sb.manuscript_id AS manuscriptId, sb.submitted_at AS submittedAt, sb.decision, sb.decision_at AS decisionAt,
  sb.revision_due AS revisionDue, sb.notes, sb.created_at AS createdAt,
  CASE WHEN sb.decision_at IS NOT NULL THEN CAST(${RESPONSE_DAYS} AS INTEGER) END AS responseDays
  FROM submissions sb LEFT JOIN journals j ON j.id = sb.journal_id`;

export function listSubmissions(ctx: AppContext, publicationId?: string): Submission[] {
  return ctx.sqlite
    .prepare(
      `${SUB_SELECT} ${publicationId ? 'WHERE sb.publication_id = ?' : ''} ORDER BY sb.submitted_at DESC, sb.created_at DESC`,
    )
    .all(...(publicationId ? [publicationId] : [])) as Submission[];
}

const SUB_COLUMNS = columns({
  publicationId: 'publication_id',
  journalId: 'journal_id',
  venue: 'venue',
  manuscriptId: 'manuscript_id',
  submittedAt: 'submitted_at',
  decision: 'decision',
  decisionAt: 'decision_at',
  revisionDue: 'revision_due',
  notes: 'notes',
});

/** Al registrar un envío o una decisión, el estado de la publicación avanza solo. */
function syncStatusFromSubmission(ctx: AppContext, publicationId: string) {
  const [last] = listSubmissions(ctx, publicationId);
  if (!last) return;
  const pub = getPublication(ctx, publicationId);
  if (['published', 'in_press'].includes(pub.status)) return;
  const map: Record<string, Publication['status']> = {
    pending: listSubmissions(ctx, publicationId).length > 1 ? 'resubmitted' : 'submitted',
    major: 'revisions',
    minor: 'revisions',
    accept: 'accepted',
    reject: 'rejected',
    desk_reject: 'rejected',
  };
  const next = map[last.decision];
  if (next && next !== pub.status) updatePublication(ctx, publicationId, { status: next });
}

export function registerAcademicEntities(): void {
  registerTrashable({
    type: 'publication',
    table: 'publications',
    titleSql: 'title',
    onRestore: (ctx, id) => indexPublication(ctx, getPublication(ctx, id)),
  });
  registerTrashable({
    type: 'journal',
    table: 'journals',
    titleSql: 'name',
    onRestore: (ctx, id) => indexJournal(ctx, getJournal(ctx, id)),
  });
}

export async function publicationRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/journals', async () => listJournals(ctx));
  app.get('/api/journals/:id', async (req) => getJournal(ctx, parse(idParam, req.params).id));
  app.post('/api/journals', async (req, reply) => {
    const input = parse(journalInputSchema, req.body);
    const id = insertRow(ctx, 'journals', JOURNAL_COLUMNS, input);
    const j = getJournal(ctx, id);
    indexJournal(ctx, j);
    reply.code(201);
    return j;
  });
  app.patch('/api/journals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    updateRow(ctx, 'journals', JOURNAL_COLUMNS, id, parse(journalUpdateSchema, req.body), {
      what: 'La revista',
    });
    const j = getJournal(ctx, id);
    indexJournal(ctx, j);
    return j;
  });
  app.delete('/api/journals/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getJournal(ctx, id);
    moveToTrash(ctx, 'journal', id);
    return { ok: true };
  });

  app.get('/api/publications', async () => listPublications(ctx));
  app.get('/api/publications/:id', async (req) =>
    getPublication(ctx, parse(idParam, req.params).id),
  );
  app.post('/api/publications', async (req, reply) => {
    reply.code(201);
    return createPublication(ctx, req.body);
  });
  app.patch('/api/publications/:id', async (req) =>
    updatePublication(ctx, parse(idParam, req.params).id, req.body),
  );
  app.delete('/api/publications/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getPublication(ctx, id);
    moveToTrash(ctx, 'publication', id);
    return { ok: true };
  });

  app.get('/api/submissions', async (req) => {
    const q = parse(z.object({ publicationId: idSchema.optional() }), req.query);
    return listSubmissions(ctx, q.publicationId);
  });
  app.post('/api/submissions', async (req, reply) => {
    const input = parse(submissionInputSchema, req.body);
    getPublication(ctx, input.publicationId);
    assertExists(ctx, 'journals', input.journalId, 'La revista');
    if (!input.journalId && !input.venue)
      throw new ValidationError('Indica la revista o el congreso del envío.');
    const id = insertRow(ctx, 'submissions', SUB_COLUMNS, input);
    syncStatusFromSubmission(ctx, input.publicationId);
    logActivity(ctx, {
      entityType: 'publication',
      entityId: input.publicationId,
      action: 'editar',
      summary: 'Envío registrado',
    });
    reply.code(201);
    return listSubmissions(ctx, input.publicationId).find((s) => s.id === id);
  });
  app.patch('/api/submissions/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const row = ctx.sqlite
      .prepare('SELECT publication_id AS p FROM submissions WHERE id = ?')
      .get(id) as { p: string } | undefined;
    if (!row) throw new NotFoundError('El envío');
    const patch = parse(submissionUpdateSchema, req.body);
    assertExists(ctx, 'journals', patch.journalId, 'La revista');
    const values: Record<string, unknown> = { ...patch };
    if (patch.decision && patch.decision !== 'pending' && patch.decisionAt === undefined) {
      const current = ctx.sqlite
        .prepare('SELECT decision_at AS d FROM submissions WHERE id = ?')
        .get(id) as { d: string | null };
      if (!current.d) values.decisionAt = todayISO(ctx.now());
    }
    const sets = Object.entries(values).filter(([k, v]) => v !== undefined && SUB_COLUMNS[k]);
    if (sets.length) {
      ctx.sqlite
        .prepare(
          `UPDATE submissions SET ${sets.map(([k]) => `${SUB_COLUMNS[k]!.col} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        )
        .run(...sets.map(([, v]) => v), ctx.nowISO(), id);
    }
    syncStatusFromSubmission(ctx, row.p);
    return listSubmissions(ctx, row.p).find((s) => s.id === id);
  });
  app.delete('/api/submissions/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const res = ctx.sqlite.prepare('DELETE FROM submissions WHERE id = ?').run(id);
    if (!res.changes) throw new NotFoundError('El envío');
    return { ok: true };
  });
}
