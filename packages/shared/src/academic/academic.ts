import { z } from 'zod';
import { isoDateSchema, optionalText, patchSchema, requiredText } from '../schemas/common';
import type { CslItem } from './csl';

export const PUBLICATION_TYPES = [
  { value: 'article', label: 'Artículo' },
  { value: 'chapter', label: 'Capítulo' },
  { value: 'conference', label: 'Ponencia o comunicación' },
  { value: 'review', label: 'Reseña' },
  { value: 'book', label: 'Libro' },
  { value: 'other', label: 'Otro' },
] as const;
export type PublicationType = (typeof PUBLICATION_TYPES)[number]['value'];

/** Flujo de un artículo, de la idea a la publicación. */
export const PUBLICATION_STATUSES = [
  { value: 'idea', label: 'Idea', stage: 'writing' },
  { value: 'outline', label: 'Esquema', stage: 'writing' },
  { value: 'drafting', label: 'Redacción', stage: 'writing' },
  { value: 'internal_review', label: 'Revisión interna', stage: 'writing' },
  { value: 'submitted', label: 'Enviado', stage: 'review' },
  { value: 'peer_review', label: 'Revisión por pares', stage: 'review' },
  { value: 'revisions', label: 'Cambios solicitados', stage: 'review' },
  { value: 'resubmitted', label: 'Reenviado', stage: 'review' },
  { value: 'accepted', label: 'Aceptado', stage: 'done' },
  { value: 'in_press', label: 'En prensa', stage: 'done' },
  { value: 'published', label: 'Publicado', stage: 'done' },
  { value: 'rejected', label: 'Rechazado o reorientado', stage: 'closed' },
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]['value'];
const STATUS_VALUES = PUBLICATION_STATUSES.map((s) => s.value) as [
  PublicationStatus,
  ...PublicationStatus[],
];

export const SUBMISSION_DECISIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'desk_reject', label: 'Rechazo editorial' },
  { value: 'reject', label: 'Rechazado tras revisión' },
  { value: 'major', label: 'Cambios mayores' },
  { value: 'minor', label: 'Cambios menores' },
  { value: 'accept', label: 'Aceptado' },
  { value: 'withdrawn', label: 'Retirado' },
] as const;
export type SubmissionDecision = (typeof SUBMISSION_DECISIONS)[number]['value'];

export const JOURNAL_INDEXES = [
  'JCR',
  'SJR',
  'Scopus',
  'ESCI',
  'ERIH PLUS',
  'DOAJ',
  'Latindex',
  'MIAR',
  'REDIB',
  'Dialnet',
  'FECYT',
  'MLA',
] as const;

export const OPEN_ACCESS = [
  { value: 'diamond', label: 'Diamante (gratis para autores y lectores)' },
  { value: 'gold', label: 'Dorado (con APC)' },
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'closed', label: 'Suscripción' },
  { value: 'unknown', label: 'Sin determinar' },
] as const;
export type OpenAccess = (typeof OPEN_ACCESS)[number]['value'];

export const QUARTILES = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

export const READ_STATUSES = [
  { value: 'unread', label: 'Pendiente' },
  { value: 'reading', label: 'Leyendo' },
  { value: 'read', label: 'Leída' },
] as const;
export type ReadStatus = (typeof READ_STATUSES)[number]['value'];

export const journalInputSchema = z.object({
  name: requiredText('Nombre de la revista', 300),
  issn: optionalText(20),
  eissn: optionalText(20),
  publisher: optionalText(200),
  url: optionalText(500),
  guidelinesUrl: optionalText(500),
  indexing: z.array(z.string().max(40)).max(30).default([]),
  quartile: z.enum(QUARTILES).nullish(),
  openAccess: z.enum(['diamond', 'gold', 'hybrid', 'closed', 'unknown']).default('unknown'),
  apcCents: z.number().int().min(0).max(1e9).nullish(),
  apcCurrency: z.string().length(3).default('EUR'),
  citationStyle: optionalText(100),
  languages: optionalText(200),
  wordLimit: z.number().int().min(0).max(1_000_000).nullish(),
  notes: optionalText(20_000),
});
export const journalUpdateSchema = patchSchema(journalInputSchema);

export interface Journal {
  id: string;
  name: string;
  issn: string | null;
  eissn: string | null;
  publisher: string | null;
  url: string | null;
  guidelinesUrl: string | null;
  indexing: string[];
  quartile: (typeof QUARTILES)[number] | null;
  openAccess: OpenAccess;
  apcCents: number | null;
  apcCurrency: string;
  citationStyle: string | null;
  languages: string | null;
  wordLimit: number | null;
  notes: string | null;
  submissionCount: number;
  /** Días medios entre el envío y la primera decisión (según tus envíos). */
  avgResponseDays: number | null;
  /** Aceptaciones entre las decisiones finales (aceptado o rechazado). */
  acceptanceRate: number | null;
  createdAt: string;
  updatedAt: string;
}

