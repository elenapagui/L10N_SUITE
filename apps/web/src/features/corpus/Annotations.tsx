import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Highlighter, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnotationTag, SegmentAnnotation } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAnnotationTags } from './hooks';

export interface AnnotationTarget {
  segmentId: number;
  lang?: string;
  start?: number;
  end?: number;
  quote?: string;
}

function TagPickerTree({
  tags,
  value,
  onChange,
}: {
  tags: AnnotationTag[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const render = (parentId: string | null, depth: number): React.ReactNode =>
    tags
      .filter((t) => t.parentId === parentId)
      .map((t) => (
        <div key={t.id}>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent',
              value === t.id && 'bg-primary/10 font-medium text-primary',
            )}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => onChange(t.id)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
            {t.name}
          </button>
          {render(t.id, depth + 1)}
        </div>
      ));
  return <div className="max-h-72 overflow-y-auto rounded-md border p-1">{render(null, 0)}</div>;
}

/** Diálogo para anotar un segmento entero o un fragmento. */
export function AnnotationDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: AnnotationTarget | null;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const tags = useAnnotationTags();
  const qc = useQueryClient();
  const [tagId, setTagId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const save = async () => {
    if (!target || !tagId) return;
    try {
      await api('/corpus/annotations', {
        method: 'POST',
        body: {
          segmentId: target.segmentId,
          tagId,
          lang: target.lang ?? null,
          start: target.start ?? null,
          end: target.end ?? null,
          comment,
        },
      });
      await Promise.all(
        ['corpus-segments', 'corpus-tags', 'corpus-stats', 'concordance'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
      setComment('');
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido anotar.');
    }
  };
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anotar {target?.quote ? 'fragmento' : 'segmento'}</DialogTitle>
        </DialogHeader>
        {target?.quote && (
          <blockquote
            lang={target.lang}
            className="rounded-md border-l-4 border-primary bg-muted/40 px-3 py-2 text-sm"
          >
            {target.quote}
          </blockquote>
        )}
        <TagPickerTree tags={tags.data ?? []} value={tagId} onChange={setTagId} />
        <Textarea
          rows={2}
          placeholder="Comentario (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-testid="annotation-comment"
        />
        <DialogFooter>
          <Button disabled={!tagId} onClick={() => void save()} data-testid="annotation-save">
            Anotar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Calcula el desplazamiento de un punto de la selección dentro del texto de `root`. */
function offsetIn(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Chip de una anotación con su comentario y la opción de borrarla. */
export function AnnotationChip({ a }: { a: SegmentAnnotation }) {
  const qc = useQueryClient();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] hover:bg-accent"
          style={{ borderColor: `${a.tagColor}88` }}
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: a.tagColor }} />
          <span className="truncate">{a.tagName}</span>
          {a.quote && <span className="truncate text-muted-foreground">«{a.quote}»</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="size-2.5 rounded-full" style={{ background: a.tagColor }} />{' '}
            {a.tagName}
          </div>
          {a.quote && (
            <blockquote lang={a.lang ?? undefined} className="border-l-2 pl-2">
              {a.quote}
            </blockquote>
          )}
          {a.comment ? (
            <p className="text-muted-foreground">{a.comment}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Sin comentario.</p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start text-destructive"
            onClick={async () => {
              await api(`/corpus/annotations/${a.id}`, { method: 'DELETE' });
              await Promise.all(
                ['corpus-segments', 'corpus-tags', 'concordance'].map((k) =>
                  qc.invalidateQueries({ queryKey: [k] }),
                ),
              );
            }}
          >
            <Trash2 /> Quitar la anotación
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Texto de un segmento con sus fragmentos anotados resaltados. Al seleccionar un trozo aparece
 * el botón «Anotar».
 */
export function AnnotatableText({
  text,
  lang,
  segmentId,
  annotations,
  onAnnotate,
}: {
  text: string;
  lang: string;
  segmentId: number;
  annotations: SegmentAnnotation[];
  onAnnotate: (t: AnnotationTarget) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!sel) return;
    const close = (e: Event) => {
      if (!button.current?.contains(e.target as Node)) setSel(null);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [sel]);
  const spans = useMemo(
    () =>
      annotations
        .filter((a) => a.lang === lang && a.start != null && a.end != null)
        .sort((a, b) => a.start! - b.start!),
    [annotations, lang],
  );

  const parts = useMemo(() => {
    const out: { text: string; ann?: SegmentAnnotation }[] = [];
    let pos = 0;
    for (const a of spans) {
      if (a.start! < pos || a.end! > text.length) continue; // solapadas: se muestra la primera
      if (a.start! > pos) out.push({ text: text.slice(pos, a.start!) });
      out.push({ text: text.slice(a.start!, a.end!), ann: a });
      pos = a.end!;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }, [spans, text]);

  const onMouseUp = () => {
    const s = window.getSelection();
    const root = ref.current;
    if (
      !s ||
      s.isCollapsed ||
      !root ||
      !root.contains(s.anchorNode) ||
      !root.contains(s.focusNode)
    ) {
      setSel(null);
      return;
    }
    const r = s.getRangeAt(0);
    const a = offsetIn(root, r.startContainer, r.startOffset);
    const b = offsetIn(root, r.endContainer, r.endOffset);
    if (b <= a) return;
    const rect = r.getBoundingClientRect();
    setSel({ start: a, end: b, x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <>
      <span
        ref={ref}
        lang={lang}
        className="whitespace-pre-wrap break-words"
        onMouseUp={onMouseUp}
        data-testid={`seg-text-${lang}`}
      >
        {parts.map((p, i) =>
          p.ann ? (
            <mark
              key={i}
              className="rounded-sm bg-transparent px-0 text-inherit"
              style={{
                boxShadow: `inset 0 -0.45em 0 ${p.ann.tagColor}40`,
                textDecoration: `underline ${p.ann.tagColor}`,
                textUnderlineOffset: 3,
              }}
              title={`${p.ann.tagName}${p.ann.comment ? ` — ${p.ann.comment}` : ''}`}
            >
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </span>
      {sel && (
        <button
          ref={button}
          type="button"
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg"
          style={{ left: sel.x, top: sel.y - 6 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onAnnotate({
              segmentId,
              lang,
              start: sel.start,
              end: sel.end,
              quote: text.slice(sel.start, sel.end),
            });
            setSel(null);
            window.getSelection()?.removeAllRanges();
          }}
          data-testid="annotate-selection"
        >
          <Highlighter className="size-3.5" /> Anotar
        </button>
      )}
    </>
  );
}
