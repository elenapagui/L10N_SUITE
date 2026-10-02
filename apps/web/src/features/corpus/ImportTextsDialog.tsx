import { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  CORPUS_LANGS,
  CORPUS_TEXT_TYPES,
  formatNumber,
  type CorpusImportOptions,
  type CorpusImportPreview,
  type CorpusImportResult,
  type CorpusTextType,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Role = '' | `lang:${string}` | 'stringId' | 'speaker' | 'context' | 'textType';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: '', label: '— No importar' },
  ...CORPUS_LANGS.map((l) => ({
    value: `lang:${l.value}` as Role,
    label: `Texto en ${l.label.toLowerCase()}`,
  })),
  { value: 'stringId', label: 'ID de cadena' },
  { value: 'speaker', label: 'Hablante' },
  { value: 'context', label: 'Contexto' },
  { value: 'textType', label: 'Tipo de texto' },
];

type Preview = CorpusImportPreview & { headerIsData: boolean };

export function ImportTextsDialog({
  gameId,
  open,
  onOpenChange,
}: {
  gameId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [headerIsData, setHeaderIsData] = useState(false);
  const [title, setTitle] = useState('');
  const [textType, setTextType] = useState<CorpusTextType>('dialogue');
  const [options, setOptions] = useState<CorpusImportOptions>({
    markup: 'strip',
    variables: 'keep',
    literalNewlines: true,
    skipDuplicates: false,
    skipMisaligned: false,
  });
  const [result, setResult] = useState<CorpusImportResult | null>(null);

  const reset = () => {
    setPreview(null);
    setResult(null);
    setRoles([]);
    setSheet(0);
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    setBusy(true);
    try {
      const p = await api<Preview>('/corpus/import/preview', { method: 'POST', body: form });
      setPreview(p);
      setSheet(0);
      setHeaderIsData(p.headerIsData);
      setTitle(file.name.replace(/\.[^.]+$/, ''));
      const r: Role[] = p.sheets[0]!.headers.map(() => '');
      for (const [lang, i] of Object.entries(p.suggested.languages)) r[i] = `lang:${lang}`;
      if (p.suggested.stringId != null) r[p.suggested.stringId] = 'stringId';
      if (p.suggested.speaker != null) r[p.suggested.speaker] = 'speaker';
      if (p.suggested.context != null) r[p.suggested.context] = 'context';
      setRoles(r);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido leer el archivo.');
    } finally {
      setBusy(false);
    }
  };

  const current = preview?.sheets[sheet];
  const mapping = useMemo(() => {
    const languages: Record<string, number> = {};
    let stringId: number | null = null;
    let speaker: number | null = null;
    let context: number | null = null;
    let textTypeColumn: number | null = null;
    roles.forEach((r, i) => {
      if (r.startsWith('lang:')) languages[r.slice(5)] = i;
      else if (r === 'stringId') stringId = i;
      else if (r === 'speaker') speaker = i;
      else if (r === 'context') context = i;
      else if (r === 'textType') textTypeColumn = i;
    });
    return { languages, stringId, speaker, context, textTypeColumn };
  }, [roles]);

  const setRole = (i: number, role: Role) =>
    setRoles((rs) => rs.map((r, j) => (j === i ? role : role && r === role ? '' : r)));

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api<CorpusImportResult>('/corpus/import/commit', {
        method: 'POST',
        body: {
          token: preview.token,
          sheet,
          gameId,
          title,
          textType,
          headerIsData,
          options,
          ...mapping,
        },
      });
      setResult(r);
      await Promise.all(
        [
          'corpus-documents',
          'corpus-profiles',
          'corpus-profile',
          'corpus-stats',
          'import-batches',
        ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar.');
    } finally {
      setBusy(false);
    }
  };

  const rows = current
    ? (headerIsData ? [current.headers, ...current.sample] : current.sample).slice(0, 6)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Importar textos al corpus</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
              <CheckCircle2 className="mt-0.5 size-5 text-success" />
              <div className="text-sm">
                <p className="font-medium">
                  {formatNumber(result.segments, 0)} segmentos importados.
                </p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {result.skippedEmpty > 0 && <li>{result.skippedEmpty} filas vacías omitidas.</li>}
                  {result.misaligned > 0 && (
                    <li>
                      {result.misaligned} filas desalineadas (falta el texto en algún idioma)
                      {options.skipMisaligned ? ', omitidas' : ''}.
                    </li>
                  )}
                  {result.duplicates > 0 && (
                    <li>
                      {result.duplicates} filas repetidas
                      {options.skipDuplicates ? ', omitidas' : ''}.
                    </li>
                  )}
                  {result.markupRemoved > 0 && (
                    <li>{result.markupRemoved} etiquetas de formato eliminadas.</li>
                  )}
                  {result.variablesFound > 0 && (
                    <li>{result.variablesFound} variables encontradas.</li>
                  )}
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Importar otro archivo
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  void navigate({
                    to: '/corpus/documentos/$documentId',
                    params: { documentId: result.documentId },
                  });
                }}
              >
                Ver el documento
              </Button>
            </DialogFooter>
          </div>
        ) : !preview ? (
          <div className="grid place-items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            {busy ? (
              <Spinner />
            ) : (
              <>
                <FileUp className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Excel (.xlsx) o CSV con una columna por idioma. Si no tiene cabeceras, la columna
                  A es el coreano y la B el español.
                </p>
                <Button onClick={() => fileRef.current?.click()} data-testid="corpus-choose-file">
                  Elegir archivo
                </Button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              data-testid="corpus-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Título del documento">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="corpus-doc-title"
                />
              </Field>
              <Field label="Tipo de texto">
                <NativeSelect
                  value={textType}
                  onChange={(e) => setTextType(e.target.value as CorpusTextType)}
                >
                  {CORPUS_TEXT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {preview.sheets.length > 1 && (
                <Field label="Hoja">
                  <NativeSelect
                    value={String(sheet)}
                    onChange={(e) => setSheet(Number(e.target.value))}
                  >
                    {preview.sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name} ({s.rowCount} filas)
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={headerIsData}
                onCheckedChange={(v) => setHeaderIsData(v === true)}
              />
              La primera fila también es texto (el archivo no tiene cabeceras)
            </label>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <THead>
                  <TR>
                    {current!.headers.map((h, i) => (
                      <TH key={i} className="min-w-44 align-top">
                        <NativeSelect
                          className={cn('h-8 text-xs', roles[i] && 'border-primary')}
                          value={roles[i] ?? ''}
                          onChange={(e) => setRole(i, e.target.value as Role)}
                          aria-label={`Uso de la columna ${headerIsData ? i + 1 : h}`}
                          data-testid={`corpus-role-${i}`}
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect>
                        {!headerIsData && (
                          <div className="mt-1 truncate text-xs normal-case text-muted-foreground">
                            {h}
                          </div>
                        )}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r, j) => (
                    <TR key={j}>
                      {current!.headers.map((_, i) => (
                        <TD
                          key={i}
                          className={cn(
                            'max-w-64 truncate text-xs',
                            roles[i] ? '' : 'text-muted-foreground/60',
                          )}
                          lang={roles[i] === 'lang:ko' ? 'ko' : undefined}
                        >
                          {r[i]}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(current!.rowCount + (headerIsData ? 1 : 0), 0)} filas en la hoja.
            </p>
            <div className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <Field label="Etiquetas de formato (<color>, [b]…)">
                <NativeSelect
                  value={options.markup}
                  onChange={(e) =>
                    setOptions({ ...options, markup: e.target.value as 'keep' | 'strip' })
                  }
                >
                  <option value="strip">Quitarlas</option>
                  <option value="keep">Conservarlas</option>
                </NativeSelect>
              </Field>
              <Field label="Variables ({0}, %s, $NAME$…)">
                <NativeSelect
                  value={options.variables}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      variables: e.target.value as CorpusImportOptions['variables'],
                    })
                  }
                >
                  <option value="keep">Conservarlas</option>
                  <option value="placeholder">Sustituirlas por ⟨VAR⟩</option>
                  <option value="strip">Quitarlas</option>
                </NativeSelect>
              </Field>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={options.literalNewlines}
                  onCheckedChange={(v) => setOptions({ ...options, literalNewlines: v === true })}
                />
                Convertir «\n» escrito en salto de línea
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={options.skipDuplicates}
                  onCheckedChange={(v) => setOptions({ ...options, skipDuplicates: v === true })}
                />
                Omitir filas repetidas
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={options.skipMisaligned}
                  onCheckedChange={(v) => setOptions({ ...options, skipMisaligned: v === true })}
                />
                Omitir filas a las que les falta algún idioma
              </label>
            </div>
            {Object.keys(mapping.languages).length === 0 && (
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-warning">
                <AlertTriangle className="size-4" /> Elige al menos una columna de texto.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Cambiar de archivo
              </Button>
              <Button
                disabled={busy || !title.trim() || Object.keys(mapping.languages).length === 0}
                onClick={() => void commit()}
                data-testid="corpus-import-commit"
              >
                {busy ? 'Importando…' : 'Importar'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
