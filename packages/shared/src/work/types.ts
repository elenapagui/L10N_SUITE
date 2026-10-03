import type { Tag } from '../schemas/core';
import type { CatBand, CatGrid } from './cat';
import type { RecurrenceRule } from './recurrence';
import type {
  BillingStatus,
  BusinessModel,
  ClientKind,
  ContentType,
  GameStatus,
  JobStatus,
  ProjectStatus,
  QueryStatus,
  Service,
  TaskStatusCategory,
  Unit,
} from './enums';

interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface Client extends Timestamps {
  id: string;
  name: string;
  kind: ClientKind;
  legalName: string | null;
  taxId: string | null;
  country: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  paymentTermsDays: number | null;
  vatPct: number | null;
  irpfPct: number | null;
  platform: string | null;
  ndaSignedAt: string | null;
  catGrid: CatGrid | null;
  rating: number | null;
  active: boolean;
  notes: string | null;
  // Resumen calculado
  projectCount: number;
  openJobCount: number;
  pendingBillingCents: number;
  lastJobAt: string | null;
}

export interface Contact extends Timestamps {
  id: string;
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface Rate extends Timestamps {
  id: string;
  clientId: string | null;
  clientName: string | null;
  service: Service;
  sourceLang: string | null;
  targetLang: string | null;
  unit: Unit;
  rateMicros: number;
  currency: string;
  minimumCents: number | null;
  notes: string | null;
}

export interface Game extends Timestamps {
  id: string;
  title: string;
  originalTitle: string | null;
  titleEs: string | null;
  titleEn: string | null;
  developer: string | null;
  publisher: string | null;
  releaseYear: number | null;
  genres: string[];
  platforms: string[];
  businessModel: BusinessModel | null;
  pegi: string | null;
  status: GameStatus;
  website: string | null;
  notes: string | null;
  projectCount: number;
  jobCount: number;
}

export interface Project extends Timestamps {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  gameId: string | null;
  gameTitle: string | null;
  contactId: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  status: ProjectStatus;
  catTool: string | null;
  startDate: string | null;
  endDate: string | null;
  localFolder: string | null;
  color: string | null;
  notes: string | null;
  jobCount: number;
  openJobCount: number;
  openTaskCount: number;
  totalCents: number;
  nextDueDate: string | null;
}

export interface Job extends Timestamps {
  id: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  gameId: string | null;
  gameTitle: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  title: string;
  poNumber: string | null;
  service: Service;
  contentType: ContentType | null;
  status: JobStatus;
  receivedAt: string | null;
  dueDate: string | null;
  dueTime: string | null;
  deliveredAt: string | null;
  unit: Unit;
  volume: number | null;
  catAnalysis: CatBand[] | null;
  weightedVolume: number | null;
  rateMicros: number | null;
  currency: string;
  amountCents: number | null;
  amountManual: boolean;
  billingStatus: BillingStatus;
  invoiceId: string | null;
  notes: string | null;
  loggedSeconds: number;
  openTaskCount: number;
}

export interface TaskStatus {
  id: string;
  name: string;
  color: string;
  category: TaskStatusCategory;
  sortOrder: number;
}

export interface Area {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface TaskList {
  id: string;
  areaId: string;
  name: string;
  color: string | null;
  sortOrder: number;
}

export interface Task extends Timestamps {
  id: string;
  title: string;
  description: string | null;
  statusId: string;
  statusName: string;
  statusColor: string;
  statusCategory: TaskStatusCategory;
  priority: number;
  areaId: string | null;
  areaName: string | null;
  areaColor: string | null;
  listId: string | null;
  listName: string | null;
  projectId: string | null;
  projectName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  gameId: string | null;
  gameTitle: string | null;
  parentId: string | null;
  parentTitle: string | null;
  relatedType: string | null;
  relatedId: string | null;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  estimateMinutes: number | null;
  recurrence: RecurrenceRule | null;
  completedAt: string | null;
  sortOrder: number;
  subtaskCount: number;
  subtaskDoneCount: number;
  checklistCount: number;
  checklistDoneCount: number;
  loggedSeconds: number;
  tags: Tag[];
}

export interface ChecklistItem {
  id: string;
  entityType: string;
  entityId: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

export interface Comment extends Timestamps {
  id: string;
  entityType: string;
  entityId: string;
  body: string;
}

export interface TimeEntry extends Timestamps {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  jobId: string | null;
  jobTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  note: string | null;
  billable: boolean;
}

export interface ClientQuery extends Timestamps {
  id: string;
  projectId: string;
  projectName: string;
  jobId: string | null;
  jobTitle: string | null;
  stringId: string | null;
  sourceText: string | null;
  context: string | null;
  question: string;
  answer: string | null;
  status: QueryStatus;
  askedAt: string | null;
  answeredAt: string | null;
}

export interface TemplateTask {
  title: string;
  offsetDays: number | null;
  priority: number;
  checklist: string[];
}

export interface Template extends Timestamps {
  id: string;
  name: string;
  kind: 'project' | 'job';
  tasks: TemplateTask[];
}

export interface CalendarEvent {
  id: string;
  kind: 'task' | 'job' | 'publication' | 'submission' | 'invoice';
  title: string;
  date: string;
  time: string | null;
  color: string;
  done: boolean;
  entityId: string;
  subtitle: string | null;
}

export interface Dashboard {
  today: string;
  tasksToday: Task[];
  tasksOverdue: Task[];
  upcomingJobs: Job[];
  overdueJobs: Job[];
  activeJobCount: number;
  secondsThisWeek: number;
  secondsToday: number;
  deliveredThisMonthCents: number;
  pendingBillingCents: number;
  /** Facturas emitidas pendientes de cobro (en la moneda principal). */
  pendingCollectionCents: number;
  overdueInvoiceCount: number;
  baseCurrency: string;
}

export interface Reminder {
  key: string;
  title: string;
  body: string;
  route: string;
}

/** Revisión semanal: lo hecho en una semana (lunes a domingo) y lo que viene en la siguiente. */
export interface WeeklyReview {
  /** Lunes de la semana revisada. */
  weekStart: string;
  weekEnd: string;
  nextStart: string;
  nextEnd: string;
  baseCurrency: string;
  done: {
    delivered: {
      count: number;
      /** Importe en la moneda principal (base). */
      cents: number;
      units: { unit: string; volume: number }[];
      jobs: { id: string; title: string; clientName: string | null; deliveredAt: string }[];
    };
    invoiced: { count: number; cents: number };
    collected: { count: number; cents: number };
    hours: { total: number; byArea: { name: string; color: string; hours: number }[] };
    tasksCompleted: { count: number; titles: string[] };
    academic: { summary: string; createdAt: string; entityType: string; entityId: string }[];
    referencesRead: number;
    referencesAdded: number;
    corpus: { documents: number; segments: number };
  };
  next: {
    deliveries: {
      id: string;
      title: string;
      clientName: string | null;
      dueDate: string;
      dueTime: string | null;
    }[];
    tasks: { id: string; title: string; dueDate: string }[];
    deadlines: { kind: string; id: string; title: string; date: string }[];
    collections: { cents: number; count: number };
    overdueCollectionsCents: number;
    overdueTasks: number;
  };
}
