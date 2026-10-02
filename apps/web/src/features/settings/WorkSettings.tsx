import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { TASK_STATUS_CATEGORIES, type Template, type TemplateTask } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { DecimalInput } from '@/components/common/inputs';
import { useAreas, useRates, useStatuses, useTaskLists, useTemplates } from '@/hooks/work';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { RatesTable } from '@/features/work/RatesTable';

function useRefresh() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function StatusesEditor() {
  const statuses = useStatuses();
  const refresh = useRefresh();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('doing');
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh('task-statuses', 'tasks', 'task');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="grid gap-2">
      {(statuses.data ?? []).map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <input
            type="color"
            value={s.color}
            onChange={(e) =>
              void run(() =>
                api(`/task-statuses/${s.id}`, { method: 'PATCH', body: { color: e.target.value } }),
              )
            }
            className="h-8 w-10 cursor-pointer rounded border bg-transparent"
            aria-label="Color"
          />
          <Input
            defaultValue={s.name}
            className="h-8 max-w-xs"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.name)
                void run(() =>
                  api(`/task-statuses/${s.id}`, { method: 'PATCH', body: { name: v } }),
                );
            }}
          />
          <NativeSelect
            value={s.category}
            onChange={(e) =>
              void run(() =>
                api(`/task-statuses/${s.id}`, {
                  method: 'PATCH',
                  body: { category: e.target.value },
                }),
              )
            }
            className="h-8 w-36"
          >
            {TASK_STATUS_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar estado"
            onClick={async () => {
              const target =
                statuses.data?.find((x) => x.id !== s.id && x.category === s.category) ??
                statuses.data?.find((x) => x.id !== s.id);
              if (!target) return;
              if (
                await confirm({
                  title: `¿Eliminar el estado «${s.name}»?`,
                  description: `Sus tareas pasarán a «${target.name}».`,
                  confirmLabel: 'Eliminar',
                  destructive: true,
                })
              ) {
                void run(() =>
                  api(`/task-statuses/${s.id}`, { method: 'DELETE', query: { moveTo: target.id } }),
                );
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            void run(() =>
              api('/task-statuses', { method: 'POST', body: { name, category, color: '#64748b' } }),
            ).then(() => setName(''));
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuevo estado (p. ej. «Esperando al cliente»)"
          className="h-8 max-w-xs"
        />
        <NativeSelect
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-8 w-36"
        >
          {TASK_STATUS_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>
          <Plus /> Añadir
        </Button>
      </form>
    </div>
  );
}

function AreasEditor() {
  const areas = useAreas();
  const lists = useTaskLists();
  const refresh = useRefresh();
  const trash = useTrashWithUndo();
  const [listName, setListName] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh('areas', 'task-lists', 'tasks');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="grid gap-4">
      {(areas.data ?? []).map((a) => (
        <div key={a.id} className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={a.color}
              onChange={(e) =>
                void run(() =>
                  api(`/areas/${a.id}`, { method: 'PATCH', body: { color: e.target.value } }),
                )
              }
              className="h-8 w-10 cursor-pointer rounded border bg-transparent"
              aria-label="Color"
            />
            <Input
              defaultValue={a.name}
              className="h-8 max-w-xs font-medium"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== a.name)
                  void run(() => api(`/areas/${a.id}`, { method: 'PATCH', body: { name: v } }));
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-12">
            {(lists.data ?? [])
              .filter((l) => l.areaId === a.id)
              .map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                >
                  {l.name}
                  <button
                    type="button"
                    aria-label={`Eliminar la lista ${l.name}`}
                    className="cursor-pointer opacity-60 hover:opacity-100"
                    onClick={() => void trash('task_list', l.id, l.name, [['task-lists']])}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const name = listName[a.id]?.trim();
                if (name)
                  void run(() =>
                    api('/task-lists', { method: 'POST', body: { areaId: a.id, name } }),
                  ).then(() => setListName((s) => ({ ...s, [a.id]: '' })));
              }}
            >
              <Input
                value={listName[a.id] ?? ''}
                onChange={(e) => setListName((s) => ({ ...s, [a.id]: e.target.value }))}
                placeholder="Nueva lista"
                className="h-7 w-36 text-xs"
              />
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({ template }: { template: Template }) {
  const refresh = useRefresh();
  const trash = useTrashWithUndo();
  const [tasks, setTasks] = useState<TemplateTask[]>(template.tasks);
  const [dirty, setDirty] = useState(false);
  const update = (i: number, patch: Partial<TemplateTask>) => {
    setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
    setDirty(true);
  };
  const save = async () => {
    try {
      await api(`/templates/${template.id}`, {
        method: 'PATCH',
        body: { tasks: tasks.filter((t) => t.title.trim()) },
      });
      await refresh('templates');
      setDirty(false);
      toast.success('Plantilla guardada');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={template.name}
          className="h-8 max-w-sm font-medium"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.name)
              void api(`/templates/${template.id}`, { method: 'PATCH', body: { name: v } }).then(
                () => refresh('templates'),
              );
          }}
        />
        <span className="text-xs text-muted-foreground">
          {template.kind === 'job'
            ? 'Encargo · días respecto a la entrega'
            : 'Proyecto · días respecto al inicio'}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label="Eliminar plantilla"
          onClick={() => void trash('template', template.id, template.name, [['templates']])}
        >
          <Trash2 />
        </Button>
      </div>
      {tasks.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
          <Input
            value={t.title}
            onChange={(e) => update(i, { title: e.target.value })}
            className="h-8"
          />
          <DecimalInput
            value={t.offsetDays}
            onCommit={(v) => update(i, { offsetDays: v })}
            maxDecimals={0}
            suffix="días"
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Quitar tarea"
            onClick={() => {
              setTasks((ts) => ts.filter((_, j) => j !== i));
              setDirty(true);
            }}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setTasks((ts) => [...ts, { title: '', offsetDays: 0, priority: 3, checklist: [] }]);
            setDirty(true);
          }}
        >
          <Plus /> Tarea
        </Button>
        {dirty && (
          <Button size="sm" onClick={() => void save()}>
            Guardar cambios
          </Button>
        )}
      </div>
    </div>
  );
}

function TemplatesEditor() {
  const templates = useTemplates();
  const refresh = useRefresh();
  return (
    <div className="grid gap-3">
      {(templates.data ?? []).map((t) => (
        <TemplateEditor key={`${t.id}-${t.updatedAt}`} template={t} />
      ))}
      <div className="flex gap-2">
        {(['job', 'project'] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="outline"
            onClick={() =>
              void api('/templates', {
                method: 'POST',
                body: {
                  name:
                    kind === 'job' ? 'Nueva plantilla de encargo' : 'Nueva plantilla de proyecto',
                  kind,
                  tasks: [],
                },
              }).then(() => refresh('templates'))
            }
          >
            <Plus /> Plantilla de {kind === 'job' ? 'encargo' : 'proyecto'}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function WorkSettings() {
  const rates = useRates('general');
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Tarifas generales</CardTitle>
          <CardDescription>
            Se aplican cuando un cliente no tiene una tarifa propia para ese servicio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RatesTable rates={rates.data ?? []} clientId={null} currency="EUR" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Estados de las tareas</CardTitle>
          <CardDescription>
            Columnas del tablero. Cada estado es «pendiente», «en curso» o «hecha».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusesEditor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Áreas y listas</CardTitle>
          <CardDescription>
            Para organizar las tareas que no dependen de un proyecto (como los espacios y listas de
            ClickUp).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AreasEditor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Plantillas de tareas</CardTitle>
          <CardDescription>
            Tareas que se crean solas al crear un proyecto o un encargo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplatesEditor />
        </CardContent>
      </Card>
    </div>
  );
}
