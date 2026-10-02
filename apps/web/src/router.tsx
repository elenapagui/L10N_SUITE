import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { NotFound, RouteError } from '@/components/layout/RouteError';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { HomePage } from '@/features/home/HomePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TrashPage } from '@/features/trash/TrashPage';
import { ClientDetailPage } from '@/features/work/ClientDetailPage';
import { ClientsPage } from '@/features/work/ClientsPage';
import { GameDetailPage, GamesPage } from '@/features/work/GamesPage';
import { JobDetailPage } from '@/features/work/JobDetailPage';
import { JobsPage } from '@/features/work/JobsPage';
import { ProjectDetailPage } from '@/features/work/ProjectDetailPage';
import { ProjectsPage } from '@/features/work/ProjectsPage';
import { QueriesPage } from '@/features/work/QueriesPage';
import { TasksPage } from '@/features/work/tasks/TasksPage';
import { TimePage } from '@/features/work/time/TimePage';
import { ALL_NAV_ITEMS, AVAILABLE_PHASE } from '@/lib/navigation';

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/papelera',
  component: TrashPage,
});
const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/clientes',
  component: ClientsPage,
});
const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/clientes/$clientId',
  component: ClientDetailPage,
});
const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/juegos',
  component: GamesPage,
});
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/juegos/$gameId',
  component: GameDetailPage,
});
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/proyectos',
  component: ProjectsPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/proyectos/$projectId',
  component: ProjectDetailPage,
});
const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/encargos',
  component: JobsPage,
});
const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/encargos/$jobId',
  component: JobDetailPage,
});
const timeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/tiempo',
  component: TimePage,
});
const queriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/consultas',
  component: QueriesPage,
});
const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendario',
  component: CalendarPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ajustes',
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  component: SettingsPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trabajo/tareas',
  validateSearch: (search: Record<string, unknown>): { tarea?: string } =>
    typeof search.tarea === 'string' ? { tarea: search.tarea } : {},
  component: TasksPage,
});

const routes = [
  homeRoute,
  settingsRoute,
  trashRoute,
  clientsRoute,
  clientRoute,
  gamesRoute,
  gameRoute,
  projectsRoute,
  projectRoute,
  jobsRoute,
  jobRoute,
  timeRoute,
  queriesRoute,
  calendarRoute,
  tasksRoute,
];

/** Secciones de fases futuras: se muestran como «en construcción». */
const pendingRoutes = ALL_NAV_ITEMS.filter(
  (i) => i.phase !== undefined && i.phase > AVAILABLE_PHASE,
).map((item) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: item.to,
    component: () => <ComingSoon path={item.to} />,
  }),
);

const routeTree = rootRoute.addChildren([...routes, ...pendingRoutes]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
