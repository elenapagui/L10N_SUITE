import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { NotFound, RouteError } from '@/components/layout/RouteError';
import { JournalsPage } from '@/features/academic/JournalsPage';
import { LibraryPage } from '@/features/academic/LibraryPage';
import { PublicationDetailPage } from '@/features/academic/PublicationDetailPage';
import { PublicationsPage } from '@/features/academic/PublicationsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { ConcordancerPage } from '@/features/corpus/ConcordancerPage';
import { CorpusGamePage } from '@/features/corpus/CorpusGamePage';
import { CorpusPage } from '@/features/corpus/CorpusPage';
import { DocumentPage } from '@/features/corpus/DocumentPage';
import { ExpensesPage } from '@/features/finance/ExpensesPage';
import { InvoicesPage } from '@/features/finance/InvoicesPage';
import { ReportsPage } from '@/features/finance/ReportsPage';
import { HomePage } from '@/features/home/HomePage';
import { PageViewPage, PagesHomePage } from '@/features/pages/PagesPage';
import { ResourceRedirect } from '@/features/resources/ResourceRedirect';
import { TablePage, TablesPage } from '@/features/tables/TablesPage';
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
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
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
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
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

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/finanzas/facturas',
  validateSearch: (search: Record<string, unknown>): { factura?: string } =>
    typeof search.factura === 'string' ? { factura: search.factura } : {},
  component: InvoicesPage,
});
const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/finanzas/gastos',
  component: ExpensesPage,
});
const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/finanzas/informes',
  component: ReportsPage,
});

const pagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/paginas',
  component: PagesHomePage,
});
const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/paginas/$pageId',
  component: PageViewPage,
});
const tablesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tablas',
  component: TablesPage,
});
const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tablas/$tableId',
  component: TablePage,
});
const resourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recursos/$kind/$id',
  component: ResourceRedirect,
});

const corpusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/corpus',
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  component: CorpusPage,
});
const corpusGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/corpus/juegos/$gameId',
  component: CorpusGamePage,
});
const corpusDocumentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/corpus/documentos/$documentId',
  validateSearch: (search: Record<string, unknown>): { pos?: number } => {
    const pos = Number(search.pos);
    return Number.isInteger(pos) && pos > 0 ? { pos } : {};
  },
  component: DocumentPage,
});
const concordanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/corpus/concordancias',
  component: ConcordancerPage,
});
const publicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academico/publicaciones',
  component: PublicationsPage,
});
const publicationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academico/publicaciones/$publicationId',
  component: PublicationDetailPage,
});
const journalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academico/revistas',
  component: JournalsPage,
});
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/academico/biblioteca',
  validateSearch: (search: Record<string, unknown>): { ref?: string } =>
    typeof search.ref === 'string' ? { ref: search.ref } : {},
  component: LibraryPage,
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
  invoicesRoute,
  expensesRoute,
  reportsRoute,
  pagesRoute,
  pageRoute,
  tablesRoute,
  tableRoute,
  resourceRoute,
  corpusRoute,
  corpusGameRoute,
  corpusDocumentRoute,
  concordanceRoute,
  publicationsRoute,
  publicationRoute,
  journalsRoute,
  libraryRoute,
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
