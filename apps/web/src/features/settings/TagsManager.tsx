import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tag } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { ColorChip } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui/misc';
import { queryKeys, useTags } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';

export const TAG_COLORS = [
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

export function TagsManager() {
  const tags = useTags();
  const qc = useQueryClient();
  const trash = useTrashWithUndo();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[6]!);

  const create = useMutation({
    mutationFn: () => api<Tag>('/tags', { method: 'POST', body: { name, color } }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; color?: string }) =>
      api<Tag>(`/tags/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.tags }),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva etiqueta (p. ej. «Urgente», «Gacha», «NDA estricto»)"
          className="max-w-sm"
          maxLength={60}
          data-testid="tag-name"
        />
        <div className="flex gap-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className="size-6 cursor-pointer rounded-full border-2"
              style={{
                backgroundColor: c,
                borderColor: c === color ? 'var(--foreground)' : 'transparent',
              }}
            />
          ))}
        </div>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <Plus />
          Añadir
        </Button>
      </form>
      {tags.isLoading ? (
        <Spinner />
      ) : (tags.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<TagIcon />}
          title="Aún no hay etiquetas"
          description="Las etiquetas sirven para clasificar cualquier ficha: proyectos, tareas, juegos, referencias…"
        />
      ) : (
        <div className="divide-y rounded-md border">
          {tags.data?.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 px-3 py-2" data-testid="tag-row">
              <ColorChip color={tag.color}>{tag.name}</ColorChip>
              <Input
                defaultValue={tag.name}
                className="h-8 max-w-xs"
                aria-label="Nombre de la etiqueta"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== tag.name) update.mutate({ id: tag.id, name: value });
                }}
              />
              <input
                type="color"
                value={tag.color}
                aria-label="Color"
                className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                onChange={(e) => update.mutate({ id: tag.id, color: e.target.value })}
              />
              <span className="ml-auto text-xs text-muted-foreground">
                {tag.usageCount ?? 0} {tag.usageCount === 1 ? 'uso' : 'usos'}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Eliminar etiqueta"
                onClick={() => void trash('tag', tag.id, tag.name, [[...queryKeys.tags]])}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
