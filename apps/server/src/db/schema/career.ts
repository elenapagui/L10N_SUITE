import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';
import { clients } from './work';

/** Candidaturas a ofertas de trabajo (altas en agencias y puestos en plantilla). */
export const jobApplications = sqliteTable(
  'job_applications',
  {
    id: id(),
    title: text('title').notNull(),
    company: text('company').notNull(),
    kind: text('kind').notNull().default('freelance'),
    status: text('status').notNull().default('saved'),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
    source: text('source'),
    url: text('url'),
    location: text('location'),
    workMode: text('work_mode'),
    sourceLang: text('source_lang'),
    targetLang: text('target_lang'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    salaryMinCents: integer('salary_min_cents'),
    salaryMaxCents: integer('salary_max_cents'),
    salaryPeriod: text('salary_period'),
    rateMicros: integer('rate_micros'),
    rateUnit: text('rate_unit'),
    currency: text('currency').notNull().default('EUR'),
    deadline: text('deadline'),
    appliedAt: text('applied_at'),
    followUpAt: text('follow_up_at'),
    notes: text('notes'),
    position: real('position').notNull().default(0),
    statusChangedAt: text('status_changed_at').notNull(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('job_applications_status_idx').on(t.status),
    index('job_applications_follow_up_idx').on(t.followUpAt),
  ],
);

/** Historial de cada candidatura: solicitud, pruebas, entrevistas, respuestas… */
export const jobApplicationEvents = sqliteTable(
  'job_application_events',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('note'),
    date: text('date').notNull(),
    time: text('time'),
    dueDate: text('due_date'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('job_application_events_app_idx').on(t.applicationId),
    index('job_application_events_due_idx').on(t.dueDate),
  ],
);
