import { useQueryClient } from '@tanstack/react-query';
import { Download, Languages, Play } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, type MorphStatus } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMorphStatus } from './hooks';

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const mb = (bytes: number) => `${formatNumber(bytes / 1_048_576, 0)} MB`;

/**
 * Análisis morfológico del coreano (Kiwi): descarga del analizador y progreso del análisis.
 * Con él se puede buscar por lema en el concordanciador y contar lemas.
 */
export function MorphPanel() {
  const q = useMorphStatus();
  const qc = useQueryClient();
  const s = q.data;
  if (!s) return null;
  const post = async (url: string) => {
    try {
      qc.setQueryData(['corpus-morph'], await api<MorphStatus>(url, { method: 'POST' }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se ha podido completar.');
    }
  };
  const pending = s.total - s.analyzed;
  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4" data-testid="morph-panel">
      <div className="flex flex-wrap items-start gap-3">
        <Languages className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Análisis morfológico del coreano</h2>
          <p className="text-sm text-muted-foreground">
            Separa partículas y terminaciones (마법사 + 가, 먹 + 었 + 다) para buscar por lema en el
            concordanciador (먹다 encuentra 먹었다, 먹고…) y contar lemas. Usa el analizador libre
            Kiwi (versión {s.version}), que funciona sin conexión.
          </p>
        </div>
        {!s.installed && !s.downloading && (
          <Button onClick={() => void post('/corpus/morph/download')} data-testid="morph-download">
            <Download /> Descargar el analizador (unos 90 MB)
          </Button>
        )}
        {s.installed && !s.analyzing && pending > 0 && (
          <Button variant="outline" onClick={() => void post('/corpus/morph/analyze')}>
            <Play /> Analizar {formatNumber(pending, 0)} segmentos pendientes
          </Button>
        )}
      </div>
      {s.downloading && (
        <div className="grid gap-1 text-sm">
          <span>
            Descargando… {mb(s.downloading.received)}
            {s.downloading.total ? ` de ${mb(s.downloading.total)}` : ''}
          </span>
          <Bar
            value={s.downloading.received}
            max={s.downloading.total ?? s.downloading.received * 2}
          />
        </div>
      )}
      {s.installed && (
        <div className="grid gap-1 text-sm">
          <span>
            {s.analyzing
              ? `Analizando… ${formatNumber(s.analyzed, 0)} de ${formatNumber(s.total, 0)} segmentos`
              : s.total === 0
                ? 'Aún no hay textos en coreano en el corpus.'
                : `${formatNumber(s.analyzed, 0)} de ${formatNumber(s.total, 0)} segmentos en coreano analizados.`}
          </span>
          {s.total > 0 && <Bar value={s.analyzed} max={s.total} />}
        </div>
      )}
      {s.error && <p className="text-sm text-destructive">{s.error}</p>}
    </section>
  );
}
