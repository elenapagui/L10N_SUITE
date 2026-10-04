import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APPLICATION_EVENT_KINDS,
  APPLICATION_STATUSES,
  AWAITING_STATUSES,
  STATUS_ORDER,
  addDaysISO,
  formatDateES,
  applicationEventInputSchema,
  applicationEventUpdateSchema,
  applicationInputSchema,
  applicationUpdateSchema,
  contactInputSchema,
  idSchema,
  labelOf,
  rateInputSchema,
  todayISO,
  type ApplicationEvent,
  type ApplicationStatus,
  type CalendarEvent,
  type Client,
  type JobApplication,
  type Reminder,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { assertExists, columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { getSettings } from '../../services/settings';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { CONTACT_COLUMNS, RATE_COLUMNS, createClient, getClient } from '../work/clients';

const APP_COLUMNS = columns({
  id: 'id',
  title: 'title',
  company: 'company',
  kind: 'kind',
  status: 'status',
  clientId: 'client_id',
  source: 'source',
  url: 'url',
  location: 'location',
  workMode: 'work_mode',
  sourceLang: 'source_lang',
  targetLang: 'target_lang',
  contactName: 'contact_name',
  contactEmail: 'contact_email',
  salaryMinCents: 'salary_min_cents',
  salaryMaxCents: 'salary_max_cents',
  salaryPeriod: 'salary_period',
  rateMicros: 'rate_micros',
  rateUnit: 'rate_unit',
  currency: 'currency',
  deadline: 'deadline',
  appliedAt: 'applied_at',
  followUpAt: 'follow_up_at',
  notes: 'notes',
  position: 'position',
  statusChangedAt: 'status_changed_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/** Pasos que cuentan como respuesta de la empresa. */
const RESPONSE_KINDS = `('test_received', 'interview', 'response', 'offer')`;

const APP_SELECT = `SELECT ${selectList(APP_COLUMNS, 'a')}, c.name AS "clientName",
  (SELECT MAX(e.date) FROM job_application_events e WHERE e.application_id = a.id AND e.kind <> 'status') AS "lastEventAt",
  (SELECT COUNT(*) FROM job_application_events e WHERE e.application_id = a.id) AS "eventCount",
  (SELECT CAST(julianday(MIN(e.date)) - julianday(a.applied_at) AS INTEGER) FROM job_application_events e
     WHERE e.application_id = a.id AND e.kind IN ${RESPONSE_KINDS} AND a.applied_at IS NOT NULL) AS "firstResponseDays"
  FROM job_applications a LEFT JOIN clients c ON c.id = a.client_id AND c.deleted_at IS NULL`;

const EVENT_SELECT = `SELECT id, application_id AS applicationId, kind, date, time, due_date AS dueDate, notes,
  created_at AS createdAt FROM job_application_events`;

/** Próxima entrevista (con cita) o plazo de una prueba que aún no se ha enviado. */
function nextDates(ctx: AppContext, ids: string[]): Map<string, JobApplication['nextDate']> {
  const out = new Map<string, JobApplication['nextDate']>();
  if (!ids.length) return out;
  const today = todayISO(ctx.now());
  const rows = ctx.sqlite
    .prepare(
      `SELECT e.application_id AS id, e.kind, COALESCE(e.due_date, e.date) AS date, e.time,
         EXISTS (SELECT 1 FROM job_application_events s WHERE s.application_id = e.application_id
           AND s.kind = 'test_sent' AND s.date >= e.date) AS sent
       FROM job_application_events e
       WHERE e.application_id IN (${ids.map(() => '?').join(',')})
         AND ((e.kind = 'interview' AND e.date >= ?) OR (e.kind = 'test_received' AND e.due_date >= ?))
       ORDER BY date, e.time`,
    )
    .all(...ids, today, today) as {
    id: string;
    kind: string;
    date: string;
    time: string | null;
    sent: number;
  }[];
  for (const r of rows) {
    if (out.has(r.id) || (r.kind === 'test_received' && r.sent)) continue;
    out.set(r.id, {
      date: r.date,
      time: r.kind === 'interview' ? r.time : null,
      label: r.kind === 'interview' ? 'Entrevista' : 'Entrega de la prueba',
    });
  }
  return out;
}

function decode(rows: Record<string, unknown>[], ctx: AppContext): JobApplication[] {
  const apps = rows.map((r) => ({
    ...decodeRow<JobApplication>(APP_COLUMNS, r),
    clientName: (r.clientName as string | null) ?? null,
    lastEventAt: (r.lastEventAt as string | null) ?? null,
    eventCount: Number(r.eventCount ?? 0),
    firstResponseDays: r.firstResponseDays == null ? null : Number(r.firstResponseDays),
    nextDate: null as JobApplication['nextDate'],
  }));
  const next = nextDates(
    ctx,
    apps.map((a) => a.id),
  );
  for (const a of apps) a.nextDate = next.get(a.id) ?? null;
  return apps;
}

export function getApplication(ctx: AppContext, id: string): JobApplication {
  const row = ctx.sqlite.prepare(`${APP_SELECT} WHERE a.id = ? AND a.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('La candidatura');
  return decode([row as Record<string, unknown>], ctx)[0]!;
}

export function listApplications(ctx: AppContext): JobApplication[] {
  const rows = ctx.sqlite
    .prepare(`${APP_SELECT} WHERE a.deleted_at IS NULL ORDER BY a.position, a.created_at`)
    .all() as Record<string, unknown>[];
  return decode(rows, ctx);
}

export function listApplicationEvents(ctx: AppContext, applicationId: string): ApplicationEvent[] {
  return ctx.sqlite
    .prepare(
      `${EVENT_SELECT} WHERE application_id = ? ORDER BY date DESC, COALESCE(time, '') DESC, created_at DESC`,
    )
    .all(applicationId) as ApplicationEvent[];
}

function indexApplication(ctx: AppContext, a: JobApplication) {
  indexEntity(ctx, {
    entityType: 'job_application',
    entityId: a.id,
    title: `${a.title} · ${a.company}`,
    subtitle: ['Candidatura', labelOf(APPLICATION_STATUSES, a.status), a.location]
      .filter(Boolean)
      .join(' · '),
    text: [a.source, a.contactName, a.contactEmail, a.notes].filter(Boolean).join(' '),
  });
}

const statusLabel = (s: string) => labelOf(APPLICATION_STATUSES, s as ApplicationStatus);
const followUpDays = (ctx: AppContext) => getSettings(ctx).preferences.applicationFollowUpDays;

function insertEvent(
  ctx: AppContext,
  applicationId: string,
  e: {
    kind: string;
    date: string;
    time?: string | null;
    dueDate?: string | null;
    notes?: string | null;
  },
): string {
  const id = newId();
  ctx.sqlite
    .prepare(
      `INSERT INTO job_application_events (id, application_id, kind, date, time, due_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      applicationId,
      e.kind,
      e.date,
      e.time ?? null,
      e.dueDate ?? null,
      e.notes ?? null,
      ctx.nowISO(),
    );
  return id;
}

export function createApplication(ctx: AppContext, raw: unknown): JobApplication {
  const input = parse(applicationInputSchema, raw);
  assertExists(ctx, 'clients', input.clientId, 'El cliente');
  const today = todayISO(ctx.now());
  const max = ctx.sqlite.prepare('SELECT MAX(position) AS p FROM job_applications').get() as {
    p: number | null;
  };
  // Creada ya como solicitada: la fecha de solicitud es hoy si no se indica.
  const appliedAt =
    input.appliedAt ?? (STATUS_ORDER[input.status] >= STATUS_ORDER.applied ? today : null);
  const values = {
    ...input,
    appliedAt,
    followUpAt:
      input.followUpAt ??
      (appliedAt && AWAITING_STATUSES.includes(input.status)
        ? addDaysISO(appliedAt, followUpDays(ctx))
        : null),
    position: (max.p ?? 0) + 1,
    statusChangedAt: ctx.nowISO(),
  };
  let id = '';
  ctx.sqlite.transaction(() => {
    id = insertRow(ctx, 'job_applications', APP_COLUMNS, values);
    if (appliedAt) insertEvent(ctx, id, { kind: 'applied', date: appliedAt });
  })();
  const a = getApplication(ctx, id);
  indexApplication(ctx, a);
  logActivity(ctx, {
    entityType: 'job_application',
    entityId: id,
    action: 'crear',
    summary: `Candidatura «${a.title}» (${a.company}) creada`,
  });
  return a;
}

export function updateApplication(ctx: AppContext, id: string, raw: unknown): JobApplication {
  const patch = parse(applicationUpdateSchema, raw);
  const before = getApplication(ctx, id);
  assertExists(ctx, 'clients', patch.clientId, 'El cliente');
  const today = todayISO(ctx.now());
  ctx.sqlite.transaction(() => {
    const values: Record<string, unknown> = { ...patch };
    const changed = patch.status && patch.status !== before.status;
    if (changed) {
      values.statusChangedAt = ctx.nowISO();
      // Al pasar a «Solicitada» por primera vez, la fecha de solicitud es hoy.
      if (!before.appliedAt && !patch.appliedAt && STATUS_ORDER[patch.status!] >= 1)
        values.appliedAt = today;
      // Cerrada o aceptada: ya no hay que hacer seguimiento.
      if (!AWAITING_STATUSES.includes(patch.status!) && patch.followUpAt === undefined)
        values.followUpAt = null;
      else if (!before.followUpAt && patch.followUpAt === undefined)
        values.followUpAt = addDaysISO(today, followUpDays(ctx));
    }
    updateRow(ctx, 'job_applications', APP_COLUMNS, id, values, { what: 'La candidatura' });
    if (changed)
      insertEvent(ctx, id, {
        kind: 'status',
        date: today,
        notes: `${statusLabel(before.status)} → ${statusLabel(patch.status!)}`,
      });
  })();
  const a = getApplication(ctx, id);
  indexApplication(ctx, a);
  if (patch.status && patch.status !== before.status) {
    logActivity(ctx, {
      entityType: 'job_application',
      entityId: id,
      action: 'estado',
      summary: `«${a.title}» (${a.company}): ${statusLabel(before.status)} → ${statusLabel(a.status)}`,
    });
  }
  return a;
}

/**
 * Tras añadir un paso: el estado avanza solo (nunca retrocede) y la fecha de seguimiento se
 * cuenta desde el último paso mientras se espera respuesta.
 */
function afterEvent(ctx: AppContext, applicationId: string, kind: string, date: string) {
  const a = getApplication(ctx, applicationId);
  const target = APPLICATION_EVENT_KINDS.find((k) => k.value === kind)?.status ?? null;
  const values: Record<string, unknown> = {};
  let status = a.status;
  if (target && STATUS_ORDER[target] > STATUS_ORDER[a.status] && STATUS_ORDER[a.status] < 5) {
    status = target;
    values.status = target;
    values.statusChangedAt = ctx.nowISO();
  }
  if (kind === 'applied' && (!a.appliedAt || date < a.appliedAt)) values.appliedAt = date;
  if (AWAITING_STATUSES.includes(status) && kind !== 'note') {
    const last = (
      ctx.sqlite
        .prepare(
          `SELECT MAX(date) AS d FROM job_application_events WHERE application_id = ? AND kind <> 'status' AND kind <> 'note'`,
        )
        .get(applicationId) as { d: string | null }
    ).d;
    if (last) values.followUpAt = addDaysISO(last, followUpDays(ctx));
  }
  if (Object.keys(values).length)
    updateRow(ctx, 'job_applications', APP_COLUMNS, applicationId, values, {
      what: 'La candidatura',
    });
  if (values.status) {
    logActivity(ctx, {
      entityType: 'job_application',
      entityId: applicationId,
      action: 'estado',
      summary: `«${a.title}» (${a.company}): ${statusLabel(a.status)} → ${statusLabel(status)}`,
    });
  }
}

/** Crea el cliente (con su contacto y su tarifa) a partir de la candidatura y los enlaza. */
export function applicationToClient(ctx: AppContext, id: string): Client {
  const a = getApplication(ctx, id);
  if (a.clientId) return getClient(ctx, a.clientId);
  const today = todayISO(ctx.now());
  let website: string | null = null;
  if (a.url) {
    try {
      website = new URL(a.url).origin;
    } catch {
      website = null;
    }
  }
  let client!: Client;
  ctx.sqlite.transaction(() => {
    client = createClient(ctx, {
      name: a.company,
      kind: a.kind === 'freelance' ? 'agency' : 'studio',
      website,
      email: a.contactEmail,
      currency: a.currency,
      notes: `Cliente creado desde la candidatura «${a.title}».`,
    });
    if (a.contactName) {
      insertRow(
        ctx,
        'contacts',
        CONTACT_COLUMNS,
        parse(contactInputSchema, {
          clientId: client.id,
          name: a.contactName,
          email: a.contactEmail,
          isPrimary: true,
        }),
      );
    }
    if (a.rateMicros != null && a.rateUnit) {
      insertRow(
        ctx,
        'rates',
        RATE_COLUMNS,
        parse(rateInputSchema, {
          clientId: client.id,
          service: 'translation',
          sourceLang: a.sourceLang,
          targetLang: a.targetLang,
          unit: a.rateUnit,
          rateMicros: a.rateMicros,
          currency: a.currency,
        }),
      );
    }
    updateRow(
      ctx,
      'job_applications',
      APP_COLUMNS,
      id,
      { clientId: client.id },
      {
        what: 'La candidatura',
      },
    );
    insertEvent(ctx, id, { kind: 'note', date: today, notes: `Cliente «${client.name}» creado.` });
  })();
  return getClient(ctx, client.id);
}

export function registerCareerEntities(): void {
  registerTrashable({
    type: 'job_application',
    table: 'job_applications',
    titleSql: "title || ' · ' || company",
    onRestore: (ctx, id) => indexApplication(ctx, getApplication(ctx, id)),
  });
}

export async function applicationRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });
  const eventParam = z.object({ id: idSchema, eventId: idSchema });

  app.get('/api/job-applications', async () => listApplications(ctx));
  app.get('/api/job-applications/:id', async (req) =>
    getApplication(ctx, parse(idParam, req.params).id),
  );
  app.post('/api/job-applications', async (req, reply) => {
    reply.code(201);
    return createApplication(ctx, req.body);
  });
  app.patch('/api/job-applications/:id', async (req) =>
    updateApplication(ctx, parse(idParam, req.params).id, req.body),
  );
  app.delete('/api/job-applications/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getApplication(ctx, id);
    moveToTrash(ctx, 'job_application', id);
    return { ok: true };
  });
  app.post('/api/job-applications/:id/client', async (req) =>
    applicationToClient(ctx, parse(idParam, req.params).id),
  );

  app.get('/api/job-applications/:id/events', async (req) => {
    const { id } = parse(idParam, req.params);
    getApplication(ctx, id);
    return listApplicationEvents(ctx, id);
  });
  app.post('/api/job-applications/:id/events', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    getApplication(ctx, id);
    const input = parse(applicationEventInputSchema, req.body);
    let eventId = '';
    ctx.sqlite.transaction(() => {
      eventId = insertEvent(ctx, id, input);
      afterEvent(ctx, id, input.kind, input.date);
    })();
    reply.code(201);
    return listApplicationEvents(ctx, id).find((e) => e.id === eventId);
  });
  app.patch('/api/job-applications/:id/events/:eventId', async (req) => {
    const { id, eventId } = parse(eventParam, req.params);
    const patch = parse(applicationEventUpdateSchema, req.body);
    const current = listApplicationEvents(ctx, id).find((e) => e.id === eventId);
    if (!current) throw new NotFoundError('El paso');
    const cols: Record<string, string> = {
      kind: 'kind',
      date: 'date',
      time: 'time',
      dueDate: 'due_date',
      notes: 'notes',
    };
    const sets = Object.entries(patch).filter(([k, v]) => v !== undefined && cols[k]);
    if (sets.length) {
      ctx.sqlite
        .prepare(
          `UPDATE job_application_events SET ${sets.map(([k]) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`,
        )
        .run(...sets.map(([, v]) => v), eventId);
      afterEvent(ctx, id, patch.kind ?? current.kind, patch.date ?? current.date);
    }
    return listApplicationEvents(ctx, id).find((e) => e.id === eventId);
  });
  app.delete('/api/job-applications/:id/events/:eventId', async (req) => {
    const { id, eventId } = parse(eventParam, req.params);
    const res = ctx.sqlite
      .prepare('DELETE FROM job_application_events WHERE id = ? AND application_id = ?')
      .run(eventId, id);
    if (!res.changes) throw new NotFoundError('El paso');
    return { ok: true };
  });
}

