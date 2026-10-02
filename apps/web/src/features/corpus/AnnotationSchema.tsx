import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CHOICE_COLORS, type AnnotationTag } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommitInput } from '@/components/common/inputs';
import { api } from '@/lib/api';
import { useAnnotationTags } from './hooks';

/** Editor del esquema de anotación (árbol de etiquetas). */
export function AnnotationSchema() {
  const tags = useAnnotationTags();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['corpus-tags'] });
  const call = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode =>
    (tags.data ?? [])
      .filter((t) => t.parentId === parentId)
      .map((t: AnnotationTag) => (
        <li key={t.id}>
          <div
            className="group flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-accent/40"
            style={{ paddingLeft: depth * 20 + 4 }}
          >
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="size-4 shrink-0 rounded-full border"
                  style={{ background: t.color }}
                  aria-label="Color"
                />
              </PopoverTrigger>
              <PopoverContent className="w-auto">
                <div className="flex gap-1.5">
                  {CHOICE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="size-6 rounded-full"
                      style={{ background: c }}
                      onClick={() =>
                        void call(() =>
                          api(`/corpus/tags/${t.id}`, { method: 'PATCH', body: { color: c } }),
                        )
                      }
                      aria-label={c}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <CommitInput
              value={t.name}
              onCommit={(name) =>
                name &&
                void call(() => api(`/corpus/tags/${t.id}`, { method: 'PATCH', body: { name } }))
              }
              className="h-8 max-w-sm border-transparent bg-transparent shadow-none hover:border-input focus:border-input"
            />
            <span className="text-xs text-muted-foreground">
              {t.count ? `${t.count} anotaciones` : ''}
            </span>
            <div className="ml-auto flex opacity-0 group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Añadir subetiqueta a ${t.name}`}
                title="Añadir subetiqueta"
                onClick={() =>
                  void call(() =>
                    api('/corpus/tags', {
                      method: 'POST',
                      body: { name: 'Nueva etiqueta', parentId: t.id, color: t.color },
                    }),
                  )
                }
              >
                <Plus />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Eliminar ${t.name}`}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `¿Eliminar «${t.name}»?`,
                      description:
                        'Se borran también sus subetiquetas y todas las anotaciones que las usan. No se puede deshacer.',
                      confirmLabel: 'Eliminar',
                      destructive: true,
                    })
                  ) {
                    void call(() => api(`/corpus/tags/${t.id}`, { method: 'DELETE' }));
                  }
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <ul>{renderLevel(t.id, depth + 1)}</ul>
        </li>
      ));

  if (tags.isLoading) return <Spinner />;
  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">
        Las etiquetas sirven para anotar segmentos o fragmentos (selecciona el texto en un documento
        o en el concordanciador) y para filtrar las búsquedas. Filtrar por una etiqueta incluye sus
        subetiquetas.
      </p>
      <ul className="rounded-lg border bg-card p-2">{renderLevel(null, 0)}</ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          void call(() =>
            api('/corpus/tags', { method: 'POST', body: { name: newName.trim() } }),
          ).then(() => setNewName(''));
        }}
      >
        <Input
          placeholder="Nueva categoría principal…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus /> Añadir
        </Button>
      </form>
    </div>
  );
}
