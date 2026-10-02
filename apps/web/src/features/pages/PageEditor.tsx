import '@blocknote/shadcn/style.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  type PartialBlock,
} from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { es } from '@blocknote/core/locales';
import {
  SuggestionMenuController,
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { FileText, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import {
  entityLabel,
  type Attachment,
  type Page,
  type PageSummary,
  type SearchResult,
} from '@l10n/shared';
import { api, ApiError } from '@/lib/api';
import { entityRoute } from '@/lib/entities';
import { cn } from '@/lib/utils';

/** Fichas que se pueden mencionar con «@». */
const MENTION_TYPES = [
  'page',
  'game',
  'client',
  'project',
  'job',
  'task',
  'glossary_term',
  'character',
  'custom_table',
  'publication',
  'reference',
];

function MentionChip({
  entityType,
  entityId,
  label,
}: {
  entityType: string;
  entityId: string;
  label: string;
}) {
  const navigate = useNavigate();
  return (
    <span
      role="link"
      tabIndex={-1}
      className="mx-0.5 cursor-pointer rounded bg-primary/10 px-1 py-0.5 text-[0.95em] font-medium text-primary hover:bg-primary/20"
      title={`${entityLabel(entityType)}: ${label}`}
      onClick={(e) => {
        e.preventDefault();
        const r = entityRoute(entityType, entityId);
        void navigate({ to: r.to as never, search: r.search as never });
      }}
    >
      @{label}
    </span>
  );
}

const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      entityType: { default: '' },
      entityId: { default: '' },
      label: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => <MentionChip {...inlineContent.props} />,
    toExternalHTML: ({ inlineContent }) => <span>@{inlineContent.props.label}</span>,
  },
);

const TONES = {
  info: { emoji: '💡', className: 'bg-sky-50 dark:bg-sky-950/40' },
  warning: { emoji: '⚠️', className: 'bg-amber-50 dark:bg-amber-950/40' },
  danger: { emoji: '⛔', className: 'bg-red-50 dark:bg-red-950/40' },
  success: { emoji: '✅', className: 'bg-emerald-50 dark:bg-emerald-950/40' },
} as const;
type Tone = keyof typeof TONES;
const TONE_ORDER: Tone[] = ['info', 'warning', 'danger', 'success'];

/** Bloque «Aviso» (callout): recuadro destacado con icono; pulsa el icono para cambiar el tipo. */
const Callout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: { tone: { default: 'info' as Tone, values: TONE_ORDER } },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => {
      const tone = (block.props.tone as Tone) in TONES ? (block.props.tone as Tone) : 'info';
      return (
        <div className={cn('flex w-full gap-2 rounded-md px-3 py-2', TONES[tone].className)}>
          <button
            type="button"
            contentEditable={false}
            className="select-none"
            title="Cambiar el tipo de aviso"
            onClick={() =>
              editor.updateBlock(block, {
                props: { tone: TONE_ORDER[(TONE_ORDER.indexOf(tone) + 1) % TONE_ORDER.length] },
              })
            }
          >
            {TONES[tone].emoji}
          </button>
          <div ref={contentRef} className="min-w-0 flex-1" />
        </div>
      );
    },
    toExternalHTML: ({ block, contentRef }) => (
      <blockquote>
        {TONES[(block.props.tone as Tone) ?? 'info']?.emoji} <span ref={contentRef} />
      </blockquote>
    ),
  },
);

export const pageSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: Callout() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
});
export type PageEditorInstance = typeof pageSchema.BlockNoteEditor;

function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export type SaveState = 'saved' | 'saving' | 'pending' | 'error' | 'conflict';

export interface PageEditorHandle {
  editor: PageEditorInstance;
  /** Guarda ya lo pendiente. */
  flush: () => Promise<void>;
}

const SAVE_DELAY = 800;

export const PageEditor = forwardRef<
  PageEditorHandle,
  { page: Page; onStateChange?: (s: SaveState) => void; editable?: boolean }
