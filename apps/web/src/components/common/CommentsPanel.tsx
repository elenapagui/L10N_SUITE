import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateTimeES } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useApiMutation, useComments } from '@/hooks/work';
import { api } from '@/lib/api';

export function CommentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const comments = useComments(entityType, entityId);
  const [body, setBody] = useState('');
  const key = ['comments', entityType, entityId];
  const add = useApiMutation(
    (text: string) =>
      api('/comments', { method: 'POST', body: { entityType, entityId, body: text } }),
    {
      onSuccess: () => setBody(''),
      extraKeys: [key],
    },
  );
  const remove = useApiMutation((id: string) => api(`/comments/${id}`, { method: 'DELETE' }), {
    extraKeys: [key],
  });

  return (
    <div className="grid gap-3">
      {(comments.data ?? []).map((c) => (
        <div key={c.id} className="group rounded-md border bg-muted/30 px-3 py-2">
          <div className="mb-1 flex items-center text-xs text-muted-foreground">
            {formatDateTimeES(c.createdAt)}
            <button
              type="button"
              aria-label="Borrar comentario"
              onClick={() => remove.mutate(c.id)}
              className="ml-auto cursor-pointer opacity-0 hover:text-foreground group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm">{c.body}</p>
        </div>
      ))}
      <div className="grid gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Añadir un comentario o una nota…"
          rows={2}
        />
        <div>
          <Button
            size="sm"
            disabled={!body.trim() || add.isPending}
            onClick={() => add.mutate(body.trim())}
          >
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
