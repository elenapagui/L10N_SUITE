import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, GitBranch } from 'lucide-react';
import type { Task, TaskStatus } from '@l10n/shared';
import { DueLabel, PriorityFlag } from '@/components/common/badges';
import { TagList } from '@/components/common/TagPicker';
import { useApiMutation } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOpenTask } from './TaskSheetContext';

function Card({ task, dragging }: { task: Task; dragging?: boolean }) {
  const done = task.statusCategory === 'done';
  return (
    <div
      className={cn(
        'grid gap-2 rounded-md border bg-card p-3 text-sm shadow-xs',
        dragging && 'rotate-1 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <div className={cn('font-medium leading-snug', done && 'text-muted-foreground line-through')}>
        {task.title}
      </div>
      {(task.projectName || task.jobTitle) && (
        <div className="truncate text-xs text-muted-foreground">
          {[task.projectName, task.jobTitle].filter(Boolean).join(' › ')}
        </div>
      )}
      <TagList tags={task.tags} />
      <div className="flex items-center gap-3">
        <DueLabel date={task.dueDate} time={task.dueTime} done={done} />
        <span className="ml-auto flex items-center gap-2">
          {task.subtaskCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" /> {task.subtaskDoneCount}/{task.subtaskCount}
            </span>
          )}
          {task.checklistCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckSquare className="size-3.5" /> {task.checklistDoneCount}/{task.checklistCount}
            </span>
          )}
          <PriorityFlag priority={task.priority} />
        </span>
      </div>
    </div>
  );
}

function SortableCard({ task }: { task: Task }) {
  const openTask = useOpenTask();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { statusId: task.statusId },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => openTask(task.id)}
      className="cursor-grab active:cursor-grabbing"
      data-testid="kanban-card"
    >
      <Card task={task} />
    </div>
  );
}

function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${status.id}`,
    data: { statusId: status.id },
  });
  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40"
      data-testid={`kanban-column-${status.name}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        {status.name}
        <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn('grid min-h-24 flex-1 content-start gap-2 p-2', isOver && 'bg-accent/40')}
        >
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

/** Tablero por estados. Arrastrar una tarjeta cambia su estado y su orden. */
export function KanbanBoard({
  tasks,
  statuses,
  queryKey,
}: {
  tasks: Task[];
  statuses: TaskStatus[];
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byStatus = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const s of statuses) map.set(s.id, []);
    for (const t of [...tasks].sort((a, b) => a.sortOrder - b.sortOrder))
      map.get(t.statusId)?.push(t);
    return map;
  }, [tasks, statuses]);

  const move = useApiMutation((v: { id: string; statusId: string; sortOrder: number }) =>
    api(`/tasks/${v.id}`, {
      method: 'PATCH',
      body: { statusId: v.statusId, sortOrder: v.sortOrder },
    }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const overData = over.data.current as { statusId?: string } | undefined;
    const statusId = overData?.statusId ?? task.statusId;
    const column = (byStatus.get(statusId) ?? []).filter((t) => t.id !== task.id);
    let index = column.findIndex((t) => t.id === over.id);
    if (index === -1) index = column.length;
    const before = column[index - 1]?.sortOrder;
    const after = column[index]?.sortOrder;
    const sortOrder =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : task.sortOrder;
    if (statusId === task.statusId && sortOrder === task.sortOrder) return;
    // Cambio inmediato en pantalla; si falla, se recargan los datos.
    qc.setQueryData<Task[]>(queryKey, (old) =>
      old?.map((t) =>
        t.id === task.id
          ? {
              ...t,
              statusId,
              sortOrder,
              statusCategory: statuses.find((s) => s.id === statusId)?.category ?? t.statusCategory,
            }
          : t,
      ),
    );
    move.mutate({ id: task.id, statusId, sortOrder });
  };

  const active = tasks.find((t) => t.id === activeId);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {statuses.map((s) => (
          <Column key={s.id} status={s} tasks={byStatus.get(s.id) ?? []} />
        ))}
      </div>
      <DragOverlay>{active ? <Card task={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
