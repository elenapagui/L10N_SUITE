import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  APPLICATION_EVENT_KINDS,
  APPLICATION_KINDS,
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  CURRENCIES,
  SALARY_PERIODS,
  UNITS,
  WORK_MODES,
  formatDateES,
  labelOf,
  languageOptions,
  normalizeUrl,
  todayISO,
  type ApplicationEvent,
  type ApplicationEventKind,
  type Client,
  type JobApplication,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { CommitInput, DateInput, DecimalInput } from '@/components/common/inputs';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { BackLink, FieldGrid, Section } from '@/features/work/shared';
import { ApplicationStatusBadge } from './ApplicationsPage';
import { applicationKeys, useApplication, useApplicationEvents } from './hooks';

/** Pasos que se pueden añadir a mano (el cambio de estado lo anota la app). */
const ADDABLE = APPLICATION_EVENT_KINDS.filter((k) => k.value !== 'status');
const QUICK: ApplicationEventKind[] = [
  'test_received',
  'test_sent',
  'interview',
  'follow_up',
  'response',
];

function AddStep({ applicationId, onAdded }: { applicationId: string; onAdded: () => void }) {
  const [kind, setKind] = useState<ApplicationEventKind>('test_received');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await api(`/job-applications/${applicationId}/events`, {
        method: 'POST',
        body: {
          kind,
          date,
          time: kind === 'interview' && time ? time : null,
          dueDate: kind === 'test_received' && dueDate ? dueDate : null,
          notes: notes.trim() || null,
        },
      });
      setNotes('');
      setTime('');
      setDueDate('');
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido añadir el paso.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              kind === k
                ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-xs font-medium'
                : 'rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent'
            }
          >
            {labelOf(APPLICATION_EVENT_KINDS, k)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Paso">
          <NativeSelect
            value={kind}
            onChange={(e) => setKind(e.target.value as ApplicationEventKind)}
            data-testid="step-kind"
          >
            {ADDABLE.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="step-date"
          />
        </Field>
        {kind === 'interview' ? (
          <Field label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        ) : kind === 'test_received' ? (
          <Field label="Plazo de entrega">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="step-due"
            />
          </Field>
        ) : (
          <div />
        )}
      </div>
      <Field label="Notas">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            kind === 'interview'
              ? 'Con quién, por dónde (Zoom, Teams…), qué preparar'
              : kind === 'test_received'
                ? 'Palabras, herramienta, instrucciones'
                : ''
          }
        />
      </Field>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || !date}
          onClick={() => void add()}
          data-testid="step-add"
        >
          Añadir al historial
        </Button>
      </div>
    </div>
  );
}

