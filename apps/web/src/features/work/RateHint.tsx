import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { SERVICES, UNITS, formatRate, labelOf, pairLabel, type Rate } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export interface ResolvedRate {
  rate: Rate | null;
  source: 'client' | 'general' | null;
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
  if (!rate)
    return (
      <p
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="rate-hint"
      >
        <Info className="size-3.5 shrink-0" />
        Sin tarifa para este servicio.
        {clientId && (
          <Link
            to="/trabajo/clientes/$clientId"
            params={{ clientId }}
            search={{ tab: 'tarifas' }}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Añadir tarifas del cliente
          </Link>
        )}
      </p>
    );
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
