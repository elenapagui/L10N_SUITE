import { useEffect, useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Moon, Search, Sun, WifiOff } from 'lucide-react';
import { Kbd } from '@/components/ui/misc';
import { useAppInfo, useSettings, useUpdateSettings } from '@/hooks/core';
import { applyTheme, useThemeSync } from '@/hooks/theme';
import { desktop, modKey } from '@/lib/desktop';
import { CommandPalette } from './CommandPalette';
import { RecoveryScreen } from './RecoveryScreen';
import { Sidebar } from './Sidebar';
import { TimerWidget } from '@/features/work/time/TimerWidget';
import { TaskSheetProvider } from '@/features/work/tasks/TaskSheetContext';
import { useReminders } from '@/hooks/reminders';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('l10n-sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

function ThemeToggle() {
  const settings = useSettings();
  const update = useUpdateSettings('preferences');
  const isDark = document.documentElement.classList.contains('dark');
  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    update.mutate({ theme: next });
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!settings.data}
      className="cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={isDark ? 'Tema claro' : 'Tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function EngineBanner() {
  const [status, setStatus] = useState<'ready' | 'restarting' | 'failed'>('ready');
  useEffect(() => desktop?.onEngineStatus(setStatus), []);
  if (status === 'ready') return null;
  return (
    <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm">
      <WifiOff className="size-4" />
      {status === 'restarting'
        ? 'Reconectando con el motor de la aplicación…'
        : 'El motor de la aplicación no responde. Cierra y vuelve a abrir L10N Suite.'}
    </div>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const appInfo = useAppInfo();
  useThemeSync();
  useReminders();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    // En la app de escritorio, el menú «Archivo → Buscar o ir a…» captura el atajo y envía este evento.
    const onMenu = () => setPaletteOpen((o) => !o);
    window.addEventListener('keydown', onKey);
    window.addEventListener('l10n:command-palette', onMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('l10n:command-palette', onMenu);
    };
  }, []);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('l10n-sidebar', c ? 'expanded' : 'collapsed');
      } catch {
        // Preferencia no persistente.
      }
      return !c;
    });
  };

  if (appInfo.data?.integrity === 'error') return <RecoveryScreen />;

  return (
    <TaskSheetProvider>
      <div
        className="flex h-full overflow-hidden"
        data-app-ready={appInfo.data ? 'true' : undefined}
      >
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <EngineBanner />
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 w-full max-w-md cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"
              data-testid="open-command-palette"
            >
              <Search className="size-4" />
              <span>Buscar o ir a…</span>
              <Kbd className="ml-auto">{modKey} K</Kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <TimerWidget />
              <ThemeToggle />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </TaskSheetProvider>
  );
}
