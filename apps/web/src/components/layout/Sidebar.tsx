import { Link, useRouterState } from '@tanstack/react-router';
import { PanelLeft } from 'lucide-react';
import {
  ALL_NAV_ITEMS,
  NAV_FOOTER,
  NAV_SECTIONS,
  AVAILABLE_PHASE,
  type NavItem,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/misc';

function matches(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Solo se marca la entrada más específica («Concordancias» y no también «Corpus»). */
function isActive(pathname: string, to: string): boolean {
  if (!matches(pathname, to)) return false;
  return !ALL_NAV_ITEMS.some((i) => i.to.length > to.length && matches(pathname, i.to));
}

function NavLink({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}) {
  const active = isActive(pathname, item.to);
  const pending = item.phase !== undefined && item.phase > AVAILABLE_PHASE;
  const link = (
    <Link
      to={item.to as never}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-sidebar-foreground hover:bg-accent/60 hover:text-foreground',
        collapsed && 'justify-center px-0',
      )}
      data-testid={`nav-${item.to}`}
    >
      <item.icon
        className={cn(
          'size-4 shrink-0',
          !active && 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {pending && (
            <span
              className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground"
              title="En construcción"
            >
              F{item.phase}
            </span>
          )}
        </>
      )}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-12 items-center gap-2 border-b px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2">
            <img src="./icon.svg" alt="" className="size-7" />
            <span className="truncate text-sm font-semibold">L10N Suite</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground',
            !collapsed && 'ml-auto',
          )}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label ?? i} className="mb-3">
            {section.label && !collapsed && (
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {section.label}
              </div>
            )}
            {section.label && collapsed && <div className="mx-2 mb-2 border-t" />}
            <div className="grid gap-0.5">
              {section.items.map((item) => (
                <NavLink key={item.to} item={item} collapsed={collapsed} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="grid gap-0.5 border-t px-2 py-2">
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} pathname={pathname} />
        ))}
      </div>
    </aside>
  );
}
