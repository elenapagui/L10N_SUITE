import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Timer, Trash2 } from 'lucide-react';
import { addDaysISO, formatDateES, toISODate, todayISO, type TimeEntry } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { EntitySelect } from '@/components/common/EntitySelect';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useApiMutation, useJobs, useProjects, useTimeEntries } from '@/hooks/work';
import { api } from '@/lib/api';
import { formatDuration, formatHours } from '@/lib/format';
import { Section, Stat } from '../shared';

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function localDate(iso: string): string {
  return toISODate(new Date(iso));
}

function entryLabel(e: TimeEntry): string {
  return e.taskTitle ?? e.jobTitle ?? e.projectName ?? 'Sin asignar';
}

type Draft = {
  id?: string;
  date: string;
  start: string;
  end: string;
  projectId: string | null;
  jobId: string | null;
  note: string;
  billable: boolean;
};

function EntryDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(draft);
  const projects = useProjects();
  const jobs = useJobs(d?.projectId ? { projectId: d.projectId } : {});
  const trash = useTrashWithUndo();
  const save = useApiMutation(
    () => {
      const body = {
        startedAt: new Date(`${d!.date}T${d!.start}:00`).toISOString(),
        endedAt: new Date(`${d!.date}T${d!.end}:00`).toISOString(),
        projectId: d!.projectId,
        jobId: d!.jobId,
        note: d!.note,
        billable: d!.billable,
      };
      return d!.id
        ? api(`/time-entries/${d!.id}`, { method: 'PATCH', body })
        : api('/time-entries', { method: 'POST', body });
    },
    { onSuccess: onClose },
  );
  if (!d) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.id ? 'Registro de tiempo' : 'Añadir tiempo'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Día">
              <Input
                type="date"
                value={d.date}
                onChange={(e) => setD({ ...d, date: e.target.value })}
              />
            </Field>
            <Field label="Desde">
              <Input
                type="time"
                value={d.start}
                onChange={(e) => setD({ ...d, start: e.target.value })}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="time"
                value={d.end}
                onChange={(e) => setD({ ...d, end: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Proyecto">
            <EntitySelect
              options={(projects.data ?? []).map((p) => ({
                value: p.id,
                label: p.name,
                hint: p.clientName,
              }))}
              value={d.projectId}
              onChange={(projectId) => setD({ ...d, projectId, jobId: null })}
            />
          </Field>
          <Field label="Encargo">
            <EntitySelect
              options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))}
              value={d.jobId}
              onChange={(jobId) => setD({ ...d, jobId })}
            />
          </Field>
          <Field label="Nota">
            <Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={d.billable} onCheckedChange={(billable) => setD({ ...d, billable })} />{' '}
            Facturable
          </label>
        </div>
        <DialogFooter>
          {d.id && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await trash('time_entry', d.id!, `Tiempo del ${formatDateES(d.date)}`, [['time']]);
                onClose();
              }}
            >
              <Trash2 /> Eliminar
            </Button>
          )}
          <Button
            disabled={!d.date || !d.start || !d.end || d.end <= d.start || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(e: TimeEntry): Draft {
  const end = e.endedAt ?? new Date().toISOString();
  const pad = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return {
    id: e.id,
    date: localDate(e.startedAt),
    start: pad(e.startedAt),
    end: pad(end),
    projectId: e.projectId,
    jobId: e.jobId,
    note: e.note ?? '',
    billable: e.billable,
  };
}

function EntryRow({ e, onEdit }: { e: TimeEntry; onEdit: (e: TimeEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(e)}
      className="flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40"
    >
      <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
        {timeOf(e.startedAt)} – {e.endedAt ? timeOf(e.endedAt) : 'en marcha'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{entryLabel(e)}</span>
        {(e.note || e.projectName) && (
          <span className="block truncate text-xs text-muted-foreground">
            {[e.taskTitle || e.jobTitle ? e.projectName : null, e.note].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
      {!e.billable && <span className="text-xs text-muted-foreground">No facturable</span>}
      <span className="w-20 shrink-0 text-right tabular-nums">
        {formatDuration(e.durationSeconds)}
      </span>
    </button>
  );
}

/** Lista simple de registros (para la ficha de proyecto, encargo…). */
export function TimeEntriesList({ query }: { query: Record<string, string> }) {
  const entries = useTimeEntries(query);
  const [editing, setEditing] = useState<Draft | null>(null);
  const total = (entries.data ?? []).reduce((s, e) => s + e.durationSeconds, 0);
  if (entries.isLoading) return <Spinner />;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Total: {formatDuration(total)}</p>
      <div className="overflow-hidden rounded-lg border bg-card">
        {(entries.data ?? []).length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Sin tiempo registrado.</p>
        )}
        {(entries.data ?? []).map((e) => (
          <EntryRow key={e.id} e={e} onEdit={(x) => setEditing(toDraft(x))} />
        ))}
      </div>
      {editing && <EntryDialog draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TimePage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const weekEnd = addDaysISO(weekStart, 7);
  const entries = useTimeEntries({
    from: new Date(`${weekStart}T00:00:00`).toISOString(),
    to: new Date(`${weekEnd}T00:00:00`).toISOString(),
  });
  const [editing, setEditing] = useState<Draft | null>(null);

  const { days, total, billable, byProject } = useMemo(() => {
    const list = entries.data ?? [];
    const days = new Map<string, TimeEntry[]>();
    for (let i = 0; i < 7; i++) days.set(addDaysISO(weekStart, i), []);
    const byProject = new Map<string, number>();
    for (const e of list) {
      days.get(localDate(e.startedAt))?.push(e);
      const key = e.projectName ?? 'Sin proyecto';
      byProject.set(key, (byProject.get(key) ?? 0) + e.durationSeconds);
    }
    return {
      days,
      total: list.reduce((s, e) => s + e.durationSeconds, 0),
      billable: list.filter((e) => e.billable).reduce((s, e) => s + e.durationSeconds, 0),
      byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [entries.data, weekStart]);

  const weekLabel = `${formatDateES(weekStart)} – ${formatDateES(addDaysISO(weekStart, 6))}`;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');

  return (
    <Page wide>
      <PageHeader
        title="Tiempo"
        icon={<Timer />}
        description="Lo que dedicas a cada encargo y proyecto. Usa el cronómetro de la barra superior o añade el tiempo a mano."
        actions={
          <Button
            onClick={() =>
              setEditing({
                date: todayISO(),
                start: `${String(Math.max(0, now.getHours() - 1)).padStart(2, '0')}:00`,
                end: `${hh}:00`,
                projectId: null,
                jobId: null,
                note: '',
                billable: true,
              })
            }
          >
            <Plus /> Añadir tiempo
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
        >
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={() => setWeekStart(mondayOf(todayISO()))}>
          Esta semana
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana siguiente"
          onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
        >
          <ChevronRight />
        </Button>
        <span className="ml-2 text-sm font-medium">{weekLabel}</span>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total de la semana" value={formatHours(total)} />
        <Stat label="Facturable" value={formatHours(billable)} />
        <Stat label="Media por día laborable" value={formatHours(total / 5)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-4">
          {[...days.entries()].map(([day, list]) => {
            const dayTotal = list.reduce((s, e) => s + e.durationSeconds, 0);
            const label = new Intl.DateTimeFormat('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date(`${day}T12:00:00`));
            return (
              <section key={day} className="overflow-hidden rounded-lg border bg-card">
                <h2 className="flex items-center border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {formatDuration(dayTotal)}
                  </span>
                </h2>
                {list.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">—</p>
                ) : (
                  list.map((e) => (
                    <EntryRow key={e.id} e={e} onEdit={(x) => setEditing(toDraft(x))} />
                  ))
                )}
              </section>
            );
          })}
        </div>
        <Section title="Por proyecto">
          {byProject.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tiempo esta semana.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {byProject.map(([name, secs]) => (
                <li key={name} className="grid gap-1">
                  <div className="flex">
                    <span className="truncate">{name}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {formatHours(secs)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(secs / Math.max(total, 1)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      {editing && <EntryDialog draft={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}
