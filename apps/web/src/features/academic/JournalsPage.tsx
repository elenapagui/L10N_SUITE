import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Newspaper, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  JOURNAL_INDEXES,
  OPEN_ACCESS,
  QUARTILES,
  formatMoney,
  fromCents,
  labelOf,
  parseDecimal,
  toCents,
  type Journal,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FieldGrid } from '../work/shared';
import { useJournals } from './hooks';

type Form = {
  name: string;
  issn: string;
  eissn: string;
  publisher: string;
  url: string;
  guidelinesUrl: string;
  indexing: string[];
  quartile: string;
  openAccess: string;
  apc: string;
  citationStyle: string;
  languages: string;
  wordLimit: string;
  notes: string;
};

function toForm(j: Journal | null): Form {
  return {
    name: j?.name ?? '',
    issn: j?.issn ?? '',
    eissn: j?.eissn ?? '',
    publisher: j?.publisher ?? '',
    url: j?.url ?? '',
    guidelinesUrl: j?.guidelinesUrl ?? '',
    indexing: j?.indexing ?? [],
    quartile: j?.quartile ?? '',
    openAccess: j?.openAccess ?? 'unknown',
    apc: j?.apcCents != null ? String(fromCents(j.apcCents)).replace('.', ',') : '',
    citationStyle: j?.citationStyle ?? '',
    languages: j?.languages ?? '',
    wordLimit: j?.wordLimit != null ? String(j.wordLimit) : '',
    notes: j?.notes ?? '',
  };
}

