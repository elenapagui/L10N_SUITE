import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { HomePage } from '@/features/home/HomePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TrashPage } from '@/features/trash/TrashPage';
import { ALL_NAV_ITEMS, AVAILABLE_PHASE } from '@/lib/navigation';
import { NotFound, RouteError } from '@/components/layout/RouteError';

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ajustes',
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === 'string' ? { tab: search.tab } : {},
  component: SettingsPage,
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/papelera',
  component: TrashPage,
});

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

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute, trashRoute, ...pendingRoutes]);

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
