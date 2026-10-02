import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, FileUp, Quote, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  READ_STATUSES,
  REFERENCE_TYPES,
  apaInText,
  cslDate,
  cslYear,
  nameText,
  parseName,
  type CslItem,
  type Reference,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommitInput } from '@/components/common/inputs';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useGames } from '@/hooks/work';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { copyRich, useCollections, usePublications, useQuotes, useReference } from './hooks';

export function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex" aria-label={`Valoración: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          className="p-0.5 disabled:cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(n === value ? 0 : n);
          }}
          aria-label={`${n} estrellas`}
        >
          <Star
            className={cn(
              'size-3.5',
              n <= value ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </span>
  );
}

/** Formulario de los datos bibliográficos (CSL-JSON). */
export function CslForm({ value, onChange }: { value: CslItem; onChange: (v: CslItem) => void }) {
  const set = (patch: Partial<CslItem>) => onChange({ ...value, ...patch });
  const names = (list?: { family?: string; given?: string; literal?: string }[]) =>
    (list ?? []).map(nameText).join('\n');
  const parseNames = (text: string) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith('=') ? { literal: l.slice(1).trim() } : parseName(l)));
  const t = value.type;
  const hasContainer = [
    'article-journal',
    'article-magazine',
    'article-newspaper',
    'chapter',
    'paper-conference',
    'webpage',
    'post-weblog',
    'entry-dictionary',
  ].includes(t);
  const containerLabel =
    t === 'chapter' || t === 'paper-conference' || t === 'entry-dictionary'
      ? 'Libro o actas'
      : t.startsWith('article')
        ? 'Revista o periódico'
        : 'Sitio web';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo">
        <NativeSelect value={t} onChange={(e) => set({ type: e.target.value })}>
          {REFERENCE_TYPES.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Año">
        <Input
          inputMode="numeric"
          value={cslYear(value.issued) ?? ''}
          onChange={(e) => set({ issued: cslDate(Number(e.target.value) || null) })}
          placeholder="s. f."
        />
      </Field>
      <Field label="Título" className="sm:col-span-2">
        <Textarea
          rows={2}
          value={value.title ?? ''}
          onChange={(e) => set({ title: e.target.value })}
          data-testid="ref-title"
        />
      </Field>
      <Field
        label={
          t === 'software'
            ? 'Desarrolladora (una por línea)'
            : 'Autoría (una por línea: Apellidos, Nombre)'
        }
        hint="Para una institución, empieza la línea con «=»"
      >
        <Textarea
          rows={3}
          value={names(value.author)}
          onChange={(e) => set({ author: parseNames(e.target.value) })}
          data-testid="ref-authors"
        />
      </Field>
      <Field label="Edición o coordinación (una persona por línea)">
        <Textarea
          rows={3}
          value={names(value.editor)}
          onChange={(e) => set({ editor: parseNames(e.target.value) })}
        />
      </Field>
      {hasContainer && (
        <Field label={containerLabel} className="sm:col-span-2">
          <Input
            value={value['container-title'] ?? ''}
            onChange={(e) => set({ 'container-title': e.target.value })}
          />
        </Field>
      )}
      {t.startsWith('article') && (
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Volumen">
            <Input value={value.volume ?? ''} onChange={(e) => set({ volume: e.target.value })} />
          </Field>
          <Field label="Número">
            <Input value={value.issue ?? ''} onChange={(e) => set({ issue: e.target.value })} />
          </Field>
          <Field label="Páginas">
            <Input
              value={value.page ?? ''}
              onChange={(e) => set({ page: e.target.value })}
              placeholder="10-21"
            />
          </Field>
        </div>
      )}
      {(t === 'chapter' || t === 'paper-conference' || t === 'entry-dictionary') && (
        <Field label="Páginas">
          <Input value={value.page ?? ''} onChange={(e) => set({ page: e.target.value })} />
        </Field>
      )}
      {!t.startsWith('article') && (
        <>
          <Field
            label={t === 'thesis' ? 'Universidad' : t === 'software' ? 'Editora' : 'Editorial'}
          >
            <Input
              value={value.publisher ?? ''}
              onChange={(e) => set({ publisher: e.target.value })}
            />
          </Field>
          {(t === 'thesis' || t === 'software' || t === 'report' || t === 'motion_picture') && (
            <Field
              label="Descripción"
              hint={
                t === 'thesis'
                  ? 'Tesis doctoral, Trabajo de fin de máster…'
                  : t === 'software'
                    ? 'Videojuego, Aplicación…'
                    : undefined
              }
            >
              <Input value={value.genre ?? ''} onChange={(e) => set({ genre: e.target.value })} />
            </Field>
          )}
          {(t === 'book' || t === 'chapter') && (
            <Field label="N.º de edición">
              <Input
                value={value.edition ?? ''}
                onChange={(e) => set({ edition: e.target.value })}
                placeholder="2"
              />
            </Field>
          )}
        </>
      )}
      <Field label="DOI">
        <Input
          value={value.DOI ?? ''}
          onChange={(e) => set({ DOI: e.target.value })}
          placeholder="10.xxxx/…"
        />
      </Field>
      <Field label="URL">
        <Input value={value.URL ?? ''} onChange={(e) => set({ URL: e.target.value })} />
      </Field>
      <Field label="ISBN o ISSN">
        <Input
          value={value.ISBN ?? value.ISSN ?? ''}
          onChange={(e) =>
            set(
              /^\d{4}-?\d{3}[\dxX]$/.test(e.target.value.trim())
                ? { ISSN: e.target.value, ISBN: undefined }
                : { ISBN: e.target.value, ISSN: undefined },
            )
          }
        />
      </Field>
      <Field label="Idioma">
        <Input
          value={value.language ?? ''}
          onChange={(e) => set({ language: e.target.value })}
          placeholder="es, en, ko…"
        />
      </Field>
      <Field label="Palabras clave" className="sm:col-span-2">
        <Input
          value={value.keyword ?? ''}
          onChange={(e) => set({ keyword: e.target.value })}
          placeholder="localización, coreano, honoríficos"
        />
      </Field>
      <Field label="Resumen" className="sm:col-span-2">
        <Textarea
          rows={4}
          value={value.abstract ?? ''}
          onChange={(e) => set({ abstract: e.target.value })}
        />
      </Field>
    </div>
  );
}

