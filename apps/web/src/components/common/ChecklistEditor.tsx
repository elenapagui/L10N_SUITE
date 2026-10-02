import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { useApiMutation, useChecklist } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ChecklistEditor({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const list = useChecklist(entityType, entityId);
  const [text, setText] = useState('');
  const key = ['checklist', entityType, entityId];

  const add = useApiMutation(
    (value: string) =>
      api('/checklist', { method: 'POST', body: { entityType, entityId, text: value } }),
    { onSuccess: () => setText(''), extraKeys: [key] },
  );
  const update = useApiMutation(
    (v: { id: string; done?: boolean; text?: string }) =>
      api(`/checklist/${v.id}`, { method: 'PATCH', body: { done: v.done, text: v.text } }),
    { extraKeys: [key] },
  );
  const remove = useApiMutation((id: string) => api(`/checklist/${id}`, { method: 'DELETE' }), {
    extraKeys: [key],
  });

  const items = list.data ?? [];
  const done = items.filter((i) => i.done).length;

  return (
    <div className="grid gap-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
          {done}/{items.length}
        </div>
      )}
      <ul className="grid gap-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
          >
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) => update.mutate({ id: item.id, done: v === true })}
            />
            <input
              defaultValue={item.text}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== item.text) update.mutate({ id: item.id, text: value });
              }}
              className={cn(
                'min-w-0 flex-1 bg-transparent text-sm outline-none',
                item.done && 'text-muted-foreground line-through',
              )}
            />
            <button
              type="button"
              aria-label="Quitar"
              onClick={() => remove.mutate(item.id)}
              className="cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate(text.trim());
        }}
      >
        <Plus className="size-4 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir elemento y pulsar Intro"
          className="h-8 border-dashed"
        />
      </form>
    </div>
  );
}
