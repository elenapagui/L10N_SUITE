import { Flag } from 'lucide-react';
import {
  BILLING_STATUSES,
  JOB_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  QUERY_STATUSES,
  labelOf,
  type BillingStatus,
  type JobStatus,
  type ProjectStatus,
  type QueryStatus,
} from '@l10n/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { DUE_TONE_CLASS, dueTone, relativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type Variant = BadgeProps['variant'];

const JOB_VARIANT: Record<JobStatus, Variant> = {
  received: 'secondary',
  in_progress: 'default',
  delivered: 'success',
  client_review: 'warning',
  closed: 'outline',
  cancelled: 'destructive',
};

const BILLING_VARIANT: Record<BillingStatus, Variant> = {
  not_billable: 'outline',
  pending: 'warning',
  invoiced: 'default',
  paid: 'success',
};

const PROJECT_VARIANT: Record<ProjectStatus, Variant> = {
  prospect: 'outline',
  active: 'success',
  paused: 'warning',
  completed: 'default',
  archived: 'secondary',
};

const QUERY_VARIANT: Record<QueryStatus, Variant> = {
  draft: 'secondary',
  sent: 'default',
  answered: 'success',
  closed: 'outline',
};

export const JobStatusBadge = ({ status }: { status: JobStatus }) => (
  <Badge variant={JOB_VARIANT[status]}>{labelOf(JOB_STATUSES, status)}</Badge>
);
export const BillingBadge = ({ status }: { status: BillingStatus }) => (
  <Badge variant={BILLING_VARIANT[status]}>{labelOf(BILLING_STATUSES, status)}</Badge>
);
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
  <Badge variant={PROJECT_VARIANT[status]}>{labelOf(PROJECT_STATUSES, status)}</Badge>
);
export const QueryStatusBadge = ({ status }: { status: QueryStatus }) => (
  <Badge variant={QUERY_VARIANT[status]}>{labelOf(QUERY_STATUSES, status)}</Badge>
);

const PRIORITY_COLOR: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-muted-foreground/40',
  4: 'text-sky-500',
};

export function PriorityFlag({ priority, showLabel }: { priority: number; showLabel?: boolean }) {
  if (priority === 3 && !showLabel) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs', PRIORITY_COLOR[priority])}
      title={`Prioridad: ${labelOf(PRIORITIES, String(priority))}`}
    >
      <Flag className="size-3.5" fill={priority <= 2 ? 'currentColor' : 'none'} />
      {showLabel && labelOf(PRIORITIES, String(priority))}
    </span>
  );
}

export function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function DueLabel({
  date,
  time,
  done,
  className,
}: {
  date: string | null;
  time?: string | null;
  done?: boolean;
  className?: string;
}) {
  if (!date) return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  return (
    <span
      className={cn('whitespace-nowrap text-xs', DUE_TONE_CLASS[dueTone(date, done)], className)}
    >
      {relativeDate(date)}
      {time ? ` · ${time}` : ''}
    </span>
  );
}
