import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, RotateCcw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  IMPORT_TARGETS,
  IMPORT_TARGET_KEYS,
  autoMap,
  formatDateTimeES,
  type ImportBatch,
  type ImportPreview,
  type ImportResult,
  type ImportTarget,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useInvalidateWork } from '@/hooks/work';
import { api } from '@/lib/api';

const HINTS: Record<ImportTarget, string> = {
  clients:
    'Una fila por cliente. Desde Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx).',
  games: 'Una fila por juego. Los géneros y las plataformas pueden ir separados por comas.',
  projects: 'Una fila por proyecto. Si el cliente o el juego no existen, se crean.',
  tasks:
    'Desde ClickUp: menú de la lista o del espacio → Exportar → CSV. Se conservan subtareas, estados, etiquetas y listas.',
};

function History() {
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  const confirm = useConfirm();
  const batches = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api<ImportBatch[]>('/import/batches'),
  });
  const undo = useMutation({
    mutationFn: (id: string) =>
      api<{ removed: number }>(`/import/batches/${id}/undo`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Importación deshecha');
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
  if (!batches.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Importaciones anteriores</CardTitle>
        <CardDescription>
          Puedes deshacer una importación entera: se borran todas las fichas que creó.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Fecha</TH>
              <TH>Tipo</TH>
              <TH>Archivo</TH>
              <TH className="text-right">Fichas</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {batches.data.map((b) => (
              <TR key={b.id}>
                <TD>{formatDateTimeES(b.createdAt)}</TD>
                <TD>{IMPORT_TARGETS[b.kind as ImportTarget]?.label ?? b.kind}</TD>
                <TD className="max-w-xs truncate">{b.fileName}</TD>
                <TD className="text-right tabular-nums">{b.rowCount}</TD>
                <TD className="text-right">
                  {b.undoneAt ? (
                    <span className="text-xs text-muted-foreground">Deshecha</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: '¿Deshacer esta importación?',
                            description: `Se borrarán definitivamente las ${b.rowCount} fichas que creó.`,
                            confirmLabel: 'Deshacer',
                            destructive: true,
                          })
                        ) {
                          undo.mutate(b.id);
                        }
                      }}
                    >
                      <RotateCcw /> Deshacer
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ImportWizard() {
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<ImportTarget>('tasks');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api<ImportPreview>('/import/preview', { method: 'POST', body: form });
    },
    onSuccess: (p) => {
      setPreview(p);
      setMapping(autoMap(p.headers, target));
      setResult(null);
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      api<ImportResult>('/import/commit', {
        method: 'POST',
        body: { token: preview!.token, target, mapping, dateFormat, skipDuplicates },
      }),
    onSuccess: async (r) => {
      setResult(r);
      setPreview(null);
      toast.success(`${r.created} fichas importadas`);
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await qc.invalidateQueries({ queryKey: ['tags'] });
      await qc.invalidateQueries({ queryKey: ['areas'] });
      await qc.invalidateQueries({ queryKey: ['task-lists'] });
    },
  });

  const fields = IMPORT_TARGETS[target].fields;
  const missingRequired = fields.some((f) => 'required' in f && f.required && !mapping[f.key]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar datos</CardTitle>
          <CardDescription>
            Trae tus datos de ClickUp, Google Sheets, Excel o Notion (exportando las bases de datos
            como CSV). Antes de importar verás una vista previa, y podrás deshacer la importación
            entera.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-end">
            <Field label="¿Qué quieres importar?">
              <NativeSelect
                value={target}
                onChange={(e) => {
                  const t = e.target.value as ImportTarget;
                  setTarget(t);
                  if (preview) setMapping(autoMap(preview.headers, t));
                }}
                data-testid="import-target"
              >
                {IMPORT_TARGET_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {IMPORT_TARGETS[k].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? <Spinner /> : <Upload />} Elegir archivo (.csv o .xlsx)
              </Button>
              <input
                ref={input}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                className="hidden"
                data-testid="import-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) upload.mutate(f);
                }}
              />
              <p className="text-sm text-muted-foreground">{HINTS[target]}</p>
            </div>
          </div>

          {preview && (
            <div className="grid gap-5 rounded-lg border p-4">
              <p className="flex items-center gap-2 text-sm">
                <FileUp className="size-4" />
                <strong>{preview.fileName}</strong>
                {preview.sheetName && (
                  <span className="text-muted-foreground">· hoja «{preview.sheetName}»</span>
                )}
                <span className="text-muted-foreground">· {preview.totalRows} filas</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((f) => (
                  <Field
                    key={f.key}
                    label={`${f.label}${'required' in f && f.required ? ' *' : ''}`}
                  >
                    <NativeSelect
                      value={mapping[f.key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    >
                      <option value="">— No importar —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-6">
                {target === 'tasks' && (
                  <Field label="Formato de las fechas" className="w-64">
                    <NativeSelect
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
                    >
                      <option value="auto">Automático (día/mes/año por defecto)</option>
                      <option value="dmy">Día/mes/año</option>
                      <option value="mdy">Mes/día/año (formato de EE. UU.)</option>
                    </NativeSelect>
                  </Field>
                )}
                {target !== 'tasks' && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} /> Omitir
                    las que ya existan (mismo nombre)
                  </label>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <THead>
                    <TR>
                      {fields
                        .filter((f) => mapping[f.key])
                        .map((f) => (
                          <TH key={f.key}>{f.label}</TH>
                        ))}
                    </TR>
                  </THead>
                  <TBody>
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <TR key={i}>
                        {fields
                          .filter((f) => mapping[f.key])
                          .map((f) => (
                            <TD key={f.key} className="max-w-56 truncate">
                              {row[mapping[f.key]!]}
                            </TD>
                          ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={missingRequired || commit.isPending}
                  onClick={() => commit.mutate()}
                  data-testid="import-commit"
                >
                  {commit.isPending && <Spinner />} Importar {preview.totalRows} filas
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div
              className="grid gap-2 rounded-lg border border-success/40 bg-success/10 p-4 text-sm"
              data-testid="import-result"
            >
              <p>
                <strong>{result.created}</strong> fichas creadas
                {result.skipped > 0 && <>, {result.skipped} omitidas por estar repetidas</>}
                {result.errors.length > 0 && <>, {result.errors.length} filas con errores</>}.
              </p>
              {result.errors.length > 0 && (
                <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <History />
    </div>
  );
}
