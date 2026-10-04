import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CLIENT_KINDS,
  SERVICES,
  UNITS,
  clientAccountInputSchema,
  clientAccountUpdateSchema,
  clientInputSchema,
  clientUpdateSchema,
  contactInputSchema,
  contactUpdateSchema,
  idSchema,
  labelOf,
  pairLabel,
  rateInputSchema,
  rateUpdateSchema,
  type Client,
  type ClientAccount,
  type Contact,
  type Rate,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { columns, decodeRow, insertRow, selectList, updateRow, assertExists } from '../../lib/sql';
import { parse, queryBool } from '../../lib/validate';
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

export const CONTACT_COLUMNS = columns({
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

export function indexClient(ctx: AppContext, c: Client) {
  // Los servidores y usuarios de sus herramientas también se buscan; las contraseñas, nunca.
  const accounts = ctx.sqlite
    .prepare('SELECT server_url AS url, username AS user FROM client_accounts WHERE client_id = ?')
    .all(c.id) as { url: string | null; user: string | null }[];
  indexEntity(ctx, {
    entityType: 'client',
    entityId: c.id,
    title: c.name,
    subtitle: [labelOf(CLIENT_KINDS, c.kind), c.country].filter(Boolean).join(' · '),
    text: [
      c.legalName,
      c.taxId,
      c.email,
      c.platform,
      c.notes,
      ...accounts.flatMap((a) => [a.url, a.user]),
    ]
      .filter(Boolean)
      .join(' '),
  });
}

const ACCOUNT_COLUMNS = columns({
  id: 'id',
  clientId: 'client_id',
  tool: 'tool',
  label: 'label',
  serverUrl: 'server_url',
  username: 'username',
  password: 'password',
  notes: 'notes',
  sortOrder: 'sort_order',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export function listClientAccounts(ctx: AppContext, clientId: string): ClientAccount[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT ${selectList(ACCOUNT_COLUMNS, 'a')} FROM client_accounts a WHERE a.client_id = ? ORDER BY a.sort_order, a.created_at`,
      )
      .all(clientId) as Record<string, unknown>[]
  ).map((r) => decodeRow<ClientAccount>(ACCOUNT_COLUMNS, r));
}

function getClientAccount(ctx: AppContext, id: string): ClientAccount {
  const row = ctx.sqlite
    .prepare(`SELECT ${selectList(ACCOUNT_COLUMNS, 'a')} FROM client_accounts a WHERE a.id = ?`)
    .get(id);
  if (!row) throw new NotFoundError('El acceso');
  return decodeRow<ClientAccount>(ACCOUNT_COLUMNS, row as Record<string, unknown>);
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
const sameLang = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Una tarifa con idioma sirve si coincide o si el proyecto no indica ese idioma. */
const langFits = (rateLang: string | null, projectLang: string | null) =>
  rateLang == null || projectLang == null || sameLang(rateLang, projectLang);

export interface RateQuery {
  clientId: string | null;
  service: string;
  /** Sin unidad, se elige la mejor tarifa del servicio en cualquier unidad. */
  unit?: string | null;
  sourceLang: string | null;
  targetLang: string | null;
}

export function resolveRate(ctx: AppContext, q: RateQuery): Rate | null {
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
    if (!langFits(r.sourceLang, q.sourceLang) || !langFits(r.targetLang, q.targetLang)) return -1;
    // Una coincidencia exacta de idioma puntúa más que una tarifa «para cualquier idioma».
    const exact = (rl: string | null, pl: string | null) => (rl && pl && sameLang(rl, pl) ? 2 : 0);
    return (
      (r.clientId ? 10 : 0) + exact(r.sourceLang, q.sourceLang) + exact(r.targetLang, q.targetLang)
    );
  };
  // El orden es estable: a igual puntuación gana la tarifa modificada más recientemente.
  const best = rates
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0];
  return best?.r ?? null;
}

export interface RateCandidate {
  rate: Rate;
  /** Por qué no se ha aplicado («es de revisión», «es para EN→ES»…). */
  reasons: string[];
}

/**
 * Cuando no hay tarifa, explica qué tarifas hay y por qué no encajan: otro servicio, otra
 * unidad, otros idiomas o un cliente distinto con el mismo nombre (clientes duplicados).
 */
export function explainRates(
  ctx: AppContext,
  q: RateQuery & { clientName: string | null },
): { candidates: RateCandidate[]; notes: string[] } {
  const notes: string[] = [];
  const twins = q.clientName
    ? (
        ctx.sqlite
          .prepare(
            `SELECT id FROM clients WHERE deleted_at IS NULL AND id <> ?
             AND lower(trim(name)) = lower(trim(?))`,
          )
          .all(q.clientId ?? '', q.clientName) as { id: string }[]
      ).map((r) => r.id)
    : [];
  const ids = [q.clientId, ...twins].filter((x): x is string => Boolean(x));
  const rows = ctx.sqlite
    .prepare(
      `${RATE_SELECT} WHERE r.deleted_at IS NULL
       AND (r.client_id IS NULL ${ids.length ? `OR r.client_id IN (${ids.map(() => '?').join(',')})` : ''})
       ORDER BY r.updated_at DESC`,
    )
    .all(...ids) as Record<string, unknown>[];
  const rates = rows.map((r) => decodeRow<Rate>(RATE_COLUMNS, r));
  if (!q.clientId)
    notes.push('El proyecto no tiene cliente: solo se buscan las tarifas generales.');
  else if (!rates.some((r) => r.clientId === q.clientId))
    notes.push(`${q.clientName ?? 'El cliente'} no tiene ninguna tarifa.`);
  if (q.clientId && (!q.sourceLang || !q.targetLang))
    notes.push('El proyecto no tiene indicados los dos idiomas.');
  const projectPair = q.sourceLang || q.targetLang ? pairLabel(q.sourceLang, q.targetLang) : null;
  const candidates = rates.map((rate) => {
    const reasons: string[] = [];
    // Peso de cada diferencia: una tarifa del mismo servicio es la candidata más útil.
    let weight = 0;
    if (rate.clientId && rate.clientId !== q.clientId) {
      reasons.push(`es de otro cliente con el mismo nombre («${rate.clientName}»)`);
      weight += 1;
    }
    if (rate.service !== q.service) {
      reasons.push(`es de ${labelOf(SERVICES, rate.service).toLowerCase()}`);
      weight += 4;
    }
    if (q.unit && rate.unit !== q.unit) {
      reasons.push(`es por ${labelOf(UNITS, rate.unit).toLowerCase()}`);
      weight += 1;
    }
    if (!langFits(rate.sourceLang, q.sourceLang) || !langFits(rate.targetLang, q.targetLang)) {
      reasons.push(
        `es para ${pairLabel(rate.sourceLang, rate.targetLang)}${projectPair ? ` y el proyecto es ${projectPair}` : ''}`,
      );
      weight += 2;
    }
    return { rate, reasons, weight };
  });
  candidates.sort(
    (a, b) =>
      a.weight - b.weight || Number(Boolean(b.rate.clientId)) - Number(Boolean(a.rate.clientId)),
  );
  return {
    candidates: candidates
      .filter((c) => c.reasons.length)
      .slice(0, 5)
      .map(({ rate, reasons }) => ({ rate, reasons })),
    notes,
  };
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
    const q = parse(
      z.object({ includeInactive: queryBool.transform((v) => v ?? true) }),
      req.query,
    );
    return listClients(ctx, q);
  });

  app.get('/api/clients/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return {
      client: getClient(ctx, id),
      contacts: listContacts(ctx, id),
      rates: listRates(ctx, id),
      accounts: listClientAccounts(ctx, id),
    };
  });

  app.get('/api/clients/:id/accounts', async (req) => {
    const { id } = parse(idParam, req.params);
    getClient(ctx, id);
    return listClientAccounts(ctx, id);
  });
  app.post('/api/client-accounts', async (req, reply) => {
    const input = parse(clientAccountInputSchema, req.body);
    const client = getClient(ctx, input.clientId);
    const max = ctx.sqlite
      .prepare('SELECT MAX(sort_order) AS m FROM client_accounts WHERE client_id = ?')
      .get(input.clientId) as { m: number | null };
    const id = insertRow(ctx, 'client_accounts', ACCOUNT_COLUMNS, {
      ...input,
      sortOrder: (max.m ?? 0) + 1,
    });
    indexClient(ctx, client);
    reply.code(201);
    return getClientAccount(ctx, id);
  });
  app.patch('/api/client-accounts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const current = getClientAccount(ctx, id);
    updateRow(
      ctx,
      'client_accounts',
      ACCOUNT_COLUMNS,
      id,
      parse(clientAccountUpdateSchema, req.body),
      {
        what: 'El acceso',
        softDelete: false,
      },
    );
    indexClient(ctx, getClient(ctx, current.clientId));
    return getClientAccount(ctx, id);
  });
  app.delete('/api/client-accounts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const current = getClientAccount(ctx, id);
    ctx.sqlite.prepare('DELETE FROM client_accounts WHERE id = ?').run(id);
    indexClient(ctx, getClient(ctx, current.clientId));
    return { ok: true };
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
    const clientName = clientId
      ? ((
          ctx.sqlite.prepare('SELECT name FROM clients WHERE id = ?').get(clientId) as
            { name: string } | undefined
        )?.name ?? null)
      : null;
    const query = { clientId, service: q.service, unit: q.unit, sourceLang, targetLang };
    const rate = resolveRate(ctx, query);
    return {
      rate,
      source: rate ? (rate.clientId ? 'client' : 'general') : null,
      context: {
        clientId,
        clientName,
        sourceLang,
        targetLang,
        service: q.service,
        unit: q.unit ?? null,
      },
      ...(rate ? { candidates: [], notes: [] } : explainRates(ctx, { ...query, clientName })),
    };
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
