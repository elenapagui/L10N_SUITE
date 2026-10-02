import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { normalizeForSearch } from '@l10n/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string | null;
  color?: string | null;
}

/**
 * Selector con búsqueda (cliente, juego, proyecto, encargo…).
 * `onCreate` añade la opción «Crear …» con el texto escrito.
 */
export function EntitySelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  emptyLabel = 'Ninguno',
  allowEmpty = true,
  onCreate,
  className,
  disabled,
  id,
  testId,
}: {
  options: SelectOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  onCreate?: (text: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    return q
      ? options.filter((o) => normalizeForSearch(`${o.label} ${o.hint ?? ''}`).includes(q))
      : options;
  }, [options, query]);

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {selected?.color && (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          {selected && allowEmpty && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Quitar"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command shouldFilter={false} loop>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar…"
            className="h-9 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            {allowEmpty && !query && (
              <Command.Item
                value="__vacio__"
                onSelect={() => pick(null)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground aria-selected:bg-accent"
              >
                {emptyLabel}
              </Command.Item>
            )}
            {filtered.map((o) => (
              <Command.Item
                key={o.value}
                value={o.value}
                onSelect={() => pick(o.value)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-accent"
              >
                {o.color && (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: o.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{o.hint}</span>
                )}
                {o.value === value && <Check className="size-4 shrink-0" />}
              </Command.Item>
            ))}
            {filtered.length === 0 && !onCreate && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            )}
            {onCreate && query.trim() && (
              <Command.Item
                value="__crear__"
                onSelect={() => {
                  onCreate(query.trim());
                  setOpen(false);
                  setQuery('');
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-primary aria-selected:bg-accent"
              >
                <Plus className="size-4" /> Crear «{query.trim()}»
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
