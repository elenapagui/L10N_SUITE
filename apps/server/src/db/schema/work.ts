import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';

export const clients = sqliteTable(
  'clients',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('agency'),
    legalName: text('legal_name'),
    taxId: text('tax_id'),
    country: text('country'),
    address: text('address'),
    email: text('email'),
    website: text('website'),
    currency: text('currency').notNull().default('EUR'),
    paymentTermsDays: integer('payment_terms_days'),
    vatPct: real('vat_pct'),
    irpfPct: real('irpf_pct'),
    platform: text('platform'),
    ndaSignedAt: text('nda_signed_at'),
    catGrid: text('cat_grid', { mode: 'json' }),
    rating: integer('rating'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('clients_name_idx').on(t.name)],
);

export const contacts = sqliteTable(
  'contacts',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    email: text('email'),
    phone: text('phone'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('contacts_client_idx').on(t.clientId)],
);

export const rates = sqliteTable(
  'rates',
  {
    id: id(),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    service: text('service').notNull(),
    sourceLang: text('source_lang'),
    targetLang: text('target_lang'),
    unit: text('unit').notNull(),
    rateMicros: integer('rate_micros').notNull(),
    currency: text('currency').notNull().default('EUR'),
    minimumCents: integer('minimum_cents'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('rates_client_idx').on(t.clientId)],
);

export const games = sqliteTable(
  'games',
  {
    id: id(),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    titleEs: text('title_es'),
    titleEn: text('title_en'),
    developer: text('developer'),
    publisher: text('publisher'),
    releaseYear: integer('release_year'),
    genres: text('genres', { mode: 'json' }).notNull().default('[]'),
    platforms: text('platforms', { mode: 'json' }).notNull().default('[]'),
    businessModel: text('business_model'),
    pegi: text('pegi'),
    status: text('status').notNull().default('released'),
    website: text('website'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('games_title_idx').on(t.title)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: id(),
    name: text('name').notNull(),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    sourceLang: text('source_lang'),
    targetLang: text('target_lang'),
    status: text('status').notNull().default('active'),
    catTool: text('cat_tool'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    localFolder: text('local_folder'),
    color: text('color'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('projects_client_idx').on(t.clientId),
    index('projects_game_idx').on(t.gameId),
    index('projects_status_idx').on(t.status),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    poNumber: text('po_number'),
    service: text('service').notNull().default('translation'),
    contentType: text('content_type'),
    status: text('status').notNull().default('received'),
    receivedAt: text('received_at'),
    dueDate: text('due_date'),
    dueTime: text('due_time'),
    deliveredAt: text('delivered_at'),
    unit: text('unit').notNull().default('word'),
    volume: real('volume'),
    catAnalysis: text('cat_analysis', { mode: 'json' }),
    weightedVolume: real('weighted_volume'),
    rateMicros: integer('rate_micros'),
    currency: text('currency').notNull().default('EUR'),
    amountCents: integer('amount_cents'),
    amountManual: integer('amount_manual', { mode: 'boolean' }).notNull().default(false),
    billingStatus: text('billing_status').notNull().default('pending'),
    invoiceId: text('invoice_id'),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('jobs_project_idx').on(t.projectId),
    index('jobs_due_idx').on(t.dueDate),
    index('jobs_status_idx').on(t.status),
    index('jobs_billing_idx').on(t.billingStatus),
  ],
);

export const taskStatuses = sqliteTable('task_statuses', {
  id: id(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  category: text('category').notNull(),
  sortOrder: real('sort_order').notNull().default(0),
});

export const areas = sqliteTable('areas', {
  id: id(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  sortOrder: real('sort_order').notNull().default(0),
  deletedAt: text('deleted_at'),
});

export const taskLists = sqliteTable(
  'task_lists',
  {
    id: id(),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    sortOrder: real('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('task_lists_area_idx').on(t.areaId)],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    title: text('title').notNull(),
    description: text('description'),
    statusId: text('status_id')
      .notNull()
      .references(() => taskStatuses.id),
    priority: integer('priority').notNull().default(3),
    areaId: text('area_id').references(() => areas.id, { onDelete: 'set null' }),
    listId: text('list_id').references(() => taskLists.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    parentId: text('parent_id'),
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    startDate: text('start_date'),
    dueDate: text('due_date'),
    dueTime: text('due_time'),
    estimateMinutes: integer('estimate_minutes'),
    recurrence: text('recurrence', { mode: 'json' }),
    completedAt: text('completed_at'),
    sortOrder: real('sort_order').notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('tasks_status_idx').on(t.statusId),
    index('tasks_due_idx').on(t.dueDate),
    index('tasks_project_idx').on(t.projectId),
    index('tasks_job_idx').on(t.jobId),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_area_idx').on(t.areaId),
    index('tasks_related_idx').on(t.relatedType, t.relatedId),
  ],
);

export const checklistItems = sqliteTable(
  'checklist_items',
  {
    id: id(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    sortOrder: real('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('checklist_entity_idx').on(t.entityType, t.entityId)],
);

export const comments = sqliteTable(
  'comments',
  {
    id: id(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    body: text('body').notNull(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('comments_entity_idx').on(t.entityType, t.entityId)],
);

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: id(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    note: text('note'),
    billable: integer('billable', { mode: 'boolean' }).notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('time_started_idx').on(t.startedAt),
    index('time_task_idx').on(t.taskId),
    index('time_job_idx').on(t.jobId),
    index('time_project_idx').on(t.projectId),
  ],
);

export const clientQueries = sqliteTable(
  'client_queries',
  {
    id: id(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    stringId: text('string_id'),
    sourceText: text('source_text'),
    context: text('context'),
    question: text('question').notNull(),
    answer: text('answer'),
    status: text('status').notNull().default('draft'),
    askedAt: text('asked_at'),
    answeredAt: text('answered_at'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('queries_project_idx').on(t.projectId), index('queries_job_idx').on(t.jobId)],
);

export const templates = sqliteTable('templates', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  tasks: text('tasks', { mode: 'json' }).notNull().default('[]'),
  ...timestamps(),
  ...softDelete(),
});

/** Accesos de cada cliente a sus herramientas (servidor de memoQ, Trados, Phrase…). */
export const clientAccounts = sqliteTable(
  'client_accounts',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull().default('memoq'),
    label: text('label'),
    serverUrl: text('server_url'),
    username: text('username'),
    /** Sin cifrar, por decisión de la usuaria (se avisa en la ficha). */
    password: text('password'),
    notes: text('notes'),
    sortOrder: real('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('client_accounts_client_idx').on(t.clientId)],
);
