import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FileArchive } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

interface NotionResult {
  rootPageId: string;
  pages: number;
  tables: number;
  attachments: number;
}

/** Importación de la exportación de Notion («Markdown & CSV»). */
export function NotionImport() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NotionResult | null>(null);

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    setBusy(true);
    setResult(null);
    try {
      const r = await api<NotionResult>('/import/notion', { method: 'POST', body: form });
      setResult(r);
      await Promise.all(
        ['pages', 'tables', 'import-batches'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive className="size-5" /> Notion
        </CardTitle>
        <CardDescription>
          En Notion: <strong>Configuración → Exportar todo el contenido del espacio</strong> (o
          «Exportar» en una página) con el formato
          <strong> Markdown & CSV</strong> e incluyendo subpáginas. Sube aquí el ZIP: las páginas
          conservan su jerarquía, las imágenes se guardan como adjuntos y las bases de datos pasan a
          ser tablas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button onClick={() => input.current?.click()} disabled={busy} data-testid="notion-import">
          {busy ? 'Importando…' : 'Elegir el ZIP de Notion'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
        {result && (
          <p className="text-sm">
            Importadas {result.pages} páginas, {result.tables} tablas y {result.attachments}{' '}
            archivos.{' '}
            <Link
              to="/paginas/$pageId"
              params={{ pageId: result.rootPageId }}
              className="font-medium underline"
            >
              Ver las páginas
            </Link>
            . Si algo no ha salido bien, puedes deshacerlo en «Importaciones anteriores».
          </p>
        )}
      </CardContent>
    </Card>
  );
}
