import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Download,
  FilePlus2,
  FileUp,
  Plus,
  Search,
  Table2,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ADDRESS_FORMS,
  GRAMMATICAL_GENDERS,
  KO_SPEECH_LEVELS,
  TERM_CATEGORIES,
  TERM_STATUSES,
  labelOf,
  normalizeForSearch,
  type Character,
  type GlossaryTerm,
  type Page as PageData,
  type PageSummary,
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
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api, apiUrl } from '@/lib/api';
import { MentionedIn } from '@/features/pages/PagesPage';
import { NewTableDialog, useImportTables } from '@/features/tables/TablesPage';
import { useTables } from '@/features/tables/hooks';

const STATUS_VARIANT = {
  approved: 'success',
  proposed: 'outline',
  forbidden: 'destructive',
} as const;

const useTerms = (gameId: string) =>
  useQuery({
    queryKey: ['glossary', gameId],
    queryFn: () => api<GlossaryTerm[]>('/glossary', { query: { gameId } }),
  });
const useCharacters = (gameId: string) =>
  useQuery({
    queryKey: ['characters', gameId],
    queryFn: () => api<Character[]>('/characters', { query: { gameId } }),
  });

function TermDialog({
  term,
  open,
  onOpenChange,
}: {
  term: GlossaryTerm | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const trash = useTrashWithUndo();
  if (!term) return null;
  const save = async (body: Partial<GlossaryTerm>) => {
    try {
      await api(`/glossary/${term.id}`, { method: 'PATCH', body });
      await qc.invalidateQueries({ queryKey: ['glossary'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Término</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Coreano">
            <Input
              lang="ko"
              defaultValue={term.termKo ?? ''}
              onBlur={(e) =>
                e.target.value !== (term.termKo ?? '') && void save({ termKo: e.target.value })
              }
            />
          </Field>
          <Field label="Español">
            <Input
              defaultValue={term.termEs ?? ''}
              onBlur={(e) =>
                e.target.value !== (term.termEs ?? '') && void save({ termEs: e.target.value })
              }
            />
          </Field>
          <Field label="Inglés">
            <Input
              defaultValue={term.termEn ?? ''}
              onBlur={(e) =>
                e.target.value !== (term.termEn ?? '') && void save({ termEn: e.target.value })
              }
            />
          </Field>
          <Field label="Categoría">
            <NativeSelect
              defaultValue={term.category ?? ''}
              onChange={(e) =>
                void save({ category: (e.target.value || null) as GlossaryTerm['category'] })
              }
            >
              <option value="">—</option>
              {TERM_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Estado">
            <NativeSelect
              defaultValue={term.status}
              onChange={(e) => void save({ status: e.target.value as GlossaryTerm['status'] })}
            >
              {TERM_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fuente">
            <Input
              defaultValue={term.source ?? ''}
              placeholder="Cliente, wiki oficial…"
              onBlur={(e) =>
                e.target.value !== (term.source ?? '') && void save({ source: e.target.value })
              }
            />
          </Field>
          <Field label="Contexto" className="sm:col-span-3">
            <Textarea
              rows={3}
              defaultValue={term.context ?? ''}
              onBlur={(e) =>
                e.target.value !== (term.context ?? '') && void save({ context: e.target.value })
              }
            />
          </Field>
          <Field label="Notas" className="sm:col-span-3">
            <Textarea
              rows={2}
              defaultValue={term.notes ?? ''}
              onBlur={(e) =>
                e.target.value !== (term.notes ?? '') && void save({ notes: e.target.value })
              }
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="mr-auto text-destructive"
            onClick={async () => {
              await trash(
                'glossary_term',
                term.id,
                [term.termKo, term.termEs].filter(Boolean).join(' → '),
                [['glossary']],
              );
              onOpenChange(false);
            }}
          >
            <Trash2 /> Eliminar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Hecho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GlossaryPanel({ gameId }: { gameId: string }) {
  const terms = useTerms(gameId);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [ko, setKo] = useState('');
  const [es, setEs] = useState('');
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);
  const koRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const needle = normalizeForSearch(q);
    return (terms.data ?? []).filter(
      (t) =>
        (!status || t.status === status) &&
        (!category || t.category === category) &&
        (!needle ||
          normalizeForSearch(
            [t.termKo, t.termEs, t.termEn, t.context, t.notes].filter(Boolean).join(' '),
          ).includes(needle)),
    );
  }, [terms.data, q, status, category]);

  const add = async () => {
    if (!ko.trim() && !es.trim()) return;
    try {
      await api('/glossary', { method: 'POST', body: { gameId, termKo: ko, termEs: es } });
      setKo('');
      setEs('');
      koRef.current?.focus();
      await qc.invalidateQueries({ queryKey: ['glossary'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido añadir.');
    }
  };

  const importFile = async (file: File) => {
    const form = new FormData();
    form.append('gameId', gameId);
    form.append('file', file, file.name);
    try {
      const r = await api<{ created: number; skipped: number }>('/glossary/import', {
        method: 'POST',
        body: form,
      });
      toast.success(
        `${r.created} términos importados${r.skipped ? ` · ${r.skipped} ya existían` : ''}. Puedes deshacerlo en Ajustes → Importar.`,
      );
      await qc.invalidateQueries({ queryKey: ['glossary'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar.');
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="w-56 pl-8"
            placeholder="Buscar en el glosario…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <NativeSelect
          className="w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          {TERM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Categoría"
        >
          <option value="">Todas las categorías</option>
          {TERM_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <span className="text-sm text-muted-foreground">{list.length} términos</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp /> Importar Excel
          </Button>
          <Button variant="outline" asChild>
            <a href={apiUrl('/glossary/export', { gameId })}>
              <Download /> Exportar
            </a>
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.tsv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
      </div>
      <form
        className="grid grid-cols-[1fr_1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          ref={koRef}
          lang="ko"
          placeholder="Coreano"
          value={ko}
          onChange={(e) => setKo(e.target.value)}
          data-testid="term-ko"
        />
        <Input
          placeholder="Español"
          value={es}
          onChange={(e) => setEs(e.target.value)}
          data-testid="term-es"
        />
        <Button type="submit" disabled={!ko.trim() && !es.trim()} data-testid="term-add">
          <Plus /> Añadir
        </Button>
      </form>
      {terms.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={terms.data?.length ? 'Ningún término coincide' : 'El glosario está vacío'}
          description="Añade términos arriba o importa tu Excel (columna A en coreano y B en español, o con cabeceras como «Coreano», «Español», «Contexto»)."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table data-testid="glossary-table">
            <THead>
              <TR>
                <TH>Coreano</TH>
                <TH>Español</TH>
                <TH>Inglés</TH>
                <TH>Categoría</TH>
                <TH>Estado</TH>
                <TH>Contexto</TH>
              </TR>
            </THead>
            <TBody>
              {list.map((t) => (
                <TR key={t.id} className="cursor-pointer" onClick={() => setEditing(t)}>
                  <TD lang="ko" className="ko font-medium">
                    {t.termKo}
                  </TD>
                  <TD
                    className={
                      t.status === 'forbidden' ? 'text-destructive line-through' : undefined
                    }
                  >
                    {t.termEs}
                  </TD>
                  <TD className="text-muted-foreground">{t.termEn}</TD>
                  <TD>{t.category ? labelOf(TERM_CATEGORIES, t.category) : ''}</TD>
                  <TD>
                    <Badge variant={STATUS_VARIANT[t.status]}>
                      {labelOf(TERM_STATUSES, t.status)}
                    </Badge>
                  </TD>
                  <TD className="max-w-xs truncate text-muted-foreground">{t.context}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <TermDialog
        key={editing?.id ?? 'none'}
        term={editing ? ((terms.data ?? []).find((t) => t.id === editing.id) ?? null) : null}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

function CharacterDialog({
  gameId,
  character,
  open,
  onOpenChange,
}: {
  gameId: string;
  character: Character | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const trash = useTrashWithUndo();
  const empty = {
    nameKo: '',
    nameEs: '',
    nameEn: '',
    gender: 'unknown',
    addressForm: '',
    koSpeechLevel: '',
    speechStyle: '',
    description: '',
    notes: '',
  };
  const [d, setD] = useState<Record<string, string>>(empty);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setD(
        character
          ? Object.fromEntries(
              Object.keys(empty).map((k) => [
                k,
                String((character as unknown as Record<string, unknown>)[k] ?? ''),
              ]),
            )
          : empty,
      );
    }
  }
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = {
      ...d,
      addressForm: d.addressForm || null,
      koSpeechLevel: d.koSpeechLevel || null,
    };
    try {
      if (character) await api(`/characters/${character.id}`, { method: 'PATCH', body });
      else await api('/characters', { method: 'POST', body: { ...body, gameId } });
      await qc.invalidateQueries({ queryKey: ['characters'] });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{character ? 'Personaje' : 'Nuevo personaje'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre en coreano">
            <Input lang="ko" value={d.nameKo} onChange={(e) => set('nameKo', e.target.value)} />
          </Field>
          <Field label="Nombre en español">
            <Input
              value={d.nameEs}
              onChange={(e) => set('nameEs', e.target.value)}
              data-testid="character-name"
            />
          </Field>
          <Field label="Nombre en inglés">
            <Input value={d.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
          </Field>
          <Field label="Género gramatical" hint="Para la concordancia en español">
            <NativeSelect value={d.gender} onChange={(e) => set('gender', e.target.value)}>
              {GRAMMATICAL_GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tratamiento (ES)">
            <NativeSelect
              value={d.addressForm}
              onChange={(e) => set('addressForm', e.target.value)}
            >
              <option value="">—</option>
              {ADDRESS_FORMS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nivel de habla (KO)">
            <NativeSelect
              value={d.koSpeechLevel}
              onChange={(e) => set('koSpeechLevel', e.target.value)}
            >
              <option value="">—</option>
              {KO_SPEECH_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Forma de hablar" className="sm:col-span-3">
            <Textarea
              rows={2}
              value={d.speechStyle}
              onChange={(e) => set('speechStyle', e.target.value)}
              placeholder="Muletillas, registro, dialecto, tics verbales…"
            />
          </Field>
          <Field label="Descripción" className="sm:col-span-3">
            <Textarea
              rows={3}
              value={d.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <Field label="Notas" className="sm:col-span-3">
            <Textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          {character && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await trash('character', character.id, character.nameEs, [['characters']]);
                onOpenChange(false);
              }}
            >
              <Trash2 /> Eliminar
            </Button>
          )}
          <Button
            disabled={!d.nameEs?.trim()}
            onClick={() => void save()}
            data-testid="character-save"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CharactersPanel({ gameId }: { gameId: string }) {
  const characters = useCharacters(gameId);
  const [editing, setEditing] = useState<Character | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex">
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          data-testid="new-character"
        >
          <Plus /> Nuevo personaje
        </Button>
      </div>
      {characters.isLoading ? (
        <Spinner />
      ) : !characters.data?.length ? (
        <EmptyState
          icon={<UserRound />}
          title="Sin personajes"
          description="Registra el género gramatical, el tratamiento y la forma de hablar de cada personaje para mantener la coherencia."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {characters.data.map((c) => (
            <button
              key={c.id}
              type="button"
              className="grid gap-1 rounded-lg border bg-card p-4 text-left hover:border-primary/40"
              onClick={() => {
                setEditing(c);
                setOpen(true);
              }}
            >
              <span className="flex items-baseline gap-2">
                <span className="font-medium">{c.nameEs}</span>
                {c.nameKo && (
                  <span lang="ko" className="text-sm text-muted-foreground">
                    {c.nameKo}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">{labelOf(GRAMMATICAL_GENDERS, c.gender)}</Badge>
                {c.addressForm && (
                  <Badge variant="outline">{labelOf(ADDRESS_FORMS, c.addressForm)}</Badge>
                )}
                {c.koSpeechLevel && (
                  <Badge variant="outline">{labelOf(KO_SPEECH_LEVELS, c.koSpeechLevel)}</Badge>
                )}
              </span>
              {c.speechStyle && (
                <span className="line-clamp-2 text-sm text-muted-foreground">{c.speechStyle}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <CharacterDialog gameId={gameId} character={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Páginas (guía de estilo…) y tablas vinculadas al juego, y páginas que lo mencionan. */
export function GameKnowledgePanel({ gameId }: { gameId: string }) {
  const pages = useQuery({
    queryKey: ['pages', 'game', gameId],
    queryFn: () => api<PageSummary[]>('/pages', { query: { gameId } }),
  });
  const tables = useTables(gameId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newTable, setNewTable] = useState(false);
  const importTables = useImportTables(gameId);
  const fileRef = useRef<HTMLInputElement>(null);
  const createPage = async (template?: string) => {
    const p = await api<PageData>('/pages', { method: 'POST', body: { gameId, template } });
    await qc.invalidateQueries({ queryKey: ['pages'] });
    void navigate({ to: '/paginas/$pageId', params: { pageId: p.id } });
  };
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Páginas</h3>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void createPage('style_guide')}
              data-testid="new-style-guide"
            >
              📘 Guía de estilo
            </Button>
            <Button size="sm" variant="outline" onClick={() => void createPage()}>
              <FilePlus2 /> Página
            </Button>
          </div>
        </div>
        {!pages.data?.length ? (
          <p className="text-sm text-muted-foreground">No hay páginas vinculadas a este juego.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {pages.data.map((p) => (
              <li key={p.id}>
                <Link
                  to="/paginas/$pageId"
                  params={{ pageId: p.id }}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  {p.icon ?? '📄'} <span className="truncate">{p.title || 'Sin título'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Tablas</h3>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp /> Importar Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNewTable(true)}>
              <Table2 /> Tabla
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importTables(f);
            }}
          />
        </div>
        {!tables.data?.length ? (
          <p className="text-sm text-muted-foreground">No hay tablas vinculadas a este juego.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {tables.data.map((t) => (
              <li key={t.id}>
                <Link
                  to="/tablas/$tableId"
                  params={{ tableId: t.id }}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  {t.icon ?? '📊'} <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{t.rowCount} filas</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <NewTableDialog open={newTable} onOpenChange={setNewTable} gameId={gameId} />
      </section>
      <section className="grid gap-2">
        <h3 className="font-medium">Mencionado en</h3>
        <MentionedIn entityType="game" entityId={gameId} />
      </section>
    </div>
  );
}
