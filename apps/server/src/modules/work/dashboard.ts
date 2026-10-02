import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDaysISO,
  formatDateES,
  todayISO,
  type CalendarEvent,
  type Dashboard,
  type Reminder,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { getSettings } from '../../services/settings';
import { OPEN_JOB_STATUSES } from './clients';
import { listJobs } from './jobs';
import { listTasks } from './tasks';

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // lunes = 0
  const s = startOfLocalDay(d);
  s.setDate(s.getDate() - day);
  return s;
}

function trackedSince(ctx: AppContext, from: Date): number {
  const row = ctx.sqlite
    .prepare(
      `SELECT COALESCE(SUM(CAST((julianday(COALESCE(ended_at, ?)) - julianday(MAX(started_at, ?))) * 86400 AS INTEGER)), 0) AS s
       FROM time_entries WHERE deleted_at IS NULL AND COALESCE(ended_at, ?) > ?`,
    )
    .get(ctx.nowISO(), from.toISOString(), ctx.nowISO(), from.toISOString()) as { s: number };
  return Math.max(0, row.s);
}

export function buildDashboard(ctx: AppContext): Dashboard {
  const now = ctx.now();
  const today = todayISO(now);
  const baseCurrency = getSettings(ctx).preferences.baseCurrency;
  const monthStart = `${today.slice(0, 7)}-01`;
  const money = ctx.sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN j.delivered_at >= ? AND j.status != 'cancelled' THEN j.amount_cents END), 0) AS delivered,
         COALESCE(SUM(CASE WHEN j.billing_status = 'pending' AND j.status IN ('delivered','client_review','closed') THEN j.amount_cents END), 0) AS pending
       FROM jobs j JOIN projects p ON p.id = j.project_id
       WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.currency = ?`,
    )
    .get(monthStart, baseCurrency) as { delivered: number; pending: number };
  const activeJobCount = (
    ctx.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM jobs j JOIN projects p ON p.id = j.project_id
         WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND j.status IN ${OPEN_JOB_STATUSES}`,
      )
      .get() as { n: number }
  ).n;
  const collection = ctx.sqlite
    .prepare(
      `SELECT COALESCE(SUM(ROUND(total_cents * exchange_rate)), 0) AS pending,
              COALESCE(SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END), 0) AS overdue
       FROM invoices WHERE deleted_at IS NULL AND status = 'issued'`,
    )
    .get(today) as { pending: number; overdue: number };
  return {
    today,
    pendingCollectionCents: collection.pending,
    overdueInvoiceCount: collection.overdue,
    tasksToday: listTasks(ctx, { due: 'today', includeDone: false, limit: 50 }),
    tasksOverdue: listTasks(ctx, { due: 'overdue', limit: 50 }),
    upcomingJobs: listJobs(ctx, { open: true, dueFrom: today, dueTo: addDaysISO(today, 7) }),
    overdueJobs: listJobs(ctx, { open: true, dueTo: addDaysISO(today, -1) }),
    activeJobCount,
    secondsThisWeek: trackedSince(ctx, startOfLocalWeek(now)),
    secondsToday: trackedSince(ctx, startOfLocalDay(now)),
    deliveredThisMonthCents: money.delivered,
    pendingBillingCents: money.pending,
    baseCurrency,
  };
}

export function calendarEvents(ctx: AppContext, from: string, to: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const t of listTasks(ctx, { dueFrom: from, dueTo: to })) {
    events.push({
      id: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      date: t.dueDate!,
      time: t.dueTime,
      color: t.areaColor ?? t.statusColor,
      done: t.statusCategory === 'done',
      entityId: t.id,
      subtitle: t.projectName ?? t.areaName,
    });
  }
  for (const j of listJobs(ctx, { dueFrom: from, dueTo: to })) {
    events.push({
      id: `job:${j.id}`,
      kind: 'job',
      title: `Entrega: ${j.title}`,
      date: j.dueDate!,
      time: j.dueTime,
      color: '#4f46e5',
      done: !['received', 'in_progress', 'client_review'].includes(j.status),
      entityId: j.id,
      subtitle: [j.projectName, j.clientName].filter(Boolean).join(' · '),
    });
  }
  return events.sort((a, b) =>
    (a.date + (a.time ?? '99')).localeCompare(b.date + (b.time ?? '99')),
  );
}

/** Avisos pendientes; la interfaz decide cuáles mostrar (una vez por aviso y día). */
export function pendingReminders(ctx: AppContext): Reminder[] {
  const now = ctx.now();
  const today = todayISO(now);
  const reminders: Reminder[] = [];
  for (const j of listJobs(ctx, { open: true, dueTo: addDaysISO(today, 1) })) {
    if (!j.dueDate) continue;
    const due = new Date(`${j.dueDate}T${j.dueTime ?? '23:59'}:00`);
    const hours = (due.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0) {
      reminders.push({
        key: `job:${j.id}:retrasado:${today}`,
        title: 'Entrega atrasada',
        body: `${j.title} (${j.projectName}) debía entregarse el ${formatDateES(j.dueDate)}${j.dueTime ? ` a las ${j.dueTime}` : ''}.`,
        route: `/trabajo/encargos/${j.id}`,
      });
    } else if (hours <= 24) {
      reminders.push({
        key: `job:${j.id}:24h`,
        title: 'Entrega en menos de 24 horas',
        body: `${j.title} (${j.projectName}): ${formatDateES(j.dueDate)}${j.dueTime ? ` a las ${j.dueTime}` : ''}.`,
        route: `/trabajo/encargos/${j.id}`,
      });
    }
  }
  const overdueInvoices = ctx.sqlite
    .prepare(
      `SELECT i.id, i.number, i.due_date AS dueDate, c.name AS clientName FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.deleted_at IS NULL AND i.status = 'issued' AND i.due_date < ?`,
    )
    .all(today) as { id: string; number: string; dueDate: string; clientName: string | null }[];
  for (const inv of overdueInvoices) {
    reminders.push({
      key: `invoice:${inv.id}:${today.slice(0, 7)}`,
      title: 'Cobro atrasado',
      body: `La factura ${inv.number}${inv.clientName ? ` (${inv.clientName})` : ''} vencía el ${formatDateES(inv.dueDate)}.`,
      route: '/finanzas/facturas',
    });
  }
  const dueTasks = listTasks(ctx, { due: 'today_or_overdue', limit: 50 });
  if (dueTasks.length > 0) {
    const overdue = dueTasks.filter((t) => t.dueDate! < today).length;
    reminders.push({
      key: `tasks:${today}`,
      title: overdue > 0 ? 'Tienes tareas vencidas' : 'Tareas para hoy',
      body:
        overdue > 0
          ? `${overdue} vencidas y ${dueTasks.length - overdue} para hoy.`
          : `${dueTasks.length} ${dueTasks.length === 1 ? 'tarea' : 'tareas'} para hoy.`,
      route: '/trabajo/tareas',
    });
  }
  return reminders;
}

export async function dashboardRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  app.get('/api/dashboard', async () => buildDashboard(ctx));

  app.get('/api/calendar', async (req) => {
    const q = parse(
      z.object({ from: z.string().length(10), to: z.string().length(10) }),
      req.query,
    );
    return calendarEvents(ctx, q.from, q.to);
  });

  app.get('/api/reminders', async () => pendingReminders(ctx));
}
