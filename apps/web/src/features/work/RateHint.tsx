import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { SERVICES, UNITS, formatRate, labelOf, pairLabel, type Rate } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export interface ResolvedRate {
  rate: Rate | null;
  source: 'client' | 'general' | null;
  context?: {
    clientId: string | null;
    clientName: string | null;
    sourceLang: string | null;
    targetLang: string | null;
    service: string;
    unit: string | null;
  };
  /** Si no hay tarifa: las que hay y por qué no encajan. */
  candidates?: { rate: Rate; reasons: string[] }[];
  notes?: string[];
}

/** Tarifa vigente para un proyecto y un servicio (y, si se indica, una unidad). */
export function useResolvedRate(
  projectId: string | null | undefined,
  service: string,
  unit?: string | null,
) {
  return useQuery({
    queryKey: ['rate-resolve', projectId, service, unit ?? null],
    queryFn: () =>
      api<ResolvedRate>('/rates/resolve', {
        query: { projectId: projectId ?? undefined, service, unit: unit ?? undefined },
      }),
    enabled: Boolean(projectId),
  });
}

function unitLabel(unit: string) {
  return labelOf(UNITS, unit).toLowerCase();
}

/**
 * Explica de dónde sale la tarifa del encargo: la del cliente, la general o ninguna.
 * Si la tarifa actual no es la vigente, ofrece aplicarla.
 */
export function RateHint({
  resolved,
  clientId,
  currentMicros,
  currentCurrency,
  onApply,
}: {
  resolved: ResolvedRate | undefined;
  clientId: string | null | undefined;
  currentMicros?: number | null;
  currentCurrency?: string;
  onApply?: (rate: Rate) => void;
}) {
  if (!resolved) return null;
  const { rate, source } = resolved;
  if (!rate) {
    const ctx = resolved.context;
    const what = ctx
      ? `${labelOf(SERVICES, ctx.service).toLowerCase()}${
          ctx.sourceLang || ctx.targetLang ? ` ${pairLabel(ctx.sourceLang, ctx.targetLang)}` : ''
        }${ctx.unit ? ` por ${unitLabel(ctx.unit)}` : ''}`
      : 'este servicio';
    const owner = ctx?.clientName ? ` de ${ctx.clientName}` : '';
    const candidates = resolved.candidates ?? [];
    return (
      <div
        className="grid gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
        data-testid="rate-hint"
      >
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Info className="size-3.5 shrink-0 text-amber-600" />
          Sin tarifa{owner} para {what}.
        </p>
        {(resolved.notes ?? []).map((n) => (
          <p key={n}>{n}</p>
        ))}
        {candidates.length > 0 && (
          <ul className="grid gap-1">
            {candidates.map(({ rate: c, reasons }) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
                data-testid="rate-candidate"
              >
                <span>
                  Hay una tarifa {c.clientId ? `de ${c.clientName}` : 'general'} de{' '}
                  {labelOf(SERVICES, c.service).toLowerCase()}
                  {c.sourceLang || c.targetLang
                    ? ` ${pairLabel(c.sourceLang, c.targetLang)}`
                    : ''}{' '}
                  (
                  {c.unit === 'flat'
                    ? formatRate(c.rateMicros, c.currency)
                    : `${formatRate(c.rateMicros, c.currency)}/${unitLabel(c.unit)}`}
                  ), pero {reasons.join(' y ')}.
                </span>
                {onApply && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => onApply(c)}
                  >
                    Usar esta tarifa
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {(clientId ?? ctx?.clientId) && (
          <Link
            to="/trabajo/clientes/$clientId"
            params={{ clientId: (clientId ?? ctx?.clientId)! }}
            search={{ tab: 'tarifas' }}
            className="w-fit underline underline-offset-2 hover:text-foreground"
          >
            Ver o añadir tarifas del cliente
          </Link>
        )}
      </div>
    );
  }
  const who = source === 'client' ? `Tarifa de ${rate.clientName}` : 'Tarifa general';
  const pair =
    rate.sourceLang || rate.targetLang ? ` ${pairLabel(rate.sourceLang, rate.targetLang)}` : '';
  const value =
    rate.unit === 'flat'
      ? `${formatRate(rate.rateMicros, rate.currency)} (tarifa plana)`
      : `${formatRate(rate.rateMicros, rate.currency)}/${unitLabel(rate.unit)}`;
  const matches =
    currentMicros === undefined ||
    (currentMicros === rate.rateMicros && (!currentCurrency || currentCurrency === rate.currency));
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      data-testid="rate-hint"
    >
      {matches ? (
        <Check className="size-3.5 shrink-0 text-success" />
      ) : (
        <Info className="size-3.5 shrink-0" />
      )}
      <span>
        {who} para {labelOf(SERVICES, rate.service).toLowerCase()}
        {pair}: <span className="font-medium text-foreground">{value}</span>
        {!matches && ' · este encargo tiene otra tarifa'}
      </span>
      {!matches && onApply && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => onApply(rate)}
          data-testid="apply-rate"
        >
          Aplicar {formatRate(rate.rateMicros, rate.currency)}
        </Button>
      )}
    </div>
  );
}
