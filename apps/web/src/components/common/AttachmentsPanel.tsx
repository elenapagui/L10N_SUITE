import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderOpen, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateES, type Attachment } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { queryKeys } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api, apiUrl } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { openAttachment } from '@/lib/entities';
import { cn, formatBytes } from '@/lib/utils';

/** Adjuntos de una ficha: subir (botón o arrastrar), abrir, mostrar en la carpeta y borrar. */
export function AttachmentsPanel({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const trash = useTrashWithUndo();
  const key = queryKeys.attachments(entityType, entityId);
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<Attachment[]>('/attachments', { query: { entityType, entityId } }),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append('file', f, f.name);
      return api<Attachment[]>('/attachments', {
        method: 'POST',
        body: form,
        query: { entityType, entityId },
      });
    },
    onSuccess: (saved) => {
      toast.success(
        saved.length === 1 ? 'Archivo adjuntado' : `${saved.length} archivos adjuntados`,
      );
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const onFiles = (files: FileList | null) => {
    if (files && files.length > 0) upload.mutate([...files]);
  };

  return (
    <div
      className={cn(
        'grid gap-3 rounded-lg border border-dashed p-3 transition-colors',
        dragging && 'border-primary bg-accent/40',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => input.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Spinner /> : <Upload />}
          Adjuntar archivos
        </Button>
        <span className="text-xs text-muted-foreground">
          o arrástralos aquí. Se guardan en la carpeta de datos de la app.
        </span>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (list.data?.length ?? 0) === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="size-4" /> Sin adjuntos.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {list.data?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline"
                onClick={() => openAttachment(a.id).catch((err: Error) => toast.error(err.message))}
                title="Abrir"
              >
                {a.fileName}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(a.size)} · {formatDateES(a.createdAt)}
              </span>
              {desktop ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Mostrar en la carpeta"
                  onClick={() => void desktop?.showItemInFolder(a.absolutePath)}
                >
                  <FolderOpen />
                </Button>
              ) : (
                <a
                  className="text-xs text-muted-foreground hover:underline"
                  href={apiUrl(`/attachments/${a.id}/content`, { download: 1 })}
                >
                  Descargar
                </a>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Eliminar adjunto"
                onClick={() => void trash('attachment', a.id, a.fileName, [[...key]])}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
