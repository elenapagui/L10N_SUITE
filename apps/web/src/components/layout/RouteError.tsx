import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Page } from './PageHeader';

export function NotFound() {
  return (
    <Page>
      <EmptyState
        title="Esta página no existe"
        action={
          <Button asChild variant="outline">
            <Link to="/">Volver al inicio</Link>
          </Button>
        }
      />
    </Page>
  );
}

/** Error inesperado en una pantalla: se muestra con la opción de copiar el informe. */
export function RouteError({ error, reset }: { error: unknown; reset?: () => void }) {
  const [copied, setCopied] = useState(false);
  const err = error instanceof Error ? error : new Error(String(error));
  const report = `L10N Suite — informe de error\n${new Date().toISOString()}\n${location.hash}\n\n${err.name}: ${err.message}\n${err.stack ?? ''}`;
  return (
    <Page>
      <EmptyState
        icon={<TriangleAlert className="text-destructive" />}
        title="Algo ha fallado en esta pantalla"
        description={`${err.message}. Tus datos no se han perdido: puedes reintentarlo o volver al inicio.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {reset && (
              <Button variant="outline" onClick={reset}>
                Reintentar
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(report).then(() => setCopied(true));
              }}
            >
              {copied ? 'Informe copiado' : 'Copiar informe de error'}
            </Button>
            <Button asChild>
              <Link to="/">Ir al inicio</Link>
            </Button>
          </div>
        }
      />
    </Page>
  );
}
