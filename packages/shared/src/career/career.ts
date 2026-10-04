import { z } from 'zod';
import { isoDateSchema, optionalText, patchSchema, requiredText } from '../schemas/common';
import { UNITS, valuesOf } from '../work/enums';

/** Candidaturas a ofertas de trabajo: altas en agencias (freelance) y puestos en plantilla. */
export const APPLICATION_KINDS = [
  { value: 'freelance', label: 'Freelance (agencia)' },
  { value: 'in_house', label: 'En plantilla' },
] as const;
export type ApplicationKind = (typeof APPLICATION_KINDS)[number]['value'];

/** Etapas: abierta (aún no presentada), en curso, terminada (aceptada) y cerrada. */
export const APPLICATION_STATUSES = [
  { value: 'saved', label: 'Guardada', stage: 'open' },
  { value: 'applied', label: 'Solicitada', stage: 'active' },
  { value: 'test', label: 'Prueba', stage: 'active' },
  { value: 'interview', label: 'Entrevista', stage: 'active' },
  { value: 'offer', label: 'Oferta', stage: 'active' },
  { value: 'accepted', label: 'Aceptada', stage: 'done' },
  { value: 'rejected', label: 'Rechazada', stage: 'closed' },
  { value: 'no_response', label: 'Sin respuesta', stage: 'closed' },
  { value: 'withdrawn', label: 'Retirada', stage: 'closed' },
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]['value'];
const STATUS_VALUES = APPLICATION_STATUSES.map((s) => s.value) as [
  ApplicationStatus,
  ...ApplicationStatus[],
];

/**
 * Estados en los que se espera respuesta de la empresa (para el aviso de seguimiento). Con una
 * oferta, quien tiene que contestar eres tú.
 */
export const AWAITING_STATUSES: readonly ApplicationStatus[] = ['applied', 'test', 'interview'];

/** Orden del flujo: un paso nunca hace retroceder el estado. */
export const STATUS_ORDER: Record<ApplicationStatus, number> = {
  saved: 0,
  applied: 1,
  test: 2,
  interview: 3,
  offer: 4,
  accepted: 5,
  rejected: 5,
  no_response: 5,
  withdrawn: 5,
};

export const WORK_MODES = [
  { value: 'remote', label: 'En remoto' },
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'onsite', label: 'Presencial' },
] as const;

export const SALARY_PERIODS = [
  { value: 'year', label: 'al año' },
  { value: 'month', label: 'al mes' },
  { value: 'hour', label: 'por hora' },
] as const;

export const APPLICATION_SOURCES = [
  'LinkedIn',
  'ProZ',
  'Web de la empresa',
  'Recomendación',
  'Correo directo',
  'Feria o evento',
  'Otro',
] as const;

/** Pasos del historial. `status` lo añade la app al cambiar el estado a mano. */
export const APPLICATION_EVENT_KINDS = [
  { value: 'applied', label: 'Solicitud enviada', status: 'applied' },
  { value: 'test_received', label: 'Prueba recibida', status: 'test' },
  { value: 'test_sent', label: 'Prueba enviada', status: null },
  { value: 'interview', label: 'Entrevista', status: 'interview' },
  { value: 'follow_up', label: 'He escrito para preguntar', status: null },
  { value: 'response', label: 'Respuesta', status: null },
  { value: 'offer', label: 'Oferta recibida', status: 'offer' },
  { value: 'note', label: 'Nota', status: null },
  { value: 'status', label: 'Cambio de estado', status: null },
] as const;
export type ApplicationEventKind = (typeof APPLICATION_EVENT_KINDS)[number]['value'];
const EVENT_VALUES = APPLICATION_EVENT_KINDS.map((k) => k.value) as [
  ApplicationEventKind,
  ...ApplicationEventKind[],
];

const optDate = isoDateSchema.nullish().transform((v) => v ?? null);
const optCents = z
  .number()
  .int()
  .min(0)
  .max(1e13)
  .nullish()
  .transform((v) => v ?? null);
const optLang = z
  .string()
  .min(2)
  .max(8)
  .nullish()
  .transform((v) => v ?? null);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)')
  .nullish()
  .transform((v) => v ?? null);

export const applicationInputSchema = z.object({
  title: requiredText('Puesto', 300),
  company: requiredText('Empresa', 200),
  kind: z.enum(['freelance', 'in_house']).default('freelance'),
  status: z.enum(STATUS_VALUES).default('saved'),
  clientId: z
    .string()
    .max(64)
    .nullish()
    .transform((v) => v ?? null),
  source: optionalText(100),
  url: optionalText(1000),
  location: optionalText(200),
  workMode: z
    .enum(['remote', 'hybrid', 'onsite'])
    .nullish()
    .transform((v) => v ?? null),
  sourceLang: optLang,
  targetLang: optLang,
  contactName: optionalText(200),
  contactEmail: optionalText(200),
  salaryMinCents: optCents,
  salaryMaxCents: optCents,
  salaryPeriod: z
    .enum(['year', 'month', 'hour'])
    .nullish()
    .transform((v) => v ?? null),
  rateMicros: optCents,
  rateUnit: z
    .enum(valuesOf(UNITS))
    .nullish()
    .transform((v) => v ?? null),
  currency: z.string().length(3).default('EUR'),
  deadline: optDate,
  appliedAt: optDate,
  followUpAt: optDate,
  notes: optionalText(50_000),
});
export const applicationUpdateSchema = patchSchema(applicationInputSchema).extend({
  position: z.number().optional(),
});
export type ApplicationInput = z.input<typeof applicationInputSchema>;

export const applicationEventInputSchema = z.object({
  kind: z.enum(EVENT_VALUES).default('note'),
  date: isoDateSchema,
  time: timeSchema,
  /** Plazo de entrega (pruebas). */
  dueDate: optDate,
  notes: optionalText(20_000),
});
export const applicationEventUpdateSchema = patchSchema(applicationEventInputSchema);

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  kind: ApplicationEventKind;
  date: string;
  time: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface JobApplication {
  id: string;
  title: string;
  company: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  clientId: string | null;
  clientName: string | null;
  source: string | null;
  url: string | null;
  location: string | null;
  workMode: 'remote' | 'hybrid' | 'onsite' | null;
  sourceLang: string | null;
  targetLang: string | null;
  contactName: string | null;
  contactEmail: string | null;
  salaryMinCents: number | null;
  salaryMaxCents: number | null;
  salaryPeriod: 'year' | 'month' | 'hour' | null;
  rateMicros: number | null;
  rateUnit: string | null;
  currency: string;
  deadline: string | null;
  appliedAt: string | null;
  followUpAt: string | null;
  notes: string | null;
  position: number;
  statusChangedAt: string;
  /** Fecha del último paso del historial. */
  lastEventAt: string | null;
  /** Días entre la solicitud y la primera respuesta (prueba, entrevista, oferta o respuesta). */
  firstResponseDays: number | null;
  /** Próxima entrevista o plazo de prueba pendiente. */
  nextDate: { date: string; time: string | null; label: string } | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

/** «www.agencia.com» → «https://www.agencia.com» (para abrir el enlace y sacar la web). */
export function normalizeUrl(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}
