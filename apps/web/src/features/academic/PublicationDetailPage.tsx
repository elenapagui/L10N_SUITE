import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FileText, GraduationCap, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PUBLICATION_STATUSES,
  PUBLICATION_TYPES,
  SUBMISSION_DECISIONS,
  apaText,
  compareApa,
  formatDateES,
  labelOf,
  todayISO,
  type Publication,
  type PublicationAuthor,
  type Reference,
  type Submission,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { EntitySelect } from '@/components/common/EntitySelect';
import { CommitInput, DateInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useGames } from '@/hooks/work';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCorpusVersions } from '../corpus/hooks';
import { TaskListView } from '../work/tasks/TaskListView';
import { BackLink, FieldGrid, Section, Stat } from '../work/shared';
import { copyRich, useJournals, usePublication, useReferences, useSubmissions } from './hooks';
import { StatusBadge } from './PublicationsPage';
import { ReferenceSheet } from './ReferenceSheet';

function useRefreshPublication(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        ['publication', id],
        ['publications'],
        ['submissions', id],
        ['references'],
        ['journals'],
        ['calendar'],
      ].map((k) => qc.invalidateQueries({ queryKey: k })),
    );
}

function AuthorsEditor({
  authors,
  onChange,
}: {
  authors: PublicationAuthor[];
  onChange: (a: PublicationAuthor[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const update = (i: number, patch: Partial<PublicationAuthor>) =>
    onChange(authors.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...authors];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="grid gap-2">
      {authors.map((a, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.2fr_1.5fr_1fr_auto]"
        >
          <CommitInput
            value={a.name}
            onCommit={(v) => v && update(i, { name: v })}
            placeholder="Nombre"
          />
          <CommitInput
            value={a.affiliation}
            onCommit={(v) => update(i, { affiliation: v })}
            placeholder="Afiliación"
          />
          <CommitInput
            value={a.orcid}
            onCommit={(v) => update(i, { orcid: v })}
            placeholder="ORCID"
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Autoría de correspondencia"
              title="Autoría de correspondencia"
              onClick={() => update(i, { corresponding: !a.corresponding })}
            >
              <Star className={cn(a.corresponding && 'fill-amber-400 text-amber-500')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Bajar"
              disabled={i === authors.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Quitar"
              onClick={() => onChange(authors.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
          {a.isMe && <span className="text-xs text-muted-foreground sm:col-span-4">Tú</span>}
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onChange([
            ...authors,
            {
              name: draft.trim(),
              affiliation: null,
              email: null,
              orcid: null,
              isMe: false,
              corresponding: false,
            },
          ]);
          setDraft('');
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Añadir coautor o coautora…"
          data-testid="author-input"
        />
        <Button type="submit" variant="outline" disabled={!draft.trim()}>
          <Plus /> Añadir
        </Button>
      </form>
    </div>
  );
}

function KeywordsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const seen = new Set(value.map((w) => w.normalize('NFC').toLocaleLowerCase('es')));
    const words: string[] = [];
    for (const raw of draft.split(/[,;]/)) {
      const w = raw.trim().normalize('NFC');
      const key = w.toLocaleLowerCase('es');
      if (w && !seen.has(key)) {
        seen.add(key);
        words.push(w);
      }
    }
    if (words.length) onChange([...value, ...words]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
      {value.map((k) => (
        <Badge key={k} variant="secondary">
          {k}
          <button
            type="button"
            aria-label={`Quitar ${k}`}
            onClick={() => onChange(value.filter((x) => x !== k))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-32 flex-1 bg-transparent text-sm outline-none"
        value={draft}
        placeholder="Escribe y pulsa Intro"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Con el IME coreano, Intro confirma la sílaba: no añade la palabra a medias.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function SubmissionDialog({
  publicationId,
  submission,
  open,
  onOpenChange,
}: {
  publicationId: string;
  submission: Submission | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const journals = useJournals();
  const refresh = useRefreshPublication(publicationId);
  const [form, setForm] = useState(() => ({
    journalId: submission?.journalId ?? null,
    venue: submission?.venue ?? '',
    manuscriptId: submission?.manuscriptId ?? '',
    submittedAt: submission?.submittedAt ?? todayISO(),
    decision: submission?.decision ?? 'pending',
    decisionAt: submission?.decisionAt ?? '',
    revisionDue: submission?.revisionDue ?? '',
    notes: submission?.notes ?? '',
  }));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    const body = {
      journalId: form.journalId,
      venue: form.venue || null,
      manuscriptId: form.manuscriptId || null,
      submittedAt: form.submittedAt,
      decision: form.decision,
      decisionAt: form.decisionAt || null,
      revisionDue: form.revisionDue || null,
      notes: form.notes || null,
    };
    if (submission) await api(`/submissions/${submission.id}`, { method: 'PATCH', body });
    else await api('/submissions', { method: 'POST', body: { ...body, publicationId } });
    await refresh();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{submission ? 'Editar envío' : 'Nuevo envío'}</DialogTitle>
        </DialogHeader>
        <FieldGrid>
          <Field label="Revista">
            <EntitySelect
              options={(journals.data ?? []).map((j) => ({ value: j.id, label: j.name }))}
              value={form.journalId}
              onChange={(journalId) => set({ journalId })}
              emptyLabel="Otra (escribir abajo)"
              testId="submission-journal"
            />
          </Field>
          <Field label="Congreso, editorial u otro destino">
            <Input
              value={form.venue}
              onChange={(e) => set({ venue: e.target.value })}
              disabled={Boolean(form.journalId)}
            />
          </Field>
          <Field label="Fecha de envío">
            <Input
              type="date"
              value={form.submittedAt}
              onChange={(e) => set({ submittedAt: e.target.value })}
            />
          </Field>
          <Field label="ID del manuscrito">
            <Input
              value={form.manuscriptId}
              onChange={(e) => set({ manuscriptId: e.target.value })}
            />
          </Field>
          <Field label="Decisión">
            <NativeSelect
              value={form.decision}
              onChange={(e) => set({ decision: e.target.value as Submission['decision'] })}
              data-testid="submission-decision"
            >
              {SUBMISSION_DECISIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fecha de la decisión" hint="Se rellena sola si la dejas vacía">
            <Input
              type="date"
              value={form.decisionAt}
              onChange={(e) => set({ decisionAt: e.target.value })}
              disabled={form.decision === 'pending'}
            />
          </Field>
          {(form.decision === 'major' || form.decision === 'minor') && (
            <Field label="Plazo para enviar los cambios">
              <Input
                type="date"
                value={form.revisionDue}
                onChange={(e) => set({ revisionDue: e.target.value })}
              />
            </Field>
          )}
          <Field
            label="Notas (informes de revisión, carta de respuesta…)"
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
        </FieldGrid>
        <p className="text-xs text-muted-foreground">
          El estado de la publicación se actualiza según la decisión del envío.
        </p>
        <DialogFooter>
          <Button
            onClick={() => void save()}
            disabled={!form.journalId && !form.venue.trim()}
            data-testid="submission-save"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionsPanel({ publicationId }: { publicationId: string }) {
  const subs = useSubmissions(publicationId);
  const confirm = useConfirm();
  const refresh = useRefreshPublication(publicationId);
  const [editing, setEditing] = useState<Submission | null | 'new'>(null);
  const [files, setFiles] = useState<string | null>(null);
  const list = subs.data ?? [];
  return (
    <div className="grid gap-3">
      <div>
        <Button size="sm" onClick={() => setEditing('new')} data-testid="new-submission">
          <Plus /> Nuevo envío
        </Button>
      </div>
      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aún no has enviado esta publicación a ninguna revista.
        </p>
      )}
      {list.map((s, i) => {
        const decision = SUBMISSION_DECISIONS.find((d) => d.value === s.decision)!;
        const tone =
          s.decision === 'accept'
            ? 'success'
            : s.decision === 'pending'
              ? 'outline'
              : s.decision === 'major' || s.decision === 'minor'
                ? 'warning'
                : 'destructive';
        return (
          <div key={s.id} className="rounded-lg border bg-card p-3" data-testid="submission-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Envío {list.length - i}</span>
              <span className="font-medium">{s.journalName ?? s.venue}</span>
              {s.manuscriptId && (
                <span className="font-mono text-xs text-muted-foreground">{s.manuscriptId}</span>
              )}
              <Badge variant={tone}>{decision.label}</Badge>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles(files === s.id ? null : s.id)}
                >
                  <FileText /> Archivos
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar envío"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: '¿Eliminar este envío?',
                        confirmLabel: 'Eliminar',
                        destructive: true,
                      }))
                    )
                      return;
                    await api(`/submissions/${s.id}`, { method: 'DELETE' });
                    await refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              <span>Enviado el {formatDateES(s.submittedAt)}</span>
              {s.decisionAt && <span>Decisión el {formatDateES(s.decisionAt)}</span>}
              {s.responseDays != null && <span>{s.responseDays} días de respuesta</span>}
              {s.revisionDue && (
                <span className={cn(s.revisionDue < todayISO() && 'text-destructive')}>
                  Cambios antes del {formatDateES(s.revisionDue)}
                </span>
              )}
            </div>
            {s.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{s.notes}</p>}
            {files === s.id && (
              <div className="mt-3 border-t pt-3">
                <AttachmentsPanel entityType="submission" entityId={s.id} />
              </div>
            )}
          </div>
        );
      })}
      {editing && (
        <SubmissionDialog
          key={editing === 'new' ? 'new' : editing.id}
          publicationId={publicationId}
          submission={editing === 'new' ? null : editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}

function AddReferencesDialog({
  publication,
  open,
  onOpenChange,
}: {
  publication: Publication;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const refs = useReferences({ q: q.trim() || undefined });
  const refresh = useRefreshPublication(publication.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const linked = new Set(publication.referenceIds);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Al cerrar se olvida la selección (no debe pasar a otra publicación).
        if (!o) setPicked(new Set());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Añadir referencias de la biblioteca</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Buscar por autoría, título, revista…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-96 overflow-y-auto rounded-md border">
          {(refs.data ?? []).map((r) => (
            <label
              key={r.id}
              className={cn(
                'flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-accent/50',
                linked.has(r.id) && 'opacity-50',
              )}
            >
              <Checkbox
                className="mt-0.5"
                disabled={linked.has(r.id)}
                checked={linked.has(r.id) || picked.has(r.id)}
                onCheckedChange={(c) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (c) n.add(r.id);
                    else n.delete(r.id);
                    return n;
                  })
                }
              />
              <span>
                <span className="font-medium">{r.creators || 'Sin autoría'}</span> (
                {r.year ?? 's. f.'}). {r.title}
              </span>
            </label>
          ))}
          {refs.data?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No hay referencias que coincidan.</p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={picked.size === 0}
            onClick={async () => {
              await api(`/publications/${publication.id}`, {
                method: 'PATCH',
                body: { referenceIds: [...publication.referenceIds, ...picked] },
              });
              await refresh();
              setPicked(new Set());
              onOpenChange(false);
            }}
          >
            Añadir {picked.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BibliographyPanel({ publication }: { publication: Publication }) {
  const refs = useReferences({ publicationId: publication.id });
  const refresh = useRefreshPublication(publication.id);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = [...(refs.data ?? [])].sort((a, b) => compareApa(a.csl, b.csl));
  const remove = async (r: Reference) => {
    await api(`/publications/${publication.id}`, {
      method: 'PATCH',
      body: { referenceIds: publication.referenceIds.filter((x) => x !== r.id) },
    });
    await refresh();
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAdding(true)} data-testid="add-bibliography">
          <Plus /> Añadir de la biblioteca
        </Button>
        {list.length > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await copyRich(
                  list.map((r) => `<p>${r.apaHtml}</p>`).join(''),
                  list.map((r) => apaText(r.csl)).join('\n'),
                );
                toast.success('Bibliografía copiada en APA 7');
              }}
            >
              <Copy /> Copiar en APA 7
            </Button>
            {(['bibtex', 'ris', 'csljson'] as const).map((f) => (
              <Button key={f} size="sm" variant="ghost" asChild>
                <a
                  href={apiUrl('/references/export', { format: f, publicationId: publication.id })}
                  download
                >
                  <Download /> {f === 'bibtex' ? 'BibTeX' : f === 'ris' ? 'RIS' : 'CSL-JSON'}
                </a>
              </Button>
            ))}
          </>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Vincula las referencias que citas para tener la bibliografía ordenada y lista para copiar.
        </p>
      ) : (
        <ol className="grid gap-2" data-testid="bibliography">
          {list.map((r) => (
            <li
              key={r.id}
              className="group flex items-start gap-2 rounded-md border bg-card px-3 py-2"
            >
              <button
                type="button"
                className="flex-1 pl-6 -indent-6 text-left text-sm"
                onClick={() => setOpen(r.id)}
              >
                <span dangerouslySetInnerHTML={{ __html: r.apaHtml }} />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100"
                aria-label="Quitar de la bibliografía"
                onClick={() => void remove(r)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <AddReferencesDialog publication={publication} open={adding} onOpenChange={setAdding} />
      {open && <ReferenceSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function PublicationDetailPage() {
  const { publicationId } = useParams({ strict: false }) as { publicationId: string };
  const navigate = useNavigate();
  const q = usePublication(publicationId);
  const journals = useJournals();
  const games = useGames();
  const versions = useCorpusVersions();
  const refresh = useRefreshPublication(publicationId);
  const trash = useTrashWithUndo();
  const qc = useQueryClient();

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado la publicación.</p>
      </Page>
    );
  const p = q.data;
  const save = async (patch: Partial<Publication>) => {
    qc.setQueryData<Publication>(['publication', p.id], (old) =>
      old ? { ...old, ...patch } : old,
    );
    try {
      await api(`/publications/${p.id}`, { method: 'PATCH', body: patch });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se ha podido guardar');
    }
    await refresh();
  };
  const status = PUBLICATION_STATUSES.find((s) => s.value === p.status)!;
  const statusIdx = PUBLICATION_STATUSES.findIndex((s) => s.value === p.status);
  const daysInStatus = Math.max(
    0,
    Math.round((Date.now() - new Date(p.statusChangedAt).getTime()) / 86_400_000),
  );

  return (
    <Page wide>
      <BackLink to="/academico/publicaciones" label="Publicaciones" />
      <PageHeader
        icon={<GraduationCap />}
        title={p.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {labelOf(PUBLICATION_TYPES, p.type)}
            {p.journalName && <span className="italic">· {p.journalName}</span>}
            <StatusBadge status={p.status} />
          </span>
        }
        actions={
          <>
            <NativeSelect
              value={p.status}
              onChange={(e) => void save({ status: e.target.value as Publication['status'] })}
              className="w-48"
              data-testid="publication-status"
            >
              {PUBLICATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar publicación"
              onClick={async () => {
                await trash('publication', p.id, p.title, [['publications']]);
                void navigate({ to: '/academico/publicaciones' });
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <TagPicker entityType="publication" entityId={p.id} />
      </div>
      <ol className="mb-5 flex flex-wrap gap-1 text-xs" aria-label="Progreso">
        {PUBLICATION_STATUSES.filter((s) => s.stage !== 'closed').map((s, i) => (
          <li
            key={s.value}
            className={cn(
              'rounded-full px-2 py-0.5',
              s.value === p.status
                ? 'bg-primary font-medium text-primary-foreground'
                : i < statusIdx && status.stage !== 'closed'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {s.label}
          </li>
        ))}
      </ol>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat
          label="En este estado"
          value={`${daysInStatus} d`}
          hint={`desde el ${formatDateES(p.statusChangedAt.slice(0, 10))}`}
        />
        <Stat
          label="Plazo"
          value={p.deadline ? formatDateES(p.deadline) : '—'}
          tone={p.deadline && p.deadline < todayISO() ? 'danger' : undefined}
        />
        <Stat label="Tareas pendientes" value={p.openTaskCount} />
        <Stat
          label="Referencias"
          value={p.referenceIds.length}
          hint={`${p.submissionCount} envíos`}
        />
      </div>
      <Tabs defaultValue="ficha">
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="envios">Envíos ({p.submissionCount})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="bibliografia" data-testid="tab-bibliography">
            Bibliografía ({p.referenceIds.length})
          </TabsTrigger>
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="ficha" className="grid gap-6 lg:grid-cols-2">
          <Section title="Datos">
            <FieldGrid>
              <Field label="Título" className="sm:col-span-2">
                <CommitInput
                  value={p.title}
                  onCommit={(v) => v && void save({ title: v })}
                  testId="publication-title-edit"
                />
              </Field>
              <Field label="Tipo">
                <NativeSelect
                  value={p.type}
                  onChange={(e) => void save({ type: e.target.value as Publication['type'] })}
                >
                  {PUBLICATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Revista">
                <EntitySelect
                  options={(journals.data ?? []).map((j) => ({ value: j.id, label: j.name }))}
                  value={p.journalId}
                  onChange={(journalId) => void save({ journalId })}
                />
              </Field>
              <Field label="Plazo">
                <DateInput
                  value={p.deadline}
                  onCommit={(v) => void save({ deadline: v })}
                  testId="publication-deadline"
                />
              </Field>
              <Field label="Idioma">
                <CommitInput
                  value={p.language}
                  onCommit={(v) => void save({ language: v })}
                  placeholder="Español"
                />
              </Field>
              <Field label="Extensión (palabras)">
                <Input
                  key={p.id}
                  type="number"
                  min={0}
                  defaultValue={p.wordCount ?? ''}
                  onBlur={(e) => {
                    const n = e.target.value ? Math.round(Number(e.target.value)) : null;
                    if (n !== p.wordCount) void save({ wordCount: n });
                  }}
                />
              </Field>
              <Field label="Versión del corpus utilizada">
                <EntitySelect
                  options={(versions.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
                  value={p.corpusVersionId}
                  onChange={(corpusVersionId) => void save({ corpusVersionId })}
                />
              </Field>
              <Field label="Palabras clave" className="sm:col-span-2">
                <KeywordsEditor
                  value={p.keywords}
                  onChange={(keywords) => void save({ keywords })}
                />
              </Field>
              <Field label="Resumen" className="sm:col-span-2">
                <CommitInput
                  value={p.abstract}
                  onCommit={(v) => void save({ abstract: v })}
                  multiline
                  rows={6}
                />
              </Field>
            </FieldGrid>
          </Section>
          <div className="grid content-start gap-6">
            <Section title="Autoría">
              <AuthorsEditor authors={p.authors} onChange={(authors) => void save({ authors })} />
            </Section>
            <Section title="Juegos estudiados">
              <div className="flex flex-wrap gap-1.5">
                {(games.data ?? []).map((g) => {
                  const on = p.gameIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        void save({
                          gameIds: on ? p.gameIds.filter((x) => x !== g.id) : [...p.gameIds, g.id],
                        })
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-sm',
                        on
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {g.title}
                    </button>
                  );
                })}
                {games.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aún no hay juegos.</p>
                )}
              </div>
            </Section>
            <Section title="Publicación">
              <FieldGrid>
                <Field label="DOI">
                  <CommitInput
                    value={p.doi}
                    onCommit={(v) => void save({ doi: v })}
                    className="font-mono text-xs"
                  />
                </Field>
                <Field label="URL">
                  <CommitInput value={p.url} onCommit={(v) => void save({ url: v })} type="url" />
                </Field>
                <Field label="Cita final" className="sm:col-span-2">
                  <CommitInput
                    value={p.citation}
                    onCommit={(v) => void save({ citation: v })}
                    multiline
                    rows={3}
                    placeholder="Como aparecerá en tu CV"
                  />
                </Field>
              </FieldGrid>
            </Section>
          </div>
        </TabsContent>
        <TabsContent value="envios">
          <SubmissionsPanel publicationId={p.id} />
        </TabsContent>
        <TabsContent value="tareas">
          <TaskListView
            query={{ relatedType: 'publication', relatedId: p.id }}
            defaults={{ relatedType: 'publication', relatedId: p.id, areaId: 'area-academic' }}
            showContext
            emptyText="Sin tareas pendientes para esta publicación."
          />
        </TabsContent>
        <TabsContent value="bibliografia">
          <BibliographyPanel publication={p} />
        </TabsContent>
        <TabsContent value="archivos">
          <p className="mb-3 text-sm text-muted-foreground">
            Borradores, versiones y material complementario. Los archivos de cada envío están en la
            pestaña «Envíos».
          </p>
          <AttachmentsPanel entityType="publication" entityId={p.id} />
        </TabsContent>
        <TabsContent value="notas">
          <CommitInput
            value={p.notes}
            onCommit={(v) => void save({ notes: v })}
            multiline
            rows={18}
            placeholder="Esquema, ideas, pendientes…"
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