const authorSchema = z.object({
  name: requiredText('Nombre', 200),
  affiliation: optionalText(300),
  email: optionalText(200),
  orcid: optionalText(40),
  isMe: z.boolean().default(false),
  corresponding: z.boolean().default(false),
});
export type PublicationAuthor = z.infer<typeof authorSchema>;

export const publicationInputSchema = z.object({
  title: requiredText('Título', 500),
  type: z.enum(['article', 'chapter', 'conference', 'review', 'book', 'other']).default('article'),
  status: z.enum(STATUS_VALUES).default('idea'),
  abstract: optionalText(20_000),
  keywords: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  language: optionalText(40),
  journalId: z.string().max(64).nullish(),
  doi: optionalText(200),
  url: optionalText(500),
  citation: optionalText(5000),
  corpusVersionId: z.string().max(64).nullish(),
  deadline: isoDateSchema.nullish(),
  wordCount: z.number().int().min(0).max(10_000_000).nullish(),
  notes: optionalText(50_000),
  authors: z.array(authorSchema).max(50).default([]),
  gameIds: z.array(z.string().max(64)).max(200).default([]),
  referenceIds: z.array(z.string().max(64)).max(5000).default([]),
});
export const publicationUpdateSchema = patchSchema(publicationInputSchema).extend({
  position: z.number().optional(),
});

export interface Publication {
  id: string;
  title: string;
  type: PublicationType;
  status: PublicationStatus;
  abstract: string | null;
  keywords: string[];
  language: string | null;
  journalId: string | null;
  journalName: string | null;
  doi: string | null;
  url: string | null;
  citation: string | null;
  corpusVersionId: string | null;
  corpusVersionName: string | null;
  deadline: string | null;
  wordCount: number | null;
  notes: string | null;
  position: number;
  authors: PublicationAuthor[];
  gameIds: string[];
  referenceIds: string[];
  submissionCount: number;
  openTaskCount: number;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const submissionInputSchema = z.object({
  publicationId: z.string().min(1),
  journalId: z.string().max(64).nullish(),
  venue: optionalText(300),
  manuscriptId: optionalText(100),
  submittedAt: isoDateSchema,
  decision: z
    .enum(['pending', 'desk_reject', 'reject', 'major', 'minor', 'accept', 'withdrawn'])
    .default('pending'),
  decisionAt: isoDateSchema.nullish(),
  /** Plazo para entregar los cambios, si se piden. */
  revisionDue: isoDateSchema.nullish(),
  notes: optionalText(20_000),
});
export const submissionUpdateSchema = patchSchema(
  submissionInputSchema.omit({ publicationId: true }),
);

export interface Submission {
  id: string;
  publicationId: string;
  journalId: string | null;
  journalName: string | null;
  venue: string | null;
  manuscriptId: string | null;
  submittedAt: string;
  decision: SubmissionDecision;
  decisionAt: string | null;
  revisionDue: string | null;
  notes: string | null;
  responseDays: number | null;
  createdAt: string;
}

export const referenceInputSchema = z.object({
  csl: z.custom<CslItem>(
    (v) =>
      typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string',
    'Datos de la referencia no válidos',
  ),
  readStatus: z.enum(['unread', 'reading', 'read']).default('unread'),
  rating: z.number().int().min(0).max(5).default(0),
  notes: optionalText(200_000),
  collectionIds: z.array(z.string().max(64)).max(100).default([]),
  gameIds: z.array(z.string().max(64)).max(100).default([]),
});
export const referenceUpdateSchema = patchSchema(referenceInputSchema);

export interface Reference {
  id: string;
  csl: CslItem;
  type: string;
  title: string;
  creators: string;
  year: number | null;
  container: string | null;
  doi: string | null;
  citationKey: string;
  readStatus: ReadStatus;
  rating: number;
  notes: string | null;
  collectionIds: string[];
  gameIds: string[];
  publicationIds: string[];
  pdfAttachmentId: string | null;
  hasFullText: boolean;
  quoteCount: number;
  apa: string;
  apaHtml: string;
  createdAt: string;
  updatedAt: string;
}

export const quoteInputSchema = z.object({
  referenceId: z.string().min(1),
  text: requiredText('Cita', 20_000),
  page: optionalText(40),
  comment: optionalText(5000),
});
export const quoteUpdateSchema = patchSchema(quoteInputSchema.omit({ referenceId: true }));

export interface ReferenceQuote {
  id: string;
  referenceId: string;
  text: string;
  page: string | null;
  comment: string | null;
  createdAt: string;
}

export const collectionInputSchema = z.object({
  name: requiredText('Nombre', 200),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#6366f1'),
});

export interface ReferenceCollection {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface ReferenceImportResult {
  created: number;
  duplicates: number;
  ids: string[];
  batchId: string | null;
}
