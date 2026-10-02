import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleDashed, House } from 'lucide-react';
import { formatDateTimeES, type ActivityEntry } from '@l10n/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings, useTags } from '@/hooks/core';
import { useBackups } from '@/features/settings/BackupsPanel';
import { api } from '@/lib/api';

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 14) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function todayLabel(date: Date): string {
  const s = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Step({
  done,
  children,
  to,
  search,
}: {
  done: boolean;
  children: React.ReactNode;
  to: string;
  search?: object;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
    >
      {done ? (
        <CircleCheck className="size-4 text-success" />
      ) : (
        <CircleDashed className="size-4 text-muted-foreground" />
      )}
      <span className={done ? 'text-muted-foreground line-through' : ''}>{children}</span>
    </Link>
  );
}

const ROADMAP = [
  { phase: 0, title: 'Base técnica', done: true },
  { phase: 1, title: 'Proyectos y tareas', done: false },
  { phase: 2, title: 'Finanzas', done: false },
  { phase: 3, title: 'Páginas y tablas', done: false },
  { phase: 4, title: 'Corpus', done: false },
  { phase: 5, title: 'Académico', done: false },
];

export function HomePage() {
  const now = new Date();
  const settings = useSettings();
  const tags = useTags();
  const backups = useBackups();
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<ActivityEntry[]>('/activity', { query: { limit: 8 } }),
  });
  const name = settings.data?.profile.displayName;

  return (
    <Page>
      <PageHeader
        icon={<House />}
        title={`${greeting(now)}${name ? `, ${name}` : ''}`}
        description={todayLabel(now)}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>Deja la aplicación lista para trabajar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            <Step
              done={Boolean(settings.data?.profile.businessName)}
              to="/ajustes"
              search={{ tab: 'perfil' }}
            >
              Completa tus datos profesionales
            </Step>
            <Step
              done={Boolean(settings.data?.backups.directory)}
              to="/ajustes"
              search={{ tab: 'copias' }}
            >
              Elige una carpeta en la nube para las copias de seguridad
            </Step>
            <Step done={(tags.data?.length ?? 0) > 0} to="/ajustes" search={{ tab: 'etiquetas' }}>
              Crea tus primeras etiquetas
            </Step>
            <Step
              done={(backups.data?.items.length ?? 0) > 0}
              to="/ajustes"
              search={{ tab: 'copias' }}
            >
              Comprueba que se ha hecho la primera copia de seguridad
            </Step>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hoja de ruta</CardTitle>
            <CardDescription>Cada fase llega probada y lista para usar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {ROADMAP.map((r) => (
              <div key={r.phase} className="flex items-center gap-3 text-sm">
                {r.done ? (
                  <CircleCheck className="size-4 text-success" />
                ) : (
                  <CircleDashed className="size-4 text-muted-foreground" />
                )}
                <span className="w-14 text-muted-foreground">Fase {r.phase}</span>
                <span>{r.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {(activity.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Aquí verás los últimos cambios.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {activity.data?.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="w-36 shrink-0 text-muted-foreground">
                      {formatDateTimeES(a.createdAt)}
                    </span>
                    <span>{a.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