const APP_COLOR = '#0891b2';

/** Entrevistas, plazos de pruebas, plazos para presentarse y seguimientos, para el calendario. */
export function applicationCalendarEvents(
  ctx: AppContext,
  from: string,
  to: string,
): CalendarEvent[] {
  const today = todayISO(ctx.now());
  const events: CalendarEvent[] = [];
  const rows = ctx.sqlite
    .prepare(
      `SELECT e.id, e.application_id AS appId, e.kind, e.date, e.time, e.due_date AS dueDate,
         a.title, a.company,
         EXISTS (SELECT 1 FROM job_application_events s WHERE s.application_id = e.application_id
           AND s.kind = 'test_sent' AND s.date >= e.date) AS sent
       FROM job_application_events e JOIN job_applications a ON a.id = e.application_id AND a.deleted_at IS NULL
       WHERE (e.kind = 'interview' AND e.date BETWEEN ? AND ?)
          OR (e.kind = 'test_received' AND e.due_date BETWEEN ? AND ?)`,
    )
    .all(from, to, from, to) as {
    id: string;
    appId: string;
    kind: string;
    date: string;
    time: string | null;
    dueDate: string | null;
    title: string;
    company: string;
    sent: number;
  }[];
  for (const r of rows) {
    const interview = r.kind === 'interview';
    events.push({
      id: `application-event:${r.id}`,
      kind: 'application',
      title: interview ? `Entrevista: ${r.company}` : `Entregar la prueba: ${r.company}`,
      date: interview ? r.date : r.dueDate!,
      time: interview ? r.time : null,
      color: APP_COLOR,
      done: interview ? r.date < today : r.sent === 1,
      entityId: r.appId,
      subtitle: r.title,
    });
  }
  const apps = ctx.sqlite
    .prepare(
      `SELECT id, title, company, status, deadline, follow_up_at AS followUpAt FROM job_applications
       WHERE deleted_at IS NULL AND ((deadline BETWEEN ? AND ?) OR (follow_up_at BETWEEN ? AND ?))`,
    )
    .all(from, to, from, to) as {
    id: string;
    title: string;
    company: string;
    status: ApplicationStatus;
    deadline: string | null;
    followUpAt: string | null;
  }[];
  for (const a of apps) {
    if (a.deadline && a.deadline >= from && a.deadline <= to && a.status === 'saved')
      events.push({
        id: `application-deadline:${a.id}`,
        kind: 'application',
        title: `Presentarse a: ${a.title}`,
        date: a.deadline,
        time: null,
        color: APP_COLOR,
        done: false,
        entityId: a.id,
        subtitle: a.company,
      });
    if (
      a.followUpAt &&
      a.followUpAt >= from &&
      a.followUpAt <= to &&
      AWAITING_STATUSES.includes(a.status)
    )
      events.push({
        id: `application-follow-up:${a.id}`,
        kind: 'application',
        title: `Seguimiento: ${a.company}`,
        date: a.followUpAt,
        time: null,
        color: APP_COLOR,
        done: false,
        entityId: a.id,
        subtitle: a.title,
      });
  }
  return events;
}

