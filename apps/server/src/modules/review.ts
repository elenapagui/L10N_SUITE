import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDaysISO, mondayOfISO, todayISO, type WeeklyReview } from '@l10n/shared';
import type { AppContext } from '../context';
import { parse } from '../lib/validate';
import { getSettings } from '../services/settings';
import { cashForecast, currencyRates } from './finance/reports';
import { listInvoices } from './finance/invoices';
import { calendarEvents } from './work/dashboard';
import { listTasks } from './work/tasks';

const toBase = (cents: number, rate: number) => Math.round(cents * (rate || 1));
const SECS = `(julianday(te.ended_at) - julianday(te.started_at)) * 86400`;

/**
 * Revisión de una semana (lunes a domingo): lo hecho en ella y lo que viene en la siguiente.
 * Sin fecha, la semana revisada es la anterior a la actual (la revisión del lunes).
 */
export function weeklyReview(ctx: AppContext, week?: string): WeeklyReview {
  const today = todayISO(ctx.now());
  const weekStart = mondayOfISO(week ?? addDaysISO(today, -7));
  const weekEnd = addDaysISO(weekStart, 6);
  const nextStart = addDaysISO(weekStart, 7);
  const nextEnd = addDaysISO(weekStart, 13);
  const range = [weekStart, weekEnd] as const;
  const baseCurrency = getSettings(ctx).preferences.baseCurrency;
  const invoices = listInvoices(ctx).filter((i) => i.status !== 'cancelled');
  const fx = currencyRates(ctx, invoices);
  const day = (col: string) => `substr(${col}, 1, 10) BETWEEN ? AND ?`;

  // Encargos entregados.
  const delivered = ctx.sqlite
    .prepare(
      `SELECT j.id, j.title, j.delivered_at AS deliveredAt, j.unit, COALESCE(j.weighted_volume, j.volume) AS volume,
              j.amount_cents AS cents, j.currency, i.exchange_rate AS invoiceRate, c.name AS clientName
       FROM jobs j JOIN projects p ON p.id = j.project_id LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN invoices i ON i.id = j.invoice_id
       WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.status != 'cancelled' AND ${day('j.delivered_at')}
       ORDER BY j.delivered_at`,
    )
    .all(...range) as {
    id: string;
    title: string;
    deliveredAt: string;
    unit: string;
    volume: number | null;
    cents: number | null;
    currency: string;
    invoiceRate: number | null;
    clientName: string | null;
  }[];
  const units = new Map<string, number>();
  let deliveredCents = 0;
  for (const j of delivered) {
    if (j.unit !== 'flat' && j.volume) units.set(j.unit, (units.get(j.unit) ?? 0) + j.volume);
    const rate = j.invoiceRate ?? fx.get(j.currency);
    if (rate != null) deliveredCents += toBase(j.cents ?? 0, rate);
  }

  // Facturas emitidas y cobros.
  const issued = invoices.filter((i) => i.issueDate >= weekStart && i.issueDate <= weekEnd);
  const paid = invoices.filter(
    (i) => i.status === 'paid' && i.paidAt && i.paidAt >= weekStart && i.paidAt <= weekEnd,
  );

  // Horas por área (la de la tarea; los encargos y proyectos cuentan como «Trabajo»).
  const hours = ctx.sqlite
    .prepare(
      `SELECT COALESCE(a.name, CASE WHEN te.job_id IS NOT NULL OR te.project_id IS NOT NULL THEN 'Trabajo' ELSE 'Sin área' END) AS name,
              COALESCE(a.color, CASE WHEN te.job_id IS NOT NULL OR te.project_id IS NOT NULL THEN '#6366f1' ELSE '#94a3b8' END) AS color,
              SUM(${SECS}) / 3600.0 AS hours
       FROM time_entries te LEFT JOIN tasks t ON t.id = te.task_id LEFT JOIN areas a ON a.id = t.area_id
       WHERE te.deleted_at IS NULL AND te.ended_at IS NOT NULL AND ${day('te.started_at')}
       GROUP BY 1, 2 ORDER BY hours DESC`,
    )
    .all(...range) as { name: string; color: string; hours: number }[];

  const completed = ctx.sqlite
    .prepare(
      `SELECT title FROM tasks WHERE deleted_at IS NULL AND completed_at IS NOT NULL AND ${day('completed_at')}
       ORDER BY completed_at DESC`,
    )
    .all(...range) as { title: string }[];

  // Investigación: cambios de estado de publicaciones, envíos y lecturas terminadas.
  const activity = ctx.sqlite
    .prepare(
      `SELECT entity_type AS entityType, entity_id AS entityId, summary, created_at AS createdAt
       FROM activity_log WHERE entity_type IN ('publication', 'submission', 'reference')
       AND action IN ('crear', 'estado') AND ${day('created_at')} ORDER BY created_at`,
    )
    .all(...range) as {
    entityType: string;
    entityId: string;
    summary: string;
    createdAt: string;
  }[];
  const referencesRead = activity.filter((a) => a.entityType === 'reference').length;
  const referencesAdded = (
    ctx.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM bib_references WHERE deleted_at IS NULL AND ${day('created_at')}`,
      )
      .get(...range) as { n: number }
  ).n;
  const corpus = ctx.sqlite
    .prepare(
      `SELECT COUNT(DISTINCT d.id) AS documents, COUNT(s.id) AS segments
       FROM corpus_documents d LEFT JOIN segments s ON s.document_id = d.id
       WHERE d.deleted_at IS NULL AND ${day('d.created_at')}`,
    )
    .get(...range) as { documents: number; segments: number };

  // La semana que viene.
  const events = calendarEvents(ctx, nextStart, nextEnd);
  const deliveries = ctx.sqlite
    .prepare(
      `SELECT j.id, j.title, j.due_date AS dueDate, j.due_time AS dueTime, c.name AS clientName
       FROM jobs j JOIN projects p ON p.id = j.project_id LEFT JOIN clients c ON c.id = p.client_id
       WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.status IN ('received', 'in_progress', 'client_review')
         AND j.due_date BETWEEN ? AND ? ORDER BY j.due_date, j.due_time`,
    )
    .all(nextStart, nextEnd) as WeeklyReview['next']['deliveries'];
  const tasks = listTasks(ctx, { dueFrom: nextStart, dueTo: nextEnd, topLevel: true })
    .filter((t) => t.statusCategory !== 'done')
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate! }));
  const forecast = cashForecast(ctx, 2);
  const nextItems = forecast.items.filter(
    (i) =>
      !i.overdue && i.baseCents != null && i.expectedDate >= nextStart && i.expectedDate <= nextEnd,
  );
  const overdueTasks = listTasks(ctx, { due: 'overdue', limit: 1000 }).length;

  return {
    weekStart,
    weekEnd,
    nextStart,
    nextEnd,
    baseCurrency,
    done: {
      delivered: {
        count: delivered.length,
        cents: deliveredCents,
        units: [...units].map(([unit, volume]) => ({ unit, volume })),
        jobs: delivered.map((j) => ({
          id: j.id,
          title: j.title,
          clientName: j.clientName,
          deliveredAt: j.deliveredAt,
        })),
      },
      invoiced: {
        count: issued.length,
        cents: issued.reduce((s, i) => s + toBase(i.baseCents, i.exchangeRate), 0),
      },
      collected: {
        count: paid.length,
        cents: paid.reduce((s, i) => s + toBase(i.totalCents, i.exchangeRate), 0),
      },
      hours: { total: hours.reduce((s, h) => s + h.hours, 0), byArea: hours },
      tasksCompleted: {
        count: completed.length,
        titles: completed.slice(0, 12).map((t) => t.title),
      },
      academic: activity.filter((a) => a.entityType !== 'reference'),
      referencesRead,
      referencesAdded,
      corpus,
    },
    next: {
      deliveries,
      tasks,
      deadlines: events
        .filter((e) => e.kind === 'publication' || e.kind === 'submission')
        .map((e) => ({ kind: e.kind, id: e.entityId, title: e.title, date: e.date })),
      collections: {
        cents: nextItems.reduce((s, i) => s + i.baseCents!, 0),
        count: nextItems.length,
      },
      overdueCollectionsCents: forecast.overdueCents,
      overdueTasks,
    },
  };
}

export async function reviewRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  app.get('/api/review/weekly', async (req) => {
    const q = parse(
      z.object({
        week: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    return weeklyReview(ctx, q.week);
  });
}
