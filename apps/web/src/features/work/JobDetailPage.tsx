import { useState } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ClipboardPaste, Package, Pause, Play, Trash2 } from 'lucide-react';
import {
  BILLING_STATUSES,
  CAT_BANDS,
  CONTENT_TYPES,
  CURRENCIES,
  JOB_STATUSES,
  SERVICES,
  UNITS,
  UNIT_PLURALS,
  emptyAnalysis,
  formatMoney,
  formatNumber,
  formatRate,
  pairLabel,
  parseCatAnalysis,
  rawVolume,
  weightedVolume,
  type CatBand,
  type Job,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { CommitInput, DecimalInput, DateInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useClient, useJob, useTimer } from '@/hooks/work';
import { useTrashWithUndo } from '@/hooks/mutations';
import { formatDuration } from '@/lib/format';
import { QueriesTable, NewQueryButton } from './QueriesPage';
import { TaskListView } from './tasks/TaskListView';
import { useTimerControls } from './time/useTimerControls';
import { RateHint, useResolvedRate } from './RateHint';
import { BackLink, FieldGrid, Section, Stat, usePatch } from './shared';

function PasteAnalysisDialog({
  grid,
  onApply,
}: {
  grid: Record<string, number> | null;
  onApply: (bands: CatBand[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const preview = text.trim() ? parseCatAnalysis(text, grid) : null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste /> Pegar análisis
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pegar el análisis del CAT</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copia de Excel o del informe de memoQ, Trados o Phrase dos columnas: la banda («100%»,
            «95-99%», «No match»…) y el número de palabras o caracteres.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder={'Repetitions\t300\n100%\t500\n95% - 99%\t200\nNo Match\t1234'}
          />
          {preview && (
            <p className="text-sm">
              Total: <strong>{formatNumber(rawVolume(preview))}</strong> · ponderado:{' '}
              <strong>{formatNumber(weightedVolume(preview))}</strong>
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={!preview || rawVolume(preview) === 0}
              onClick={() => {
                if (preview) onApply(preview);
                setOpen(false);
                setText('');
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VolumeSection({
  job,
  grid,
  save,
}: {
  job: Job;
  grid: Record<string, number> | null;
  save: (p: Partial<Job>) => void;
}) {
  const [useAnalysis, setUseAnalysis] = useState(
    Boolean(job.catAnalysis?.some((b) => b.count > 0)),
  );
  const bands = job.catAnalysis ?? emptyAnalysis(grid);
  const setBand = (key: string, field: 'count' | 'pct', value: number | null) => {
    const next = (bands.length ? bands : emptyAnalysis(grid)).map((b) =>
      b.key === key ? { ...b, [field]: value ?? 0 } : b,
    );
    save({ catAnalysis: next });
  };
  const unitLabel = UNIT_PLURALS[job.unit] ?? '';
  const resolved = useResolvedRate(job.projectId, job.service, job.unit);
  const rateEditable =
    !job.amountManual && job.billingStatus !== 'invoiced' && job.billingStatus !== 'paid';

  return (
    <Section
      title="Volumen e importe"
      actions={
        job.unit !== 'flat' && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={useAnalysis}
              onCheckedChange={(v) => {
                setUseAnalysis(v);
                if (!v) save({ catAnalysis: null });
              }}
              data-testid="toggle-analysis"
            />
            Análisis por coincidencias
          </label>
        )
      }
    >
      <div className="grid gap-5">
        <FieldGrid className="sm:grid-cols-3">
          <Field label="Unidad">
            <NativeSelect
              value={job.unit}
              onChange={(e) => save({ unit: e.target.value as Job['unit'] })}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {job.unit !== 'flat' && !useAnalysis && (
            <Field label={`Volumen (${unitLabel})`}>
              <DecimalInput
                value={job.volume}
                onCommit={(volume) => save({ volume })}
                testId="job-volume"
              />
            </Field>
          )}
          <Field
            label={
              job.unit === 'flat'
                ? 'Importe de la tarifa plana'
                : `Tarifa por ${UNITS.find((u) => u.value === job.unit)?.label.toLowerCase()}`
            }
          >
            <DecimalInput
              value={job.rateMicros}
              onCommit={(rateMicros) => save({ rateMicros })}
              scale={1_000_000}
              maxDecimals={6}
              suffix={job.currency}
              testId="job-rate"
            />
          </Field>
        </FieldGrid>
        <RateHint
          resolved={resolved.data}
          clientId={job.clientId}
          currentMicros={job.rateMicros}
          currentCurrency={job.currency}
          onApply={
            rateEditable
              ? (rate) =>
                  save({ rateMicros: rate.rateMicros, currency: rate.currency, unit: rate.unit })
              : undefined
          }
        />

        {useAnalysis && job.unit !== 'flat' && (
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Recuento por banda y porcentaje que se paga de cada una.
              </p>
              <PasteAnalysisDialog grid={grid} onApply={(b) => save({ catAnalysis: b })} />
            </div>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Banda</th>
                    <th className="px-3 py-2 text-right font-medium">{unitLabel}</th>
                    <th className="px-3 py-2 text-right font-medium">% que se paga</th>
                    <th className="px-3 py-2 text-right font-medium">Ponderado</th>
                  </tr>
                </thead>
                <tbody>
                  {CAT_BANDS.map((def) => {
                    const b = bands.find((x) => x.key === def.key) ?? {
                      key: def.key,
                      count: 0,
                      pct: grid?.[def.key] ?? def.defaultPct,
                    };
                    return (
                      <tr key={def.key} className="border-t">
                        <td className="px-3 py-1.5">{def.label}</td>
                        <td className="w-36 px-3 py-1.5">
                          <DecimalInput
                            value={b.count}
                            onCommit={(v) => setBand(def.key, 'count', v)}
                            maxDecimals={0}
                            testId={`band-${def.key}`}
                          />
                        </td>
                        <td className="w-32 px-3 py-1.5">
                          <DecimalInput
                            value={b.pct}
                            onCommit={(v) => setBand(def.key, 'pct', v)}
                            suffix="%"
                            maxDecimals={1}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatNumber((b.count * b.pct) / 100)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(rawVolume(bands))}
                    </td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums" data-testid="weighted-total">
                      {formatNumber(weightedVolume(bands))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4 rounded-lg bg-muted/40 p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Importe</div>
            {job.amountManual ? (
              <DecimalInput
                value={job.amountCents}
                onCommit={(amountCents) => save({ amountCents })}
                scale={100}
                suffix={job.currency}
                className="mt-1 w-48"
              />
            ) : (
              <div className="text-2xl font-semibold tabular-nums" data-testid="job-amount">
                {formatMoney(job.amountCents, job.currency)}
              </div>
            )}
            {!job.amountManual && job.weightedVolume != null && (
              <div className="text-xs text-muted-foreground">
                {formatNumber(job.weightedVolume)} {unitLabel} ponderadas × tarifa
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={job.amountManual}
              onCheckedChange={(amountManual) => save({ amountManual })}
            />
            Fijar el importe a mano
          </label>
          <Field label="Moneda" className="ml-auto w-28">
            <NativeSelect value={job.currency} onChange={(e) => save({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </div>
    </Section>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams({ strict: false }) as { jobId: string };
  const navigate = useNavigate();
  const q = useJob(jobId);
  const client = useClient(q.data?.clientId ?? '');
  const patch = usePatch<Job>(`/jobs/${jobId}`, ['job', jobId]);
  const trash = useTrashWithUndo();
  const timer = useTimer();
  const controls = useTimerControls();

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado el encargo.</p>
      </Page>
    );
  const job = q.data;
  const save = (p: Partial<Job>) =>
    patch.mutate(p, {
      onSuccess: (updated) => {
        const u = updated as Job & { rateChanged?: boolean };
        if (u.rateChanged)
          toast.success(
            `Tarifa actualizada a ${formatRate(u.rateMicros, u.currency)} según las tarifas del cliente`,
          );
      },
    });
  const grid = client.data?.client.catGrid ?? null;
  const running = timer.data?.running?.jobId === job.id;

  return (
    <Page wide>
      <BackLink to="/trabajo/encargos" label="Encargos" />
      <PageHeader
        icon={<Package />}
        title={job.title}
        description={
          <span className="inline-flex flex-wrap gap-x-2">
            <Link
              to="/trabajo/proyectos/$projectId"
              params={{ projectId: job.projectId }}
              className="hover:underline"
            >
              {job.projectName}
            </Link>
            {job.clientName && <span>· {job.clientName}</span>}
            {job.gameTitle && <span>· {job.gameTitle}</span>}
            <span>· {pairLabel(job.sourceLang, job.targetLang)}</span>
          </span>
        }
        actions={
          <>
            <NativeSelect
              value={job.status}
              onChange={(e) => save({ status: e.target.value as Job['status'] })}
              className="w-48"
              data-testid="job-status"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={job.billingStatus}
              onChange={(e) => save({ billingStatus: e.target.value as Job['billingStatus'] })}
              className="w-48"
            >
              {BILLING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            {running ? (
              <Button variant="outline" onClick={() => controls.stop()}>
                <Pause /> Parar
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => controls.start({ jobId: job.id }, job.title)}
              >
                <Play /> Cronometrar
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar encargo"
              onClick={async () => {
                await trash('job', job.id, job.title, [['jobs']]);
                void navigate({ to: '/trabajo/encargos' });
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="mb-5">
        <TagPicker entityType="job" entityId={job.id} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Importe" value={formatMoney(job.amountCents, job.currency)} />
        <Stat
          label="Volumen"
          value={job.volume == null ? '—' : formatNumber(job.weightedVolume ?? job.volume)}
          hint={
            job.weightedVolume != null
              ? `de ${formatNumber(job.volume)} ${UNIT_PLURALS[job.unit]} (ponderado)`
              : UNIT_PLURALS[job.unit]
          }
        />
        <Stat label="Tiempo dedicado" value={formatDuration(job.loggedSeconds)} />
        <Stat
          label="€/hora efectivo"
          value={
            job.amountCents && job.loggedSeconds > 600
              ? formatMoney(Math.round(job.amountCents / (job.loggedSeconds / 3600)), job.currency)
              : '—'
          }
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="grid content-start gap-6">
          <Section title="Datos del encargo">
            <FieldGrid className="sm:grid-cols-3">
              <Field label="Título">
                <CommitInput value={job.title} onCommit={(v) => v && save({ title: v })} />
              </Field>
              <Field label="Servicio">
                <NativeSelect
                  value={job.service}
                  onChange={(e) => save({ service: e.target.value as Job['service'] })}
                >
                  {SERVICES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Tipo de contenido">
                <NativeSelect
                  value={job.contentType ?? ''}
                  onChange={(e) =>
                    save({ contentType: (e.target.value || null) as Job['contentType'] })
                  }
                >
                  <option value="">—</option>
                  {CONTENT_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="N.º de pedido (PO)">
                <CommitInput value={job.poNumber} onCommit={(v) => save({ poNumber: v })} />
              </Field>
              <Field label="Recibido">
                <DateInput value={job.receivedAt} onCommit={(v) => save({ receivedAt: v })} />
              </Field>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label="Entrega">
                  <DateInput value={job.dueDate} onCommit={(v) => save({ dueDate: v })} />
                </Field>
                <Field label="Hora">
                  <Input
                    type="time"
                    value={job.dueTime ?? ''}
                    onChange={(e) => save({ dueTime: e.target.value || null })}
                    className="w-28"
                  />
                </Field>
              </div>
              <Field label="Entregado">
                <DateInput value={job.deliveredAt} onCommit={(v) => save({ deliveredAt: v })} />
              </Field>
            </FieldGrid>
          </Section>
          <VolumeSection key={`${job.id}-${job.unit}`} job={job} grid={grid} save={save} />
          <Section title="Notas">
            <CommitInput
              value={job.notes}
              onCommit={(v) => save({ notes: v })}
              multiline
              rows={5}
              placeholder="Instrucciones del cliente, incidencias, enlaces…"
            />
          </Section>
        </div>
        <div className="grid content-start gap-6">
          <Section title="Tareas">
            <TaskListView
              query={{ jobId: job.id }}
              defaults={{ jobId: job.id, projectId: job.projectId }}
              emptyText="Sin tareas pendientes."
            />
          </Section>
          <Section
            title="Consultas al cliente"
            actions={<NewQueryButton projectId={job.projectId} jobId={job.id} />}
          >
            <QueriesTable query={{ jobId: job.id }} compact />
          </Section>
          <Section title="Archivos">
            <AttachmentsPanel entityType="job" entityId={job.id} />
          </Section>
        </div>
      </div>
    </Page>
  );
}
