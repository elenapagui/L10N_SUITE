import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, HardDrive, Moon, Search, Sun } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { toast } from 'sonner';
import { entityLabel, normalizeForSearch, type SearchResult } from '@l10n/shared';
import { api } from '@/lib/api';
import { entityRoute, openAttachment } from '@/lib/entities';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { useSettings, useUpdateSettings } from '@/hooks/core';
import { applyTheme } from '@/hooks/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 150);
  const settings = useSettings();
  const updatePrefs = useUpdateSettings('preferences');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) =>
      api<SearchResult[]>('/search', { query: { q: debounced, limit: 20 }, signal }),
    enabled: open && debounced.length > 0,
    placeholderData: (prev) => prev,
  });

  const navItems = useMemo(() => {
    const q = normalizeForSearch(query);
    return ALL_NAV_ITEMS.filter(
      (i) => q === '' || normalizeForSearch(`${i.label} ${i.keywords ?? ''}`).includes(q),
    );
  }, [query]);

  const close = () => onOpenChange(false);

  const goTo = (to: string, search?: Record<string, string>) => {
    close();
    void navigate({ to: to as never, search: search as never });
  };

  const openResult = async (r: SearchResult) => {
    if (r.entityType === 'attachment') {
      close();
      try {
        await openAttachment(r.entityId);
      } catch (error) {
        toast.error((error as Error).message);
      }
      return;
    }
    const route = entityRoute(r.entityType, r.entityId);
    goTo(route.to, route.search);
  };

  const setTheme = (theme: 'light' | 'dark') => {
    applyTheme(theme);
    updatePrefs.mutate({ theme });
    close();
  };

  const isDark = settings.data?.preferences.theme === 'dark';

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Búsqueda global</D.Title>
          <Command shouldFilter={false} label="Búsqueda global" loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Busca fichas o escribe a dónde quieres ir…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                data-testid="command-input"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                {results.isFetching ? 'Buscando…' : 'No hay resultados.'}
              </Command.Empty>
              {debounced.length > 0 && (results.data?.length ?? 0) > 0 && (
                <Command.Group
                  heading="Resultados"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {results.data?.map((r) => (
                    <Command.Item
                      key={`${r.entityType}:${r.entityId}`}
                      value={`${r.entityType}:${r.entityId}`}
                      onSelect={() => void openResult(r)}
                      className={itemClass}
                    >
                      <span className="truncate">{r.title}</span>
                      {r.subtitle && (
                        <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>
                      )}
                      <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {entityLabel(r.entityType)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {navItems.length > 0 && (
                <Command.Group
                  heading="Ir a"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {navItems.map((item) => (
                    <Command.Item
                      key={item.to}
                      value={`nav:${item.to}`}
                      onSelect={() => goTo(item.to)}
                      className={itemClass}
                    >
                      <item.icon />
                      {item.label}
                      <ArrowRight className="ml-auto" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group
                heading="Acciones"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value="accion:copia"
                  onSelect={() => goTo('/ajustes', { tab: 'copias' })}
                  className={itemClass}
                >
                  <HardDrive />
                  Copias de seguridad
                </Command.Item>
                <Command.Item
                  value="accion:tema"
                  onSelect={() => setTheme(isDark ? 'light' : 'dark')}
                  className={itemClass}
                >
                  {isDark ? <Sun /> : <Moon />}
                  {isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
