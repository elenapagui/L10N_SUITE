import { useMemo, useState } from 'react';
import { Download, MessageCircleQuestion, Plus, Search, Trash2 } from 'lucide-react';
import { QUERY_STATUSES, formatDateES, type ClientQuery } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EntitySelect } from '@/components/common/EntitySelect';
import { QueryStatusBadge } from '@/components/common/badges';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useApiMutation, useJobs, useProjects, useQueries } from '@/hooks/work';
import { api, apiUrl } from '@/lib/api';

type Draft = Partial<ClientQuery> & { projectId?: string };

function QueryDialog({ initial, onClose }: { initial: Draft | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial ?? {});
  const projects = useProjects();
  const jobs = useJobs(draft.projectId ? { projectId: draft.projectId } : {});
  const trash = useTrashWithUndo();
  const set = (k: keyof ClientQuery) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = useApiMutation(
    () => {
      const body = {
        projectId: draft.projectId,
        jobId: draft.jobId ?? null,
        stringId: draft.stringId ?? null,
        sourceText: draft.sourceText ?? null,
        context: draft.context ?? null,
        question: draft.question,
        answer: draft.answer ?? null,
        status: draft.status ?? 'draft',
      };
      return draft.id
        ? api(`/client-queries/${draft.id}`, { method: 'PATCH', body })
        : api('/client-queries', { method: 'POST', body });
    },
    { onSuccess: onClose },
  );
  return (
    <Dialog open={initial !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? 'Consulta' : 'Nueva consulta'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proyecto">
              <EntitySelect
                options={(projects.data ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.clientName,
                }))}
                value={draft.projectId ?? null}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, projectId: v ?? undefined, jobId: null }))
                }
                allowEmpty={false}
              />
            </Field>
            <Field label="Encargo">
              <EntitySelect
                options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title }))}
                value={draft.jobId ?? null}
                onChange={(v) => setDraft((d) => ({ ...d, jobId: v }))}
              />
            </Field>
            <Field label="ID de cadena">
              <Input
                value={draft.stringId ?? ''}
                onChange={set('stringId')}
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Estado">
              <NativeSelect value={draft.status ?? 'draft'} onChange={set('status')}>
                {QUERY_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Texto origen">
            <Textarea
              value={draft.sourceText ?? ''}
              onChange={set('sourceText')}
              rows={2}
              lang="ko"
            />
          </Field>
          <Field label="Contexto">
            <Textarea value={draft.context ?? ''} onChange={set('context')} rows={2} />
          </Field>
          <Field label="Pregunta">
            <Textarea
              value={draft.question ?? ''}
              onChange={set('question')}
              rows={3}
              data-testid="query-question"
            />
          </Field>
          <Field label="Respuesta del cliente">
            <Textarea value={draft.answer ?? ''} onChange={set('answer')} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          {draft.id && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await trash('client_query', draft.id!, (draft.question ?? '').slice(0, 40), [
                  ['queries'],
                ]);
                onClose();
              }}
            >
              <Trash2 /> Eliminar
            </Button>
          )}
          <Button
            disabled={!draft.question?.trim() || !draft.projectId || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewQueryButton({ projectId, jobId }: { projectId?: string; jobId?: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDraft({ projectId, jobId: jobId ?? null, status: 'draft' })}
      >
        <Plus /> Consulta
      </Button>
      {draft && <QueryDialog initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

export function QueriesTable({
  query,
  compact = false,
  filter = '',
}: {
  query: Record<string, string | undefined>;
  compact?: boolean;
  filter?: string;
}) {
  const queries = useQueries(query);
  const [editing, setEditing] = useState<Draft | null>(null);
  const columns = useMemo<ColumnDef<ClientQuery, unknown>[]>(
    () => [
      {
        accessorKey: 'question',
        header: 'Pregunta',
        cell: ({ row }) => (
          <div className="max-w-xl">
            <div className="line-clamp-2">{row.original.question}</div>
            {row.original.answer && (
              <div className="mt-0.5 line-clamp-1 text-xs text-success">
                ↳ {row.original.answer}
              </div>
            )}
          </div>
        ),
      },
      ...(compact
        ? []
        : ([
            {
              accessorKey: 'stringId',
              header: 'Cadena',
              cell: ({ row }) => (
                <span className="font-mono text-xs">{row.original.stringId ?? '—'}</span>
              ),
            },
            { accessorKey: 'projectName', header: 'Proyecto' },
          ] as ColumnDef<ClientQuery, unknown>[])),
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <QueryStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'createdAt',
        header: 'Fecha',
        cell: ({ row }) => formatDateES(row.original.askedAt ?? row.original.createdAt),
      },
    ],
    [compact],
  );
  return (
    <>
      <DataTable
        data={queries.data ?? []}
        columns={columns}
        filter={filter}
        onRowClick={(q) => setEditing(q)}
        empty="Sin consultas."
      />
      {editing && <QueryDialog initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function QueriesPage() {
  const [status, setStatus] = useState('open');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const projects = useProjects();
  const query = {
    status: status === 'open' ? 'draft,sent' : status === 'all' ? undefined : status,
    projectId: projectId ?? undefined,
  };
  return (
    <Page wide>
      <PageHeader
        title="Consultas al cliente"
        icon={<MessageCircleQuestion />}
        description="Dudas de terminología y contexto enviadas a los clientes, con sus respuestas. Se pueden buscar en todos los proyectos."
        actions={
          <>
            <Button variant="outline" asChild>
              <a
                href={apiUrl('/client-queries/export', {
                  projectId: projectId ?? undefined,
                  status: query.status,
                })}
              >
                <Download /> Exportar a Excel
              </a>
            </Button>
            <NewQueryButton projectId={projectId ?? undefined} />
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="open">Pendientes</TabsTrigger>
            <TabsTrigger value="answered">Respondidas</TabsTrigger>
            <TabsTrigger value="closed">Cerradas</TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="w-64">
          <EntitySelect
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={projectId}
            onChange={setProjectId}
            placeholder="Todos los proyectos"
            emptyLabel="Todos los proyectos"
          />
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar…"
            className="pl-8"
          />
        </div>
      </div>
      <QueriesTable query={query} filter={filter} />
    </Page>
  );
}