>(function PageEditor({ page, onStateChange, editable = true }, ref) {
  const qc = useQueryClient();
  const dark = useIsDark();
  const versionRef = useRef(page.version);
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const stateRef = useRef<SaveState>('saved');
  const setState = useCallback(
    (s: SaveState) => {
      stateRef.current = s;
      onStateChange?.(s);
    },
    [onStateChange],
  );

  const initial =
    page.contentFormat === 'blocks' && Array.isArray(page.content) && page.content.length > 0
      ? (page.content as PartialBlock<
          typeof pageSchema.blockSchema,
          typeof pageSchema.inlineContentSchema,
          typeof pageSchema.styleSchema
        >[])
      : undefined;

  const editor = useCreateBlockNote(
    {
      schema: pageSchema,
      dictionary: {
        ...es,
        placeholders: {
          ...es.placeholders,
          emptyDocument: 'Escribe, pulsa «/» para insertar bloques o «@» para mencionar…',
        },
      },
      initialContent: initial,
      uploadFile: async (file: File) => {
        const form = new FormData();
        form.append('file', file, file.name);
        const [saved] = await api<Attachment[]>('/attachments', {
          method: 'POST',
          body: form,
          query: { entityType: 'page', entityId: page.id },
        });
        void qc.invalidateQueries({ queryKey: ['attachments'] });
        return `./api/attachments/${saved!.id}/content`;
      },
    },
    [page.id],
  );

  const save = useCallback(async () => {
    if (saving.current) await saving.current;
    if (!dirty.current || stateRef.current === 'conflict') return;
    dirty.current = false;
    setState('saving');
    const run = (async () => {
      try {
        const res = await api<Page>(`/pages/${page.id}`, {
          method: 'PATCH',
          body: {
            content: editor.document,
            contentFormat: 'blocks',
            baseVersion: versionRef.current,
          },
        });
        versionRef.current = res.version;
        setState(dirty.current ? 'pending' : 'saved');
        void qc.invalidateQueries({ queryKey: ['pages'] });
        void qc.invalidateQueries({ queryKey: ['backlinks'] });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setState('conflict');
          toast.error(error.message, { duration: 10_000 });
        } else {
          dirty.current = true;
          setState('error');
          toast.error(
            error instanceof Error ? error.message : 'No se ha podido guardar la página.',
          );
        }
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [editor, page.id, qc, setState]);

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    await save();
  }, [save]);

  useImperativeHandle(ref, () => ({ editor, flush }), [editor, flush]);

  // Las páginas importadas o de plantilla llegan en Markdown: se convierten a bloques una vez.
  useEffect(() => {
    if (page.contentFormat !== 'markdown') return;
    const md = typeof page.content === 'string' ? page.content : '';
    const blocks = md.trim() ? editor.tryParseMarkdownToBlocks(md) : [];
    editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: 'paragraph' }]);
    dirty.current = true;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Guarda lo pendiente al salir de la página o cerrar la ventana.
  useEffect(() => {
    const onUnload = () => {
      if (dirty.current) void flush();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (dirty.current) void flush();
    };
  }, [flush]);

  const onChange = () => {
    if (!editable) return;
    dirty.current = true;
    if (stateRef.current !== 'conflict') setState('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void save();
    }, SAVE_DELAY);
  };

  const getMentionItems = async (query: string): Promise<DefaultReactSuggestionItem[]> => {
    const insert = (entityType: string, entityId: string, label: string) =>
      editor.insertInlineContent([
        { type: 'mention', props: { entityType, entityId, label } },
        ' ',
      ]);
    let results: SearchResult[];
    if (query.trim()) {
      results = await api<SearchResult[]>('/search', {
        query: { q: query, limit: 12, types: MENTION_TYPES.join(',') },
      });
    } else {
      const recent = (qc.getQueryData<PageSummary[]>(['pages']) ?? [])
        .filter((p) => p.lastOpenedAt && p.id !== page.id)
        .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
        .slice(0, 8);
      results = recent.map((p) => ({
        entityType: 'page',
        entityId: p.id,
        title: p.title || 'Sin título',
        subtitle: 'Abierta hace poco',
      }));
    }
    const items: DefaultReactSuggestionItem[] = results
      .filter((r) => !(r.entityType === 'page' && r.entityId === page.id))
      .map((r) => ({
        title: r.title,
        subtext: [entityLabel(r.entityType), r.subtitle].filter(Boolean).join(' · '),
        onItemClick: () => insert(r.entityType, r.entityId, r.title),
      }));
    if (query.trim()) {
      items.push({
        title: `Nueva subpágina «${query.trim()}»`,
        subtext: 'Crea la página dentro de esta y la menciona',
        icon: <FileText className="size-4" />,
        onItemClick: () => {
          void api<Page>('/pages', {
            method: 'POST',
            body: { title: query.trim(), parentId: page.id },
          }).then((p) => {
            insert('page', p.id, p.title);
            void qc.invalidateQueries({ queryKey: ['pages'] });
          });
        },
      });
    }
    return items;
  };

  const getSlashItems = async (query: string) => {
    const defaults = getDefaultReactSlashMenuItems(editor);
    const quoteTitle = es.slash_menu.quote.title;
    const quoteGroup = defaults.find((i) => i.title === quoteTitle)?.group;
    const callout: DefaultReactSuggestionItem = {
      title: 'Aviso',
      subtext: 'Recuadro destacado con icono',
      aliases: ['callout', 'aviso', 'nota', 'info', 'importante'],
      group: quoteGroup,
      icon: <Lightbulb className="size-[18px]" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' });
      },
    };
    const i = defaults.findIndex((x) => x.title === quoteTitle);
    const all = [...defaults.slice(0, i + 1), callout, ...defaults.slice(i + 1)];
    return filterSuggestionItems(all, query);
  };

  return (
    <div className="page-editor -mx-[54px]" data-testid="page-editor">
      <BlockNoteView
        editor={editor}
        theme={dark ? 'dark' : 'light'}
        editable={editable}
        slashMenu={false}
        onChange={onChange}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
        <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
      </BlockNoteView>
    </div>
  );
});
