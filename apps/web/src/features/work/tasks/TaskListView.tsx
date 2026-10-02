import { useMemo, useState } from 'react';
import type { Task } from '@l10n/shared';
import { Spinner } from '@/components/ui/misc';
import { useTasks } from '@/hooks/work';
import { TaskQuickAdd } from './TaskQuickAdd';
import { TaskRow } from './TaskRow';

/** Lista de tareas filtrada (de un proyecto, encargo, juego…) con alta rápida. */
export function TaskListView({
  query,
  defaults,
  showContext = false,
  emptyText = 'No hay tareas.',
}: {
  query: Record<string, string | boolean | undefined>;
  defaults?: Record<string, string | null | undefined>;
  showContext?: boolean;
  emptyText?: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const tasks = useTasks({ topLevel: true, ...query });
  const { open, done } = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      open: all.filter((t) => t.statusCategory !== 'done'),
      done: all.filter((t) => t.statusCategory === 'done'),
    };
  }, [tasks.data]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {tasks.isLoading ? (
        <div className="p-3">
          <Spinner />
        </div>
      ) : (
        <>
          {open.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</p>
          )}
          {open.map((t: Task) => (
            <TaskRow key={t.id} task={t} showContext={showContext} />
          ))}
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((s) => !s)}
              className="w-full cursor-pointer border-t px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
            >
              {showDone ? 'Ocultar' : 'Mostrar'} {done.length}{' '}
              {done.length === 1 ? 'hecha' : 'hechas'}
            </button>
          )}
          {showDone &&
            done.map((t) => <TaskRow key={t.id} task={t} showContext={showContext} compact />)}
        </>
      )}
      {defaults && (
        <div className="border-t">
          <TaskQuickAdd defaults={defaults} />
        </div>
      )}
    </div>
  );
}
