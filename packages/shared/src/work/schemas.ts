import { z } from 'zod';
import {
  idSchema,
  isoDateSchema,
  optionalText,
  patchSchema,
  requiredText,
  colorSchema,
} from '../schemas/common';
import {
  BILLING_STATUSES,
  BUSINESS_MODELS,
  CLIENT_KINDS,
  CONTENT_TYPES,
  GAME_STATUSES,
  JOB_STATUSES,
  PROJECT_STATUSES,
  QUERY_STATUSES,
  SERVICES,
  TASK_STATUS_CATEGORIES,
  UNITS,
  valuesOf,
} from './enums';

const optId = idSchema.nullish().transform((v) => v ?? null);
const optDate = isoDateSchema.nullish().transform((v) => v ?? null);
const optInt = (min = 0, max = 1_000_000_000_000) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);
const optNum = (min = 0, max = 1e12) =>
  z
    .number()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);
const lang = z.string().min(2).max(8);
const optLang = lang.nullish().transform((v) => v ?? null);
const stringList = z.array(z.string().trim().min(1).max(80)).max(50).default([]);

export const catGridSchema = z.record(z.string(), z.number().min(0).max(200));
export const catBandSchema = z.object({
  key: z.string().min(1).max(30),
  count: z.number().min(0).max(1e9),
  pct: z.number().min(0).max(200),
});

// ── Clientes ───────────────────────────────────────────────────────────────
export const clientInputSchema = z.object({
  name: requiredText('Nombre', 200),
  kind: z.enum(valuesOf(CLIENT_KINDS)).default('agency'),
  legalName: optionalText(200),
  taxId: optionalText(50),
  country: optionalText(80),
  address: optionalText(500),
  email: optionalText(200),
  website: optionalText(300),
  currency: z.string().length(3).default('EUR'),
  paymentTermsDays: optInt(0, 365),
  vatPct: optNum(0, 100),
  irpfPct: optNum(0, 100),
  platform: optionalText(200),
  ndaSignedAt: optDate,
  catGrid: catGridSchema.nullish().transform((v) => v ?? null),
  rating: optInt(0, 5),
  active: z.boolean().default(true),
  notes: optionalText(20_000),
});
export const clientUpdateSchema = patchSchema(clientInputSchema);
export type ClientInput = z.input<typeof clientInputSchema>;

export const contactInputSchema = z.object({
  clientId: idSchema,
  name: requiredText('Nombre', 200),
  role: optionalText(100),
  email: optionalText(200),
  phone: optionalText(50),
  isPrimary: z.boolean().default(false),
  notes: optionalText(5000),
});
export const contactUpdateSchema = patchSchema(contactInputSchema.omit({ clientId: true }));

/** Herramientas con acceso propio de cada cliente (servidor de memoQ, Trados…). */
export const ACCOUNT_TOOLS = [
  { value: 'memoq', label: 'memoQ' },
  { value: 'trados', label: 'Trados' },
  { value: 'phrase', label: 'Phrase (Memsource)' },
  { value: 'xtm', label: 'XTM' },
  { value: 'smartcat', label: 'Smartcat' },
  { value: 'crowdin', label: 'Crowdin' },
  { value: 'other', label: 'Otra' },
] as const;

export const clientAccountInputSchema = z.object({
  clientId: idSchema,
  tool: z
    .enum(['memoq', 'trados', 'phrase', 'xtm', 'smartcat', 'crowdin', 'other'])
    .default('memoq'),
  label: optionalText(120),
  serverUrl: optionalText(500),
  username: optionalText(200),
  password: optionalText(500),
  notes: optionalText(5000),
});
export const clientAccountUpdateSchema = patchSchema(
  clientAccountInputSchema.omit({ clientId: true }),
);

export const rateInputSchema = z.object({
  clientId: optId,
  service: z.enum(valuesOf(SERVICES)).default('translation'),
  sourceLang: optLang,
  targetLang: optLang,
  unit: z.enum(valuesOf(UNITS)).default('word'),
  rateMicros: z.number().int().min(0).max(1e12),
  currency: z.string().length(3).default('EUR'),
  minimumCents: optInt(0),
  notes: optionalText(2000),
});
export const rateUpdateSchema = patchSchema(rateInputSchema);

// ── Juegos ─────────────────────────────────────────────────────────────────
export const gameInputSchema = z.object({
  title: requiredText('Título', 300),
  originalTitle: optionalText(300),
  titleEs: optionalText(300),
  titleEn: optionalText(300),
  developer: optionalText(200),
  publisher: optionalText(200),
  releaseYear: optInt(1950, 2100),
  genres: stringList,
  platforms: stringList,
  businessModel: z
    .enum(valuesOf(BUSINESS_MODELS))
    .nullish()
    .transform((v) => v ?? null),
  pegi: optionalText(20),
  status: z.enum(valuesOf(GAME_STATUSES)).default('released'),
  website: optionalText(300),
  notes: optionalText(20_000),
});
export const gameUpdateSchema = patchSchema(gameInputSchema);

