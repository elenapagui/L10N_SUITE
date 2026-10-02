import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FileArchive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPORT_FORMATS,
  formatDateTimeES,
  formatNumber,
  langLabel,
  type CorpusExportFormat,
  type CorpusFilters,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { api, apiUrl } from '@/lib/api';
import { openAttachment } from '@/lib/entities';
import { FiltersPanel, countFilters } from './FiltersPanel';
import { filtersParam, useCorpusStats, useCorpusVersions } from './hooks';

export function ExportPanel() {
  const [filters, setFilters] = useState<CorpusFilters>({});
  const [format, setFormat] = useState<CorpusExportFormat>('tmx');
  const stats = useCorpusStats(filters);
  const versions = useCorpusVersions();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [langs, setLangs] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const available = stats.data?.languages.map((l) => l.lang) ?? [];
  const chosen = langs ?? available;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="grid content-start gap-4 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-medium">Exportar</h2>
          <p className="text-sm text-muted-foreground">
            El corpus completo o un subcorpus filtrado. El material de uso restringido solo se
            incluye si lo pides en los filtros.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <FiltersPanel value={filters} onChange={setFilters} />
          {stats.data ? (
            <span className="text-muted-foreground">
              {countFilters(filters) ? 'Subcorpus' : 'Corpus completo'}:{' '}
              {formatNumber(stats.data.segments, 0)} segmentos de {stats.data.games} juegos
            </span>
          ) : (
            <Spinner />
          )}
        </div>
        <Field label="Formato">
          <NativeSelect
            value={format}
            onChange={(e) => setFormat(e.target.value as CorpusExportFormat)}
            data-testid="corpus-export-format"
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {available.length > 1 && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Idiomas</span>
            <div className="flex flex-wrap gap-3">
              {available.map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={chosen.includes(l)}
                    onCheckedChange={(on) =>
                      setLangs(on ? [...chosen, l] : chosen.filter((x) => x !== l))
                    }
                  />
                  {langLabel(l)}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <Button asChild disabled={!stats.data?.segments || !chosen.length}>
            <a
              href={apiUrl('/corpus/export', {
                format,
                filters: filtersParam(filters),
                langs: chosen.join(','),
              })}
              data-testid="corpus-export"
            >
              <Download /> Exportar
            </a>
          </Button>
        </div>
      </section>

      <section className="grid content-start gap-4 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-medium">Versiones del corpus</h2>
          <p className="text-sm text-muted-foreground">
            Una versión fija el estado del corpus (con los filtros de la izquierda) en un ZIP con
            TMX, TXT, CSV y un manifiesto, para citarla y reproducir tus análisis.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="v0.1"
              data-testid="corpus-version-name"
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              rows={1}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qué incluye o qué cambia"
            />
          </Field>
        </div>
        <div>
          <Button
            disabled={!name.trim() || creating || !stats.data?.segments}
            onClick={async () => {
              setCreating(true);
              try {
                await api('/corpus/versions', {
                  method: 'POST',
                  body: { name: name.trim(), description, filters },
                });
                setName('');
                setDescription('');
                await qc.invalidateQueries({ queryKey: ['corpus-versions'] });
                toast.success('Versión creada');
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'No se ha podido crear la versión.',
                );
              } finally {
                setCreating(false);
              }
            }}
            data-testid="corpus-create-version"
          >
            <FileArchive /> {creating ? 'Creando…' : 'Crear versión'}
          </Button>
        </div>
        <ul className="grid gap-2">
          {(versions.data ?? []).map((v) => (
            <li key={v.id} className="rounded-md border p-3 text-sm" data-testid="corpus-version">
              <div className="flex items-center gap-2">
                <span className="font-medium">{v.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTimeES(v.createdAt)}
                </span>
                <div className="ml-auto flex gap-1">
                  {v.attachmentId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void openAttachment(v.attachmentId!)}
                    >
                      <Download /> ZIP
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Eliminar versión"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `¿Eliminar la versión «${v.name}»?`,
                          description: 'El ZIP pasa a la papelera.',
                          confirmLabel: 'Eliminar',
                          destructive: true,
                        })
                      ) {
                        await api(`/corpus/versions/${v.id}`, { method: 'DELETE' });
                        await qc.invalidateQueries({ queryKey: ['corpus-versions'] });
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {v.description && <p className="mt-1 text-muted-foreground">{v.description}</p>}
              <div className="mt-2 flex items-start gap-2 rounded bg-muted/50 p-2 text-xs">
                <span className="flex-1">{v.citation}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Copiar la cita"
                  title="Copiar la cita"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(v.citation)
                      .then(() => toast.success('Cita copiada'))
                  }
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
          {versions.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">Aún no hay versiones.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
