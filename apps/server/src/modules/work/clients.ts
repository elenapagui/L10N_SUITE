import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CLIENT_KINDS,
  clientInputSchema,
  clientUpdateSchema,
  contactInputSchema,
  contactUpdateSchema,
  idSchema,
  labelOf,
  rateInputSchema,
  rateUpdateSchema,
  type Client,
  type Contact,
  type Rate,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { columns, decodeRow, insertRow, selectList, updateRow, assertExists } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

export const CLIENT_COLUMNS = columns({
  id: 'id',
  name: 'name',
  kind: 'kind',
  legalName: 'legal_name',
  taxId: 'tax_id',
  country: 'country',
  address: 'address',
  email: 'email',
  website: 'website',
  currency: 'currency',
  paymentTermsDays: 'payment_terms_days',
  vatPct: 'vat_pct',
  irpfPct: 'irpf_pct',
  platform: 'platform',
  ndaSignedAt: 'nda_signed_at',
  catGrid: { col: 'cat_grid', json: true },
  rating: 'rating',
  active: { col: 'active', bool: true },
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const CONTACT_COLUMNS = columns({
  id: 'id',
  clientId: 'client_id',
  name: 'name',
  role: 'role',
  email: 'email',
  phone: 'phone',
  isPrimary: { col: 'is_primary', bool: true },
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export const RATE_COLUMNS = columns({
  id: 'id',
  clientId: 'client_id',
  service: 'service',
  sourceLang: 'source_lang',
  targetLang: 'target_lang',
  unit: 'unit',
  rateMicros: 'rate_micros',
  currency: 'currency',
  minimumCents: 'minimum_cents',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/** Estados de encargo que cuentan como «abiertos» (trabajo por hacer). */
export const OPEN_JOB_STATUSES = "('received','in_progress','client_review')";

const CLIENT_SELECT = `SELECT ${selectList(CLIENT_COLUMNS, 'c')},
  (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL) AS "projectCount",
  (SELECT COUNT(*) FROM jobs j JOIN projects p ON p.id = j.project_id
     WHERE p.client_id = c.id AND j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.status IN ${OPEN_JOB_STATUSES}) AS "openJobCount",
  (SELECT COALESCE(SUM(j.amount_cents), 0) FROM jobs j JOIN projects p ON p.id = j.project_id
     WHERE p.client_id = c.id AND j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.billing_status = 'pending'
       AND j.status IN ('delivered','client_review','closed')) AS "pendingBillingCents",
  (SELECT MAX(COALESCE(j.received_at, substr(j.created_at, 1, 10))) FROM jobs j JOIN projects p ON p.id = j.project_id
     WHERE p.client_id = c.id AND j.deleted_at IS NULL) AS "lastJobAt"
  FROM clients c`;

function indexClient(ctx: AppContext, c: Client) {
  indexEntity(ctx, {
    entityType: 'client',
    entityId: c.id,
    title: c.name,
    subtitle: [labelOf(CLIENT_KINDS, c.kind), c.country].filter(Boolean).join(' · '),
    text: [c.legalName, c.taxId, c.email, c.platform, c.notes].filter(Boolean).join(' '),
  });
}

export function getClient(ctx: AppContext, id: string): Client {
  const row = ctx.sqlite
    .prepare(`${CLIENT_SELECT} WHERE c.id = ? AND c.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('El cliente');
  return decodeRow<Client>(CLIENT_COLUMNS, row as Record<string, unknown>);
}

export function listClients(
  ctx: AppContext,
  options: { includeInactive?: boolean } = {},
): Client[] {
  const rows = ctx.sqlite
    .prepare(
      `${CLIENT_SELECT} WHERE c.deleted_at IS NULL ${options.includeInactive ? '' : 'AND c.active = 1'}
       ORDER BY lower(c.name)`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => decodeRow<Client>(CLIENT_COLUMNS, r));
}

function getContact(ctx: AppContext, id: string): Contact {
  const row = ctx.sqlite
    .prepare(
      `SELECT ${selectList(CONTACT_COLUMNS, 'x')} FROM contacts x WHERE x.id = ? AND x.deleted_at IS NULL`,
    )
    .get(id);
  if (!row) throw new NotFoundError('El contacto');
  return decodeRow<Contact>(CONTACT_COLUMNS, row as Record<string, unknown>);
}

export function listContacts(ctx: AppContext, clientId: string): Contact[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT ${selectList(CONTACT_COLUMNS, 'x')} FROM contacts x
         WHERE x.client_id = ? AND x.deleted_at IS NULL ORDER BY x.is_primary DESC, lower(x.name)`,
      )
      .all(clientId) as Record<string, unknown>[]
  ).map((r) => decodeRow<Contact>(CONTACT_COLUMNS, r));
}

const RATE_SELECT = `SELECT ${selectList(RATE_COLUMNS, 'r')}, c.name AS "clientName"
  FROM rates r LEFT JOIN clients c ON c.id = r.client_id`;

function getRate(ctx: AppContext, id: string): Rate {
  const row = ctx.sqlite.prepare(`${RATE_SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('La tarifa');
  return decodeRow<Rate>(RATE_COLUMNS, row as Record<string, unknown>);
}

export function listRates(ctx: AppContext, clientId?: string | null): Rate[] {
  const rows = (
    clientId === undefined
      ? ctx.sqlite
          .prepare(`${RATE_SELECT} WHERE r.deleted_at IS NULL ORDER BY c.name, r.service`)
          .all()
      : clientId === null
        ? ctx.sqlite
            .prepare(
              `${RATE_SELECT} WHERE r.deleted_at IS NULL AND r.client_id IS NULL ORDER BY r.service`,
            )
            .all()
        : ctx.sqlite
            .prepare(
              `${RATE_SELECT} WHERE r.deleted_at IS NULL AND r.client_id = ? ORDER BY r.service`,
            )
            .all(clientId)
  ) as Record<string, unknown>[];
  return rows.map((r) => decodeRow<Rate>(RATE_COLUMNS, r));
}

/**
 * Tarifa aplicable a un encargo: primero la del cliente con el mismo par de idiomas,
 * después la del cliente sin idiomas, y por último las generales.
 */
export function resolveRate(
  ctx: AppContext,
  q: {
    clientId: string | null;
    service: string;
    /** Sin unidad, se elige la mejor tarifa del servicio en cualquier unidad. */
    unit?: string | null;
    sourceLang: string | null;
    targetLang: string | null;
  },
): Rate | null {
  const candidates = ctx.sqlite
    .prepare(
      `${RATE_SELECT} WHERE r.deleted_at IS NULL AND r.service = ?
       ${q.unit ? 'AND r.unit = ?' : ''}
       AND (r.client_id = ? OR r.client_id IS NULL)
       ORDER BY r.updated_at DESC`,
    )
    .all(...(q.unit ? [q.service, q.unit, q.clientId] : [q.service, q.clientId])) as Record<
    string,
    unknown
  >[];
  const rates = candidates.map((r) => decodeRow<Rate>(RATE_COLUMNS, r));
  const score = (r: Rate) => {
    const langMatch =
      (r.sourceLang == null || r.sourceLang === q.sourceLang) &&
      (r.targetLang == null || r.targetLang === q.targetLang);
    if (!langMatch) return -1;
    return (r.clientId ? 10 : 0) + (r.sourceLang ? 2 : 0) + (r.targetLang ? 2 : 0);
  };
  // El orden es estable: a igual puntuación gana la tarifa modificada más recientemente.
  const best = rates
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0];
  return best?.r ?? null;
}

export function createClient(ctx: AppContext, raw: unknown): Client {
  const input = parse(clientInputSchema, raw);
  const id = insertRow(ctx, 'clients', CLIENT_COLUMNS, input);
  const client = getClient(ctx, id);
  indexClient(ctx, client);
  logActivity(ctx, {
    entityType: 'client',
    entityId: id,
    action: 'crear',
    summary: `Cliente «${client.name}» creado`,
  });
  return client;
}

export function registerClientEntities(): void {
  registerTrashable({
    type: 'client',
    table: 'clients',
    titleSql: 'name',
    onRestore: (ctx, id) => indexClient(ctx, getClient(ctx, id)),
  });
  registerTrashable({ type: 'contact', table: 'contacts', titleSql: 'name' });
  registerTrashable({ type: 'rate', table: 'rates', titleSql: "service || ' · ' || unit" });
}

function unsetOtherPrimary(ctx: AppContext, clientId: string, exceptId: string) {
  ctx.sqlite
    .prepare('UPDATE contacts SET is_primary = 0 WHERE client_id = ? AND id != ?')
    .run(clientId, exceptId);
}

export async function clientRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/clients', async (req) => {
    const q = parse(z.object({ includeInactive: z.coerce.boolean().default(true) }), req.query);
    return listClients(ctx, q);
  });

  app.get('/api/clients/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return {
      client: getClient(ctx, id),
      contacts: listContacts(ctx, id),
      rates: listRates(ctx, id),
    };
  });

  app.post('/api/clients', async (req, reply) => {
    const input = parse(clientInputSchema, req.body);
    const id = insertRow(ctx, 'clients', CLIENT_COLUMNS, input);
    const client = getClient(ctx, id);
    indexClient(ctx, client);
    logActivity(ctx, {
      entityType: 'client',
      entityId: id,
      action: 'crear',
      summary: `Cliente «${client.name}» creado`,
    });
    reply.code(201);
    return client;
  });

  app.patch('/api/clients/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(clientUpdateSchema, req.body);
    updateRow(ctx, 'clients', CLIENT_COLUMNS, id, patch, { what: 'El cliente' });
    const client = getClient(ctx, id);
    indexClient(ctx, client);
    return client;
  });

  app.delete('/api/clients/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'client', id);
    return { ok: true };
  });

  // Contactos
  app.post('/api/contacts', async (req, reply) => {
    const input = parse(contactInputSchema, req.body);
    assertExists(ctx, 'clients', input.clientId, 'El cliente');
    const id = insertRow(ctx, 'contacts', CONTACT_COLUMNS, input);
    if (input.isPrimary) unsetOtherPrimary(ctx, input.clientId, id);
    reply.code(201);
    return getContact(ctx, id);
  });

  app.patch('/api/contacts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(contactUpdateSchema, req.body);
    updateRow(ctx, 'contacts', CONTACT_COLUMNS, id, patch, { what: 'El contacto' });
    const contact = getContact(ctx, id);
    if (patch.isPrimary) unsetOtherPrimary(ctx, contact.clientId, id);
    return contact;
  });

  app.delete('/api/contacts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'contact', id);
    return { ok: true };
  });

  // Tarifas
  app.get('/api/rates', async (req) => {
    const q = parse(z.object({ clientId: z.string().optional() }), req.query);
    return listRates(
      ctx,
      q.clientId === undefined ? undefined : q.clientId === 'general' ? null : q.clientId,
    );
  });

  app.get('/api/rates/resolve', async (req) => {
    const q = parse(
      z.object({
        projectId: z.string().optional(),
        clientId: z.string().optional(),
        service: z.string(),
        unit: z.string().optional(),
        sourceLang: z.string().optional(),
        targetLang: z.string().optional(),
      }),
      req.query,
    );
    let { clientId = null, sourceLang = null, targetLang = null } = q;
    if (q.projectId) {
      const p = ctx.sqlite
        .prepare(
          'SELECT client_id AS clientId, source_lang AS sourceLang, target_lang AS targetLang FROM projects WHERE id = ? AND deleted_at IS NULL',
        )
        .get(q.projectId) as
        | { clientId: string | null; sourceLang: string | null; targetLang: string | null }
        | undefined;
      if (!p) throw new NotFoundError('El proyecto');
      ({ clientId, sourceLang, targetLang } = p);
    }
    const rate = resolveRate(ctx, {
      clientId,
      service: q.service,
      unit: q.unit,
      sourceLang,
      targetLang,
    });
    return { rate, source: rate ? (rate.clientId ? 'client' : 'general') : null };
  });

  app.post('/api/rates', async (req, reply) => {
    const input = parse(rateInputSchema, req.body);
    assertExists(ctx, 'clients', input.clientId, 'El cliente');
    const id = insertRow(ctx, 'rates', RATE_COLUMNS, input);
    reply.code(201);
    return getRate(ctx, id);
  });

  app.patch('/api/rates/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(rateUpdateSchema, req.body);
    updateRow(ctx, 'rates', RATE_COLUMNS, id, patch, { what: 'La tarifa' });
    return getRate(ctx, id);
  });

  app.delete('/api/rates/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'rate', id);
    return { ok: true };
  });
}
