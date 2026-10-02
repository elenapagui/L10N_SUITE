import { useEffect, useMemo, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ListChecks } from 'lucide-react';
import { addDaysISO, todayISO, type Task } from '@l10n/shared';
import { NativeSelect } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntitySelect } from '@/components/common/EntitySelect';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useTags } from '@/hooks/core';
import { useAreas, useProjects, useStatuses, useTaskLists, useTasks } from '@/hooks/work';
import { KanbanBoard } from './KanbanBoard';
import { TaskQuickAdd } from './TaskQuickAdd';
import { TaskRow } from './TaskRow';
import { useOpenTask } from './TaskSheetContext';

function Group({ title, tasks, tone }: { title: string; tasks: Task[]; tone?: 'danger' }) {
  if (tasks.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <h2
        className={`flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium ${tone === 'danger' ? 'text-destructive' : ''}`}
      >
        {title}
        <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
      </h2>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </section>
  );
}

export function TasksPage() {
  const search = useSearch({ strict: false }) as { tarea?: string };
  const openTask = useOpenTask();
  useEffect(() => {
    if (search.tarea) openTask(search.tarea);
  }, [search.tarea, openTask]);

  const [view, setView] = useState<'mine' | 'list' | 'board'>(() => {
    try {
      return (localStorage.getItem('l10n-tasks-view') as 'mine' | 'list' | 'board') ?? 'mine';
    } catch {
      return 'mine';
    }
  });
  const [areaId, setAreaId] = useState('');
  const [listId, setListId] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tagId, setTagId] = useState('');
  const [showDone, setShowDone] = useState(false);
  const areas = useAreas();
  const lists = useTaskLists();
  const projects = useProjects();
  const tags = useTags();
  const statuses = useStatuses();

  const query = {
    topLevel: true,
    areaId: areaId || undefined,
    listId: listId || undefined,
    projectId: projectId ?? undefined,
    tagId: tagId || undefined,
    includeDone: view === 'board' ? true : showDone,
  };
  const tasks = useTasks(query);
  const queryKey = ['tasks', query];

  const changeView = (v: string) => {
    setView(v as typeof view);
    try {
      localStorage.setItem('l10n-tasks-view', v);
    } catch {
      // Preferencia no persistente.
    }
  };

  const groups = useMemo(() => {
    const today = todayISO();
    const week = addDaysISO(today, 7);
    const all = tasks.data ?? [];
    const open = all.filter((t) => t.statusCategory !== 'done');
    return {
      overdue: open.filter((t) => t.dueDate && t.dueDate < today),
      today: open.filter((t) => t.dueDate === today),
      week: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= week),
      later: open.filter((t) => t.dueDate && t.dueDate > week),
      none: open.filter((t) => !t.dueDate),
      done: all.filter((t) => t.statusCategory === 'done'),
    };
  }, [tasks.data]);

  const quickDefaults = {
    areaId: areaId || null,
    listId: listId || null,
    projectId,
    dueDate: view === 'mine' ? todayISO() : null,
  };

  return (
    <Page wide>
      <PageHeader
        title="Tareas"
        icon={<ListChecks />}
        description="Todo lo que tienes que hacer: trabajo, investigación, administración y personal."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={changeView}>
          <TabsList>
            <TabsTrigger value="mine">Mi trabajo</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="board" data-testid="view-board">
              Tablero
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <NativeSelect
          value={areaId}
          onChange={(e) => {
            setAreaId(e.target.value);
            setListId('');
          }}
          className="w-40"
        >
          <option value="">Todas las áreas</option>
          {(areas.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)} className="w-40">
          <option value="">Todas las listas</option>
          {(lists.data ?? [])
            .filter((l) => !areaId || l.areaId === areaId)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </NativeSelect>
        <div className="w-56">
          <EntitySelect
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={projectId}
            onChange={setProjectId}
            placeholder="Todos los proyectos"
            emptyLabel="Todos los proyectos"
          />
        </div>
        <NativeSelect value={tagId} onChange={(e) => setTagId(e.target.value)} className="w-40">
          <option value="">Todas las etiquetas</option>
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        {view !== 'board' && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showDone} onCheckedChange={setShowDone} /> Mostrar hechas
          </label>
        )}
      </div>

      {view !== 'board' && (
        <div className="mb-4 overflow-hidden rounded-lg border bg-card">
          <TaskQuickAdd defaults={quickDefaults} />
        </div>
      )}

      {tasks.isLoading || !statuses.data ? (
        <Spinner />
      ) : view === 'board' ? (
        <KanbanBoard tasks={tasks.data ?? []} statuses={statuses.data} queryKey={queryKey} />
      ) : (tasks.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No hay tareas con estos filtros"
          description="Escribe arriba para crear una. Prueba con «Revisar glosario mañana !»."
        />
      ) : view === 'mine' ? (
        <div className="grid gap-4">
          <Group title="Vencidas" tasks={groups.overdue} tone="danger" />
          <Group title="Hoy" tasks={groups.today} />
          <Group title="Próximos 7 días" tasks={groups.week} />
          <Group title="Más adelante" tasks={groups.later} />
          <Group title="Sin fecha" tasks={groups.none} />
          {showDone && <Group title="Hechas" tasks={groups.done} />}
        </div>
      ) : (
        <div className="grid gap-4">
          {statuses.data
            .filter((s) => showDone || s.category !== 'done')
            .map((s) => (
              <Group
                key={s.id}
                title={s.name}
                tasks={(tasks.data ?? []).filter((t) => t.statusId === s.id)}
              />
            ))}
        </div>
      )}
    </Page>
  );
}
