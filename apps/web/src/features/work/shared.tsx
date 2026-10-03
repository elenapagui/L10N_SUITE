import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiMutation } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Guarda cambios parciales de una ficha. Con `cacheKey`, el cambio se aplica antes en la caché:
 * así dos ediciones seguidas (por ejemplo, dos bandas del análisis) no se pisan mientras la
 * primera aún se está guardando.
 */
export function usePatch<T = unknown>(
  url: string,
  cacheKey?: QueryKey,
  apply: (old: T, patch: Record<string, unknown>) => T = (old, patch) => ({ ...old, ...patch }),
) {
  const qc = useQueryClient();
  return useApiMutation(
    (patch: Record<string, unknown>) => api<T>(url, { method: 'PATCH', body: patch }),
    {
      onMutate: cacheKey
        ? async (patch) => {
            await qc.cancelQueries({ queryKey: cacheKey });
            qc.setQueryData<T>(cacheKey, (old) => (old ? apply(old, patch) : old));
          }
        : undefined,
    },
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to as never}
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" /> {label}
    </Link>
  );
}

export function Section({
  title,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'danger' | 'warning' | 'success';
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warning' && 'text-amber-600 dark:text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Rejilla de etiqueta + valor para las fichas. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
