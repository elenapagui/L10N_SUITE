import { CheckSquare, GitBranch, Repeat } from 'lucide-react';
import type { Task } from '@l10n/shared';
import { Checkbox } from '@/components/ui/misc';
import { DueLabel, PriorityFlag } from '@/components/common/badges';
import { TagList } from '@/components/common/TagPicker';
import { useApiMutation, useStatuses } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOpenTask } from './TaskSheetContext';

export function useToggleTask() {
  const statuses = useStatuses();
  return useApiMutation((task: Task) => {
    const done = task.statusCategory === 'done';
    const target = statuses.data?.find((s) => s.category === (done ? 'todo' : 'done'));
    return api(`/tasks/${task.id}`, { method: 'PATCH', body: { statusId: target?.id } });
  });
}

export function TaskRow({
  task,
  showContext = true,
  compact = false,
}: {
  task: Task;
  showContext?: boolean;
  compact?: boolean;
}) {
  const openTask = useOpenTask();
  const toggle = useToggleTask();
  const done = task.statusCategory === 'done';
  const context =
    [task.projectName, task.jobTitle].filter(Boolean).join(' › ') || task.listName || task.areaName;
  return (
    <div
      className={cn(
        'group flex items-center gap-3 border-b px-3 last:border-0 hover:bg-muted/40',
        compact ? 'py-1.5' : 'py-2',
      )}
      data-testid="task-row"
    >
      <Checkbox
        checked={done}
        onCheckedChange={() => toggle.mutate(task)}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className="rounded-full"
      />
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <div
          className={cn(
            'flex items-center gap-2 text-sm',
            done && 'text-muted-foreground line-through',
          )}
        >
          <span className="truncate">{task.title}</span>
          {task.recurrence && (
            <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Se repite" />
          )}
        </div>
        {showContext && context && !compact && (
          <div className="truncate text-xs text-muted-foreground">{context}</div>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-3">
        <TagList tags={task.tags} className="hidden gap-1 md:inline-flex" />
        {task.subtaskCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title="Subtareas"
          >
            <GitBranch className="size-3.5" />
            {task.subtaskDoneCount}/{task.subtaskCount}
          </span>
        )}
        {task.checklistCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title="Checklist"
          >
            <CheckSquare className="size-3.5" />
            {task.checklistDoneCount}/{task.checklistCount}
          </span>
        )}
        <PriorityFlag priority={task.priority} />
        {!task.statusCategory.startsWith('todo') && !done && (
          <span className="hidden items-center gap-1 text-xs sm:inline-flex">
            <span className="size-2 rounded-full" style={{ backgroundColor: task.statusColor }} />
            {task.statusName}
          </span>
        )}
        <DueLabel date={task.dueDate} time={task.dueTime} done={done} className="w-20 text-right" />
      </div>
    </div>
  );
}
