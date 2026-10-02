import { Construction } from 'lucide-react';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { Page, PageHeader, EmptyState } from './PageHeader';

const PHASE_NAMES: Record<number, string> = {
  1: 'Fase 1 · Proyectos y tareas',
  2: 'Fase 2 · Finanzas',
  3: 'Fase 3 · Páginas y tablas',
  4: 'Fase 4 · Corpus',
  5: 'Fase 5 · Académico',
};

/** Sección prevista en la hoja de ruta que aún no está construida. */
export function ComingSoon({ path }: { path: string }) {
  const item = ALL_NAV_ITEMS.find((i) => i.to === path);
  const Icon = item?.icon ?? Construction;
  return (
    <Page>
      <PageHeader title={item?.label ?? 'En construcción'} icon={<Icon />} />
      <EmptyState
        icon={<Construction />}
        title="Esta sección está en construcción"
        description={
          item?.phase
            ? `Llegará en la ${PHASE_NAMES[item.phase] ?? `fase ${item.phase}`} de la hoja de ruta.`
            : 'Llegará en una próxima versión.'
        }
      />
    </Page>
  );
}