function Timeline({
  events,
  onDelete,
}: {
  events: ApplicationEvent[];
  onDelete: (e: ApplicationEvent) => void;
}) {
  if (!events.length)
    return <p className="text-sm text-muted-foreground">Aún no hay pasos en el historial.</p>;
  return (
    <ol className="grid gap-2" data-testid="application-timeline">
      {events.map((e) => (
        <li key={e.id} className="group flex items-start gap-3 text-sm">
          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
            {formatDateES(e.date)}
          </span>
          <div className="min-w-0 flex-1">
            <span className={e.kind === 'status' ? 'text-muted-foreground' : 'font-medium'}>
              {labelOf(APPLICATION_EVENT_KINDS, e.kind)}
            </span>
            {e.time && <span className="text-muted-foreground"> · {e.time}</span>}
            {e.dueDate && (
              <span className="text-muted-foreground"> · entrega: {formatDateES(e.dueDate)}</span>
            )}
            {e.notes && <p className="whitespace-pre-wrap text-muted-foreground">{e.notes}</p>}
          </div>
          <button
            type="button"
            aria-label="Borrar el paso"
            className="opacity-0 group-hover:opacity-100"
            onClick={() => onDelete(e)}
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ol>
  );
}

export function ApplicationDetailPage() {
  const { applicationId } = useParams({ strict: false }) as { applicationId: string };
  const q = useApplication(applicationId);
  const events = useApplicationEvents(applicationId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const trash = useTrashWithUndo();
  // Si se vacía un campo obligatorio, se vuelve a mostrar el valor guardado.
  const [resetKey, setResetKey] = useState(0);
  const required = (field: 'title' | 'company') => (v: string | null) => {
    if (v?.trim()) void save({ [field]: v.trim() });
    else setResetKey((k) => k + 1);
  };
  const refresh = () =>
    Promise.all(applicationKeys(applicationId).map((k) => qc.invalidateQueries({ queryKey: k })));

  const save = async (patch: Partial<JobApplication>) => {
    // Optimista: dos cambios seguidos no se pisan.
    qc.setQueryData<JobApplication>(['job-application', applicationId], (old) =>
      old ? { ...old, ...patch } : old,
    );
    try {
      await api(`/job-applications/${applicationId}`, { method: 'PATCH', body: patch });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
    await refresh();
  };

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  const a = q.data;
  if (!a)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado la candidatura.</p>
      </Page>
    );

  const toClient = async () => {
    const ok = await confirm({
      title: `¿Crear el cliente «${a.company}»?`,
      description:
        'Se crea con la web y el correo de la oferta' +
        (a.contactName ? ', su contacto' : '') +
        (a.rateMicros != null && a.rateUnit ? ' y la tarifa acordada' : '') +
        '. Después podrás completarlo en Clientes.',
      confirmLabel: 'Crear cliente',
    });
    if (!ok) return;
    try {
      const client = await api<Client>(`/job-applications/${a.id}/client`, { method: 'POST' });
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['clients'] })]);
      toast.success(`Cliente «${client.name}» creado`);
      void navigate({ to: '/trabajo/clientes/$clientId', params: { clientId: client.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido crear el cliente.');
    }
  };

  const langs = (current: string | null) => languageOptions(current);

  return (
    <Page wide>
      <BackLink to="/empleo" label="Candidaturas" />
      <PageHeader
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {a.company} · {labelOf(APPLICATION_KINDS, a.kind)}
            <ApplicationStatusBadge status={a.status} />
          </span>
        }
        actions={
          <>
            <NativeSelect
              className="h-9 w-44"
              value={a.status}
              onChange={(e) => void save({ status: e.target.value as JobApplication['status'] })}
              aria-label="Estado"
              data-testid="application-status"
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            {a.url && (
              <Button variant="outline" asChild>
                <a href={normalizeUrl(a.url)!} target="_blank" rel="noreferrer">
                  <ExternalLink /> Oferta
                </a>
              </Button>
            )}
            {a.clientId ? (
              <Button variant="outline" asChild>
                <Link to="/trabajo/clientes/$clientId" params={{ clientId: a.clientId }}>
                  <Building2 /> {a.clientName ?? 'Cliente'}
                </Link>
              </Button>
            ) : (
              <Button
                variant={a.status === 'accepted' ? 'default' : 'outline'}
                onClick={() => void toClient()}
                data-testid="application-to-client"
              >
                <Building2 /> Crear cliente
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Eliminar la candidatura"
              onClick={async () => {
                await trash('job_application', a.id, `${a.title} · ${a.company}`, [
                  ['job-applications'],
                ]);
                void navigate({ to: '/empleo' });
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Section title="Historial">
            <div className="grid gap-4">
              <AddStep applicationId={a.id} onAdded={() => void refresh()} />
              <Timeline
                events={events.data ?? []}
                onDelete={async (e) => {
                  const ok = await confirm({
                    title: '¿Borrar este paso del historial?',
                    description: `${labelOf(APPLICATION_EVENT_KINDS, e.kind)} del ${formatDateES(e.date)}.`,
                    confirmLabel: 'Borrar',
                    destructive: true,
                  });
                  if (!ok) return;
                  await api(`/job-applications/${a.id}/events/${e.id}`, { method: 'DELETE' });
                  await refresh();
                }}
              />
            </div>
          </Section>
          <Section title="Documentos">
            <p className="mb-3 text-sm text-muted-foreground">
              El CV, la carta de presentación y la prueba que enviaste.
            </p>
            <AttachmentsPanel entityType="job_application" entityId={a.id} />
          </Section>
        </div>
        <div className="grid content-start gap-6">
          <Section title="Oferta">
            <FieldGrid>
              <Field label="Puesto">
                <CommitInput
                  key={`title-${resetKey}`}
                  value={a.title}
                  onCommit={required('title')}
                />
              </Field>
              <Field label="Empresa">
                <CommitInput
                  key={`company-${resetKey}`}
                  value={a.company}
                  onCommit={required('company')}
                />
              </Field>
              <Field label="Tipo">
                <NativeSelect
                  value={a.kind}
                  onChange={(e) => void save({ kind: e.target.value as JobApplication['kind'] })}
                >
                  {APPLICATION_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Dónde la viste">
                <NativeSelect
                  value={a.source ?? ''}
                  onChange={(e) => void save({ source: e.target.value || null })}
                >
                  <option value="">—</option>
                  {[
                    ...APPLICATION_SOURCES,
                    ...(a.source && !APPLICATION_SOURCES.includes(a.source as never)
                      ? [a.source]
                      : []),
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Enlace a la oferta" className="sm:col-span-2">
                <CommitInput
                  value={a.url}
                  onCommit={(url) => void save({ url })}
                  placeholder="https://"
                />
              </Field>
              <Field label="Ubicación">
                <CommitInput value={a.location} onCommit={(location) => void save({ location })} />
              </Field>
              <Field label="Modalidad">
                <NativeSelect
                  value={a.workMode ?? ''}
                  onChange={(e) =>
                    void save({ workMode: (e.target.value || null) as JobApplication['workMode'] })
                  }
                >
                  <option value="">—</option>
                  {WORK_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Idioma de origen">
                <NativeSelect
                  value={a.sourceLang ?? ''}
                  onChange={(e) => void save({ sourceLang: e.target.value || null })}
                >
                  <option value="">—</option>
                  {langs(a.sourceLang).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Idioma de destino">
                <NativeSelect
                  value={a.targetLang ?? ''}
                  onChange={(e) => void save({ targetLang: e.target.value || null })}
                >
                  <option value="">—</option>
                  {langs(a.targetLang).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Persona de contacto">
                <CommitInput
                  value={a.contactName}
                  onCommit={(contactName) => void save({ contactName })}
                />
              </Field>
              <Field label="Correo de contacto">
                <CommitInput
                  type="email"
                  value={a.contactEmail}
                  onCommit={(contactEmail) => void save({ contactEmail })}
                />
              </Field>
            </FieldGrid>
          </Section>
          <Section title={a.kind === 'freelance' ? 'Tarifa' : 'Salario'}>
            <FieldGrid>
              {a.kind === 'freelance' ? (
                <>
                  <Field label="Tarifa ofrecida o acordada">
                    <DecimalInput
                      value={a.rateMicros}
                      onCommit={(rateMicros) => void save({ rateMicros })}
                      scale={1_000_000}
                      maxDecimals={6}
                      suffix={a.currency}
                      testId="application-rate"
                    />
                  </Field>
                  <Field label="Por">
                    <NativeSelect
                      value={a.rateUnit ?? ''}
                      onChange={(e) => void save({ rateUnit: e.target.value || null })}
                      data-testid="application-rate-unit"
                    >
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label.toLowerCase()}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Desde">
                    <DecimalInput
                      value={a.salaryMinCents}
                      onCommit={(salaryMinCents) => void save({ salaryMinCents })}
                      scale={100}
                      suffix={a.currency}
                    />
                  </Field>
                  <Field label="Hasta">
                    <DecimalInput
                      value={a.salaryMaxCents}
                      onCommit={(salaryMaxCents) => void save({ salaryMaxCents })}
                      scale={100}
                      suffix={a.currency}
                    />
                  </Field>
                  <Field label="Periodo">
                    <NativeSelect
                      value={a.salaryPeriod ?? ''}
                      onChange={(e) =>
                        void save({
                          salaryPeriod: (e.target.value || null) as JobApplication['salaryPeriod'],
                        })
                      }
                    >
                      <option value="">—</option>
                      {SALARY_PERIODS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </>
              )}
              <Field label="Moneda">
                <NativeSelect
                  value={a.currency}
                  onChange={(e) => void save({ currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FieldGrid>
          </Section>
          <Section title="Fechas">
            <FieldGrid>
              <Field label="Plazo para presentarse">
                <DateInput value={a.deadline} onCommit={(deadline) => void save({ deadline })} />
              </Field>
              <Field label="Solicitada el">
                <DateInput value={a.appliedAt} onCommit={(appliedAt) => void save({ appliedAt })} />
              </Field>
              <Field
                label="Seguimiento"
                hint="Ese día te avisamos si sigues sin respuesta. Se aplaza solo con cada paso."
              >
                <DateInput
                  value={a.followUpAt}
                  onCommit={(followUpAt) => void save({ followUpAt })}
                  testId="application-follow-up"
                />
              </Field>
            </FieldGrid>
          </Section>
          <Section title="Notas">
            <CommitInput
              key={a.id}
              value={a.notes}
              onCommit={(notes) => void save({ notes })}
              multiline
              rows={6}
              placeholder="Requisitos, impresiones de la entrevista, qué preguntar…"
            />
          </Section>
        </div>
      </div>
    </Page>
  );
}