function QuotesPanel({ reference }: { reference: Reference }) {
  const quotes = useQuotes(reference.id);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [comment, setComment] = useState('');
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['quotes', reference.id] }),
      qc.invalidateQueries({ queryKey: ['references'] }),
    ]);
  return (
    <div className="grid gap-3">
      <form
        className="grid gap-2 rounded-md border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await api('/quotes', {
            method: 'POST',
            body: { referenceId: reference.id, text, page, comment },
          });
          setText('');
          setPage('');
          setComment('');
          await refresh();
        }}
      >
        <Textarea
          rows={3}
          placeholder="Cita textual…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="quote-text"
        />
        <div className="grid grid-cols-[6rem_1fr_auto] gap-2">
          <Input placeholder="Página" value={page} onChange={(e) => setPage(e.target.value)} />
          <Input
            placeholder="Comentario (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button type="submit" disabled={!text.trim()} data-testid="quote-add">
            Añadir
          </Button>
        </div>
      </form>
      {(quotes.data ?? []).map((q) => {
        const cite = apaInText(reference.csl, q.page ?? undefined);
        return (
          <figure
            key={q.id}
            className="group rounded-md border-l-4 border-primary/50 bg-muted/30 px-3 py-2 text-sm"
          >
            <blockquote className="whitespace-pre-wrap">«{q.text}»</blockquote>
            <figcaption className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {cite}
              {q.comment && <span>· {q.comment}</span>}
              <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  title="Copiar la cita con su referencia"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(`«${q.text}» ${cite}`)
                      .then(() => toast.success('Cita copiada'))
                  }
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Borrar"
                  onClick={async () => {
                    await api(`/quotes/${q.id}`, { method: 'DELETE' });
                    await refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function PdfPanel({ reference }: { reference: Reference }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    setBusy(true);
    try {
      const r = await api<Reference & { extracted: boolean }>(`/references/${reference.id}/pdf`, {
        method: 'POST',
        body: form,
      });
      toast.success(
        r.extracted
          ? 'PDF guardado; su texto ya se puede buscar.'
          : 'PDF guardado (no se ha podido extraer su texto: puede ser una imagen escaneada).',
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['reference', reference.id] }),
        qc.invalidateQueries({ queryKey: ['references'] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido subir el PDF.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          <FileUp /> {reference.pdfAttachmentId ? 'Sustituir el PDF' : 'Adjuntar PDF'}
        </Button>
        {reference.pdfAttachmentId && (
          <>
            <Button variant="ghost" size="sm" asChild>
              <a
                href={apiUrl(`/attachments/${reference.pdfAttachmentId}/content`)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en otra ventana
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              {reference.hasFullText
                ? 'Texto indexado para la búsqueda'
                : 'Sin texto (¿PDF escaneado?)'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              onClick={async () => {
                await api(`/references/${reference.id}/pdf`, { method: 'DELETE' });
                await qc.invalidateQueries({ queryKey: ['reference', reference.id] });
                await qc.invalidateQueries({ queryKey: ['references'] });
              }}
            >
              Quitar
            </Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      {busy && <Spinner />}
      {reference.pdfAttachmentId ? (
        <iframe
          title="PDF"
          src={apiUrl(`/attachments/${reference.pdfAttachmentId}/content`)}
          className="h-[70vh] w-full rounded-md border bg-white"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Adjunta el PDF para leerlo aquí y buscar en su texto desde la biblioteca o con{' '}
          {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K.
        </p>
      )}
    </div>
  );
}

export function ReferenceSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useReference(id);
  const qc = useQueryClient();
  const collections = useCollections();
  const games = useGames();
  const publications = usePublications();
  const trash = useTrashWithUndo();
  const [draft, setDraft] = useState<CslItem | null>(null);
  const r = q.data;
  useEffect(() => setDraft(r ? r.csl : null), [r]);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/references/${id}`, { method: 'PATCH', body });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['reference', id] }),
        qc.invalidateQueries({ queryKey: ['references'] }),
        qc.invalidateQueries({ queryKey: ['reference-collections'] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  const dirty = draft && r && JSON.stringify(draft) !== JSON.stringify(r.csl);

  return (
    <Sheet
      open={id !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Referencia"
      className="max-w-3xl"
      headerActions={
        r && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar la referencia"
            onClick={async () => {
              await trash('reference', r.id, r.title || 'Sin título', [['references']]);
              onClose();
            }}
          >
            <Trash2 />
          </Button>
        )
      }
    >
      {!r ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 p-5">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p dangerouslySetInnerHTML={{ __html: r.apaHtml }} data-testid="ref-apa" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void copyRich(r.apaHtml, r.apa).then(() =>
                    toast.success('Referencia copiada (APA 7)'),
                  )
                }
              >
                <Copy /> Copiar en APA 7
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(apaInText(r.csl))
                    .then(() => toast.success('Cita copiada'))
                }
              >
                <Quote /> {apaInText(r.csl)}
              </Button>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                @{r.citationKey}
              </span>
            </div>
          </div>
          <Tabs defaultValue="ficha">
            <TabsList>
              <TabsTrigger value="ficha">Ficha</TabsTrigger>
              <TabsTrigger value="lectura">Lectura y citas</TabsTrigger>
              <TabsTrigger value="pdf">PDF</TabsTrigger>
              <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
            </TabsList>
            <TabsContent value="ficha" className="grid gap-3">
              {draft && <CslForm value={draft} onChange={setDraft} />}
              <div className="flex justify-end gap-2">
                {dirty && (
                  <Button variant="ghost" onClick={() => setDraft(r.csl)}>
                    Descartar
                  </Button>
                )}
                <Button
                  disabled={!dirty}
                  onClick={() => draft && void patch({ csl: draft })}
                  data-testid="ref-save"
                >
                  Guardar
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="lectura" className="grid gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Field label="Estado">
                  <NativeSelect
                    className="w-40"
                    value={r.readStatus}
                    onChange={(e) => void patch({ readStatus: e.target.value })}
                  >
                    {READ_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Valoración">
                  <Stars value={r.rating} onChange={(rating) => void patch({ rating })} />
                </Field>
              </div>
              <Field label="Notas de lectura">
                <CommitInput
                  value={r.notes}
                  onCommit={(notes) => void patch({ notes })}
                  multiline
                  rows={8}
                  placeholder="Ideas principales, metodología, cómo encaja en tu investigación…"
                />
              </Field>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Citas textuales</h3>
                <QuotesPanel reference={r} />
              </div>
            </TabsContent>
            <TabsContent value="pdf">
              <PdfPanel reference={r} />
            </TabsContent>
            <TabsContent value="vinculos" className="grid gap-4">
              <div className="grid gap-1.5">
                <h3 className="text-sm font-medium">Colecciones</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(collections.data ?? []).map((c) => {
                    const on = r.collectionIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs',
                          on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                        )}
                        onClick={() =>
                          void patch({
                            collectionIds: on
                              ? r.collectionIds.filter((x) => x !== c.id)
                              : [...r.collectionIds, c.id],
                          })
                        }
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {!collections.data?.length && (
                    <span className="text-xs text-muted-foreground">
                      Crea colecciones en el panel de la biblioteca.
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-1.5">
                <h3 className="text-sm font-medium">Juegos</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(games.data ?? []).map((g) => {
                    const on = r.gameIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs',
                          on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                        )}
                        onClick={() =>
                          void patch({
                            gameIds: on
                              ? r.gameIds.filter((x) => x !== g.id)
                              : [...r.gameIds, g.id],
                          })
                        }
                      >
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-1.5">
                <h3 className="text-sm font-medium">Citada en mis publicaciones</h3>
                {r.publicationIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Añádela a la bibliografía desde la ficha de una publicación.
                  </p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {r.publicationIds.map((pid) => (
                      <li key={pid}>
                        <Link
                          to="/academico/publicaciones/$publicationId"
                          params={{ publicationId: pid }}
                          className="underline"
                        >
                          {publications.data?.find((p) => p.id === pid)?.title ?? 'Publicación'}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Sheet>
  );
}