/** Avisos: seguimiento sin respuesta, entrevistas y pruebas próximas, plazos para presentarse. */
export function applicationReminders(ctx: AppContext): Reminder[] {
  const today = todayISO(ctx.now());
  const tomorrow = addDaysISO(today, 1);
  const reminders: Reminder[] = [];
  for (const a of listApplications(ctx)) {
    const route = `/empleo/${a.id}`;
    if (a.followUpAt && a.followUpAt <= today && AWAITING_STATUSES.includes(a.status)) {
      const since = a.lastEventAt ?? a.appliedAt;
      reminders.push({
        key: `application:${a.id}:seguimiento:${a.followUpAt}`,
        title: 'Candidatura sin respuesta',
        body: `No sabes nada de ${a.company} (${a.title})${since ? ` desde el ${formatDateES(since)}` : ''}. ¿Les escribes para preguntar?`,
        route,
      });
    }
    if (
      a.status === 'saved' &&
      a.deadline &&
      a.deadline >= today &&
      a.deadline <= addDaysISO(today, 2)
    )
      reminders.push({
        key: `application:${a.id}:plazo:${a.deadline}`,
        title: 'Plazo para presentarte',
        body: `${a.title} (${a.company}): hasta el ${formatDateES(a.deadline)}.`,
        route,
      });
    if (a.nextDate && a.nextDate.date <= tomorrow) {
      const when = a.nextDate.date === today ? 'hoy' : 'mañana';
      reminders.push({
        key: `application:${a.id}:${a.nextDate.label}:${a.nextDate.date}`,
        title:
          a.nextDate.label === 'Entrevista' ? `Entrevista ${when}` : `Entrega de la prueba ${when}`,
        body: `${a.company} (${a.title})${a.nextDate.time ? ` a las ${a.nextDate.time}` : ''}.`,
        route,
      });
    }
  }
  return reminders;
}

/** Resumen de la semana para la revisión semanal. */
export function applicationWeek(ctx: AppContext, from: string, to: string) {
  const count = (kinds: string) =>
    (
      ctx.sqlite
        .prepare(
          `SELECT COUNT(*) AS n FROM job_application_events e JOIN job_applications a ON a.id = e.application_id
           WHERE a.deleted_at IS NULL AND e.kind IN ${kinds} AND e.date BETWEEN ? AND ?`,
        )
        .get(from, to) as { n: number }
    ).n;
  return { sent: count(`('applied')`), responses: count(RESPONSE_KINDS) };
}