function JournalDialog({
  journal,
  open,
  onOpenChange,
}: {
  journal: Journal | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const trash = useTrashWithUndo();
  const [f, setF] = useState<Form>(() => toForm(journal));
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const save = async () => {
    const apc = parseDecimal(f.apc);
    const body = {
      name: f.name.trim(),
      issn: f.issn || null,
      eissn: f.eissn || null,
      publisher: f.publisher || null,
      url: f.url || null,
      guidelinesUrl: f.guidelinesUrl || null,
      indexing: f.indexing,
      quartile: f.quartile || null,
      openAccess: f.openAccess,
      apcCents: apc != null ? toCents(apc) : null,
      citationStyle: f.citationStyle || null,
      languages: f.languages || null,
      wordLimit: f.wordLimit ? Math.round(Number(f.wordLimit)) : null,
      notes: f.notes || null,
    };
    try {
      if (journal) await api(`/journals/${journal.id}`, { method: 'PATCH', body });
      else await api('/journals', { method: 'POST', body });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se ha podido guardar');
      return;
    }
    await qc.invalidateQueries({ queryKey: ['journals'] });
    await qc.invalidateQueries({ queryKey: ['publications'] });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{journal ? journal.name : 'Nueva revista'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <FieldGrid>
            <Field label="Nombre" className="sm:col-span-2">
              <Input
                autoFocus
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
                data-testid="journal-name"
              />
            </Field>
            <Field label="ISSN">
              <Input
                value={f.issn}
                onChange={(e) => set({ issn: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="e-ISSN">
              <Input
                value={f.eissn}
                onChange={(e) => set({ eissn: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="Editorial o institución">
              <Input value={f.publisher} onChange={(e) => set({ publisher: e.target.value })} />
            </Field>
            <Field label="Idiomas que acepta">
              <Input
                value={f.languages}
                onChange={(e) => set({ languages: e.target.value })}
                placeholder="Español, inglés"
              />
            </Field>
            <Field label="Web">
              <Input type="url" value={f.url} onChange={(e) => set({ url: e.target.value })} />
            </Field>
            <Field label="Normas para autores">
              <Input
                type="url"
                value={f.guidelinesUrl}
                onChange={(e) => set({ guidelinesUrl: e.target.value })}
              />
            </Field>
            <Field label="Indexación" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {JOURNAL_INDEXES.map((ix) => {
                  const on = f.indexing.includes(ix);
                  return (
                    <button
                      key={ix}
                      type="button"
                      onClick={() =>
                        set({
                          indexing: on ? f.indexing.filter((x) => x !== ix) : [...f.indexing, ix],
                        })
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-sm',
                        on
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {ix}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Cuartil">
              <NativeSelect value={f.quartile} onChange={(e) => set({ quartile: e.target.value })}>
                <option value="">—</option>
                {QUARTILES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Acceso abierto">
              <NativeSelect
                value={f.openAccess}
                onChange={(e) => set({ openAccess: e.target.value })}
              >
                {OPEN_ACCESS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="APC (€)">
              <Input
                inputMode="decimal"
                value={f.apc}
                onChange={(e) => set({ apc: e.target.value })}
              />
            </Field>
            <Field label="Límite de palabras">
              <Input
                type="number"
                min={0}
                value={f.wordLimit}
                onChange={(e) => set({ wordLimit: e.target.value })}
              />
            </Field>
            <Field label="Estilo de citas" className="sm:col-span-2">
              <Input
                value={f.citationStyle}
                onChange={(e) => set({ citationStyle: e.target.value })}
                placeholder="APA 7, Chicago autor-fecha…"
              />
            </Field>
            <Field label="Notas" className="sm:col-span-2">
              <Textarea rows={4} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </FieldGrid>
        </div>
        <DialogFooter>
          {journal && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await trash('journal', journal.id, journal.name, [['journals']]);
                onOpenChange(false);
              }}
            >
              <Trash2 /> Eliminar
            </Button>
          )}
          <Button onClick={() => void save()} disabled={!f.name.trim()} data-testid="journal-save">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JournalsPage() {
  const journals = useJournals();
  const [editing, setEditing] = useState<Journal | 'new' | null>(null);
  const columns = useMemo<ColumnDef<Journal, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Revista',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {row.original.name}
            {row.original.url && (
              <a
                href={row.original.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Abrir web"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </span>
        ),
      },
      { accessorKey: 'publisher', header: 'Editorial' },
      {
        id: 'indexing',
        header: 'Indexación',
        accessorFn: (j) => j.indexing.join(', '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.quartile && <Badge>{row.original.quartile}</Badge>}
            {row.original.indexing.map((i) => (
              <Badge key={i} variant="secondary">
                {i}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        accessorKey: 'openAccess',
        header: 'Acceso abierto',
        cell: ({ row }) => {
          const j = row.original;
          const label = labelOf(OPEN_ACCESS, j.openAccess).split(' (')[0];
          return j.apcCents ? `${label} · ${formatMoney(j.apcCents, j.apcCurrency)}` : label;
        },
      },
      { accessorKey: 'submissionCount', header: 'Envíos', meta: { align: 'right' } },
      {
        accessorKey: 'avgResponseDays',
        header: 'Respuesta media',
        cell: ({ row }) =>
          row.original.avgResponseDays != null
            ? `${Math.round(row.original.avgResponseDays)} días`
            : '—',
      },
      {
        accessorKey: 'acceptanceRate',
        header: 'Aceptación',
        cell: ({ row }) =>
          row.original.acceptanceRate != null
            ? `${Math.round(row.original.acceptanceRate * 100)} %`
            : '—',
      },
    ],
    [],
  );
  return (
    <Page wide>
      <PageHeader
        title="Revistas"
        icon={<Newspaper />}
        description="Dónde publicar: indexación, acceso abierto, normas y, a partir de tus envíos, el tiempo medio de respuesta."
        actions={
          <Button onClick={() => setEditing('new')} data-testid="new-journal">
            <Plus /> Nueva revista
          </Button>
        }
      />
      {journals.isLoading ? (
        <Spinner />
      ) : !journals.data?.length ? (
        <EmptyState
          icon={<Newspaper />}
          title="Aún no hay revistas"
          description="Añade las revistas en las que publicas o quieres publicar."
        />
      ) : (
        <DataTable data={journals.data} columns={columns} onRowClick={(j) => setEditing(j)} />
      )}
      {editing && (
        <JournalDialog
          key={editing === 'new' ? 'new' : editing.id}
          journal={editing === 'new' ? null : editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </Page>
  );
}
