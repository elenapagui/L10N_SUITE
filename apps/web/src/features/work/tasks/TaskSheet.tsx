import { Pause, Play, Trash2 } from 'lucide-react';
import { describeRecurrence, PRIORITIES, type RecurrenceRule, type Task } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect } from '@/components/ui/input';
import { Separator, Spinner } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { ChecklistEditor } from '@/components/common/ChecklistEditor';
import { CommentsPanel } from '@/components/common/CommentsPanel';
import { EntitySelect } from '@/components/common/EntitySelect';
import { CommitInput, DecimalInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { useTrashWithUndo } from '@/hooks/mutations';
import {
  useApiMutation,
  useAreas,
  useGames,
  useJobs,
  useProjects,
  useStatuses,
  useTask,
  useTaskLists,
  useTasks,
  useTimer,
} from '@/hooks/work';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { TaskQuickAdd } from './TaskQuickAdd';
import { TaskRow } from './TaskRow';
import { useTimerControls } from '../time/useTimerControls';

const RECURRENCE_OPTIONS: { value: string; label: string; rule: RecurrenceRule | null }[] = [
  { value: '', label: 'No se repite', rule: null },
  { value: 'daily', label: 'Cada día', rule: { freq: 'daily', interval: 1 } },
  { value: 'weekly', label: 'Cada semana', rule: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Cada dos semanas', rule: { freq: 'weekly', interval: 2 } },
  {
    value: 'monthly',
    label: 'Cada mes (mismo día)',
    rule: { freq: 'monthly', interval: 1, monthlyMode: 'same_day' },
  },
  {
    value: 'monthly_last',
    label: 'Cada mes (último día laborable)',
    rule: { freq: 'monthly', interval: 1, monthlyMode: 'last_weekday' },
  },
  {
    value: 'quarterly',
    label: 'Cada trimestre',
    rule: { freq: 'monthly', interval: 3, monthlyMode: 'same_day' },
  },
  { value: 'yearly', label: 'Cada año', rule: { freq: 'yearly', interval: 1 } },
];

function recurrenceValue(rule: RecurrenceRule | null): string {
  if (!rule) return '';
  const match = RECURRENCE_OPTIONS.find(
    (o) =>
      o.rule &&
      o.rule.freq === rule.freq &&
      o.rule.interval === rule.interval &&
      (o.rule.monthlyMode ?? 'same_day') === (rule.monthlyMode ?? 'same_day'),
  );
  return match?.value ?? '';
}

function TaskEditor({ task, onOpenTask }: { task: Task; onOpenTask: (id: string) => void }) {
  const statuses = useStatuses();
  const areas = useAreas();
  const lists = useTaskLists();
  const projects = useProjects();
  const jobs = useJobs(task.projectId ? { projectId: task.projectId } : {});
  const games = useGames();
  const subtasks = useTasks({ parentId: task.id });
  const timer = useTimer();
  const controls = useTimerControls();
  const save = useApiMutation((patch: Record<string, unknown>) =>
    api(`/tasks/${task.id}`, { method: 'PATCH', body: patch }),
  );
  const running = timer.data?.running?.taskId === task.id;

  return (
    <div className="grid gap-5 p-5">
      <CommitInput
        value={task.title}
        onCommit={(v) => v && save.mutate({ title: v })}
        className="h-auto border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
        testId="task-title"
      />
      {task.parentTitle && (
        <button
          type="button"
          className="-mt-4 cursor-pointer text-left text-xs text-muted-foreground hover:underline"
          onClick={() => onOpenTask(task.parentId!)}
        >
          Subtarea de «{task.parentTitle}»
        </button>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Estado">
          <NativeSelect
            value={task.statusId}
            onChange={(e) => save.mutate({ statusId: e.target.value })}
            data-testid="task-status"
          >
            {(statuses.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Prioridad">
          <NativeSelect
            value={task.priority}
            onChange={(e) => save.mutate({ priority: Number(e.target.value) })}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Se repite">
          <NativeSelect
            value={recurrenceValue(task.recurrence)}
            onChange={(e) =>
              save.mutate({
                recurrence:
                  RECURRENCE_OPTIONS.find((o) => o.value === e.target.value)?.rule ?? null,
              })
            }
            title={describeRecurrence(task.recurrence)}
          >
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha límite">
          <Input
            type="date"
            value={task.dueDate ?? ''}
            onChange={(e) => save.mutate({ dueDate: e.target.value || null })}
            data-testid="task-due"
          />
        </Field>
        <Field label="Hora">
          <Input
            type="time"
            value={task.dueTime ?? ''}
            onChange={(e) => save.mutate({ dueTime: e.target.value || null })}
          />
        </Field>
        <Field label="Estimación (horas)">
          <DecimalInput
            value={task.estimateMinutes == null ? null : task.estimateMinutes / 60}
            onCommit={(v) =>
              save.mutate({ estimateMinutes: v == null ? null : Math.round(v * 60) })
            }
            maxDecimals={2}
            scale={1}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área">
          <NativeSelect
            value={task.areaId ?? ''}
            onChange={(e) => save.mutate({ areaId: e.target.value || null, listId: null })}
          >
            <option value="">Sin área</option>
            {(areas.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Lista">
          <NativeSelect
            value={task.listId ?? ''}
            onChange={(e) => save.mutate({ listId: e.target.value || null })}
          >
            <option value="">Sin lista</option>
            {(lists.data ?? [])
              .filter((l) => !task.areaId || l.areaId === task.areaId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Proyecto">
          <EntitySelect
            options={(projects.data ?? []).map((p) => ({
              value: p.id,
              label: p.name,
              hint: p.clientName,
            }))}
            value={task.projectId}
            onChange={(projectId) => save.mutate({ projectId, jobId: null })}
          />
        </Field>
        <Field label="Encargo">
          <EntitySelect
            options={(jobs.data ?? []).map((j) => ({
              value: j.id,
              label: j.title,
              hint: j.projectName,
            }))}
            value={task.jobId}
            onChange={(jobId) => save.mutate({ jobId })}
          />
        </Field>
        <Field label="Juego">
          <EntitySelect
            options={(games.data ?? []).map((g) => ({ value: g.id, label: g.title }))}
            value={task.gameId}
            onChange={(gameId) => save.mutate({ gameId })}
          />
        </Field>
        <Field label="Tiempo registrado">
          <div className="flex h-9 items-center gap-2">
            <span className="text-sm tabular-nums">{formatDuration(task.loggedSeconds)}</span>
            {running ? (
              <Button size="sm" variant="outline" onClick={() => controls.stop()}>
                <Pause /> Parar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => controls.start({ taskId: task.id }, task.title)}
              >
                <Play /> Cronometrar
              </Button>
            )}
          </div>
        </Field>
      </div>
      <TagPicker entityType="task" entityId={task.id} />
      <Field label="Descripción">
        <CommitInput
          value={task.description}
          onCommit={(v) => save.mutate({ description: v })}
          multiline
          rows={5}
          placeholder="Detalles, enlaces, contexto…"
        />
      </Field>
      <Separator />
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Checklist</h3>
        <ChecklistEditor entityType="task" entityId={task.id} />
      </div>
      {!task.parentId && (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Subtareas</h3>
          <div className="overflow-hidden rounded-lg border">
            {(subtasks.data ?? []).map((s) => (
              <TaskRow key={s.id} task={s} showContext={false} compact />
            ))}
            <TaskQuickAdd
              defaults={{
                parentId: task.id,
                projectId: task.projectId,
                jobId: task.jobId,
                areaId: task.areaId,
              }}
              placeholder="Añadir subtarea…"
            />
          </div>
        </div>
      )}
      <Separator />
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Comentarios</h3>
        <CommentsPanel entityType="task" entityId={task.id} />
      </div>
    </div>
  );
}

export function TaskSheet({
  taskId,
  onClose,
  onOpenTask,
}: {
  taskId: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const task = useTask(taskId);
  const trash = useTrashWithUndo();
  return (
    <Sheet
      open={taskId !== null}
      onOpenChange={(o) => !o && onClose()}
      title={
        task.data
          ? [task.data.projectName, task.data.jobTitle].filter(Boolean).join(' › ') || 'Tarea'
          : 'Tarea'
      }
      headerActions={
        task.data && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar tarea"
            onClick={async () => {
              await trash('task', task.data!.id, task.data!.title, [
                ['tasks'],
                ['dashboard'],
                ['calendar'],
              ]);
              onClose();
            }}
          >
            <Trash2 />
          </Button>
        )
      }
    >
      {task.isLoading ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : task.data ? (
        <TaskEditor key={task.data.id} task={task.data} onOpenTask={onOpenTask} />
      ) : (
        <p className="p-5 text-sm text-muted-foreground">La tarea no existe o se ha eliminado.</p>
      )}
    </Sheet>
  );
}