// ── Proyectos y encargos ───────────────────────────────────────────────────
export const projectInputSchema = z.object({
  name: requiredText('Nombre', 300),
  clientId: optId,
  gameId: optId,
  contactId: optId,
  sourceLang: optLang,
  targetLang: optLang,
  status: z.enum(valuesOf(PROJECT_STATUSES)).default('active'),
  catTool: optionalText(100),
  startDate: optDate,
  endDate: optDate,
  localFolder: optionalText(1000),
  color: colorSchema.nullish().transform((v) => v ?? null),
  notes: optionalText(20_000),
  templateId: optId,
});
export const projectUpdateSchema = patchSchema(projectInputSchema.omit({ templateId: true }));

export const jobInputSchema = z.object({
  projectId: idSchema,
  title: requiredText('Título', 300),
  poNumber: optionalText(100),
  service: z.enum(valuesOf(SERVICES)).default('translation'),
  contentType: z
    .enum(valuesOf(CONTENT_TYPES))
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(valuesOf(JOB_STATUSES)).default('received'),
  receivedAt: optDate,
  dueDate: optDate,
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Hora no válida (HH:MM)')
    .nullish()
    .transform((v) => v ?? null),
  deliveredAt: optDate,
  unit: z.enum(valuesOf(UNITS)).default('word'),
  volume: optNum(0, 1e9),
  catAnalysis: z
    .array(catBandSchema)
    .max(20)
    .nullish()
    .transform((v) => v ?? null),
  rateMicros: optInt(0),
  currency: z.string().length(3).default('EUR'),
  amountCents: optInt(0),
  amountManual: z.boolean().default(false),
  billingStatus: z.enum(valuesOf(BILLING_STATUSES)).default('pending'),
  notes: optionalText(20_000),
  templateId: optId,
});
export const jobUpdateSchema = patchSchema(jobInputSchema.omit({ templateId: true }));

// ── Tareas ─────────────────────────────────────────────────────────────────
export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365).default(1),
  monthlyMode: z.enum(['same_day', 'last_weekday']).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

export const taskInputSchema = z.object({
  title: requiredText('Título', 500),
  description: optionalText(50_000),
  statusId: optId,
  priority: z.number().int().min(1).max(4).default(3),
  areaId: optId,
  listId: optId,
  projectId: optId,
  jobId: optId,
  gameId: optId,
  parentId: optId,
  relatedType: optionalText(40),
  relatedId: optionalText(64),
  startDate: optDate,
  dueDate: optDate,
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Hora no válida (HH:MM)')
    .nullish()
    .transform((v) => v ?? null),
  estimateMinutes: optInt(0, 100_000),
  recurrence: recurrenceSchema.nullish().transform((v) => v ?? null),
  sortOrder: z.number().optional(),
});
export const taskUpdateSchema = patchSchema(taskInputSchema);

export const taskStatusInputSchema = z.object({
  name: requiredText('Nombre', 60),
  color: colorSchema.default('#6b7280'),
  category: z.enum(valuesOf(TASK_STATUS_CATEGORIES)).default('todo'),
});

export const areaInputSchema = z.object({
  name: requiredText('Nombre', 60),
  color: colorSchema.default('#6366f1'),
});

export const taskListInputSchema = z.object({
  areaId: idSchema,
  name: requiredText('Nombre', 100),
  color: colorSchema.nullish().transform((v) => v ?? null),
});

export const checklistItemInputSchema = z.object({
  entityType: z.string().min(1).max(40),
  entityId: idSchema,
  text: requiredText('Texto', 1000),
  done: z.boolean().default(false),
});

export const commentInputSchema = z.object({
  entityType: z.string().min(1).max(40),
  entityId: idSchema,
  body: requiredText('Comentario', 20_000),
});

// ── Tiempo ─────────────────────────────────────────────────────────────────
export const timeEntryInputSchema = z.object({
  taskId: optId,
  jobId: optId,
  projectId: optId,
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas'),
  endedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas')
    .nullish()
    .transform((v) => v ?? null),
  note: optionalText(2000),
  billable: z.boolean().default(true),
});
export const timeEntryUpdateSchema = patchSchema(timeEntryInputSchema);

export const timerStartSchema = z.object({
  taskId: optId,
  jobId: optId,
  projectId: optId,
  note: optionalText(2000),
});

// ── Consultas ──────────────────────────────────────────────────────────────
export const clientQueryInputSchema = z.object({
  projectId: idSchema,
  jobId: optId,
  stringId: optionalText(300),
  sourceText: optionalText(10_000),
  context: optionalText(10_000),
  question: requiredText('Pregunta', 10_000),
  answer: optionalText(10_000),
  status: z.enum(valuesOf(QUERY_STATUSES)).default('draft'),
  askedAt: optDate,
  answeredAt: optDate,
});
export const clientQueryUpdateSchema = patchSchema(clientQueryInputSchema);

// ── Plantillas ─────────────────────────────────────────────────────────────
export const templateTaskSchema = z.object({
  title: requiredText('Título', 500),
  /** Días antes (negativo) o después de la fecha de referencia (entrega del encargo o inicio del proyecto). */
  offsetDays: z
    .number()
    .int()
    .min(-365)
    .max(365)
    .nullish()
    .transform((v) => v ?? null),
  priority: z.number().int().min(1).max(4).default(3),
  checklist: z.array(z.string().min(1).max(500)).max(50).default([]),
});

export const templateInputSchema = z.object({
  name: requiredText('Nombre', 200),
  kind: z.enum(['project', 'job']),
  tasks: z.array(templateTaskSchema).max(100).default([]),
});
export const templateUpdateSchema = patchSchema(templateInputSchema);
