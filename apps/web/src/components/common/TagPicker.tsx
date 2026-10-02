import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Check, Plus, Tag as TagIcon } from 'lucide-react';
import type { Tag } from '@l10n/shared';
import { ColorChip } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { queryKeys, useTags } from '@/hooks/core';
import { api } from '@/lib/api';
import { TAG_COLORS } from '@/features/settings/TagsManager';

export function TagList({ tags, className }: { tags: Tag[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={className ?? 'inline-flex flex-wrap gap-1'}>
      {tags.map((t) => (
        <ColorChip key={t.id} color={t.color}>
          {t.name}
        </ColorChip>
      ))}
    </span>
  );
}

/** Etiquetas de una ficha, con un selector para añadir, quitar o crear etiquetas. */
export function TagPicker({
  entityType,
  entityId,
  onChange,
}: {
  entityType: string;
  entityId: string;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const all = useTags();
  const [query, setQuery] = useState('');
  const current = useQuery({
    queryKey: queryKeys.taggings(entityType, entityId),
    queryFn: () => api<Tag[]>('/taggings', { query: { entityType, entityId } }),
  });
  const ids = new Set((current.data ?? []).map((t) => t.id));

  const save = useMutation({
    mutationFn: (tagIds: string[]) =>
      api<Tag[]>('/taggings', { method: 'PUT', body: { entityType, entityId, tagIds } }),
    onSuccess: (tags) => {
      qc.setQueryData(queryKeys.taggings(entityType, entityId), tags);
      void qc.invalidateQueries({ queryKey: queryKeys.tags });
      onChange?.();
    },
  });

  const toggle = (id: string) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate([...next]);
  };

  const create = async (name: string) => {
    const color = TAG_COLORS[(all.data?.length ?? 0) % TAG_COLORS.length]!;
    const tag = await api<Tag>('/tags', { method: 'POST', body: { name, color } });
    await qc.invalidateQueries({ queryKey: queryKeys.tags });
    save.mutate([...ids, tag.id]);
    setQuery('');
  };

  const filtered = (all.data ?? []).filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {(current.data ?? []).map((t) => (
        <ColorChip key={t.id} color={t.color} onRemove={() => toggle(t.id)}>
          {t.name}
        </ColorChip>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <TagIcon className="size-3" /> Etiquetas
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0">
          <Command shouldFilter={false}>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar o crear…"
              className="h-9 w-full border-b bg-transparent px-3 text-sm outline-none"
            />
            <Command.List className="max-h-60 overflow-y-auto p-1">
              {filtered.map((t) => (
                <Command.Item
                  key={t.id}
                  value={t.id}
                  onSelect={() => toggle(t.id)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-accent"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {ids.has(t.id) && <Check className="size-4" />}
                </Command.Item>
              ))}
              {query.trim() &&
                !filtered.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()) && (
                  <Command.Item
                    value="__crear__"
                    onSelect={() => void create(query.trim())}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-primary aria-selected:bg-accent"
                  >
                    <Plus className="size-4" /> Crear «{query.trim()}»
                  </Command.Item>
                )}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
