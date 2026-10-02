import { useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import {
  CORPUS_TEXT_TYPES,
  TRANSLATION_DIRECTIONS,
  type AnnotationTag,
  type CorpusFilters,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAnnotationTags, useCorpusProfiles } from './hooks';

function toggle(list: string[] | undefined, v: string): string[] | undefined {
  const s = new Set(list ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return s.size ? [...s] : undefined;
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value?: string[];
  onChange: (v: string[] | undefined) => void;
}) {
  if (!options.length) return <p className="text-xs text-muted-foreground">Sin datos.</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value?.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
            )}
            onClick={() => onChange(toggle(value, o.value))}
            aria-pressed={on}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TagTree({
  tags,
  value,
  onToggle,
}: {
  tags: AnnotationTag[];
  value?: string[];
  onToggle: (id: string) => void;
}) {
  const render = (parentId: string | null, depth: number): React.ReactNode =>
    tags
      .filter((t) => t.parentId === parentId)
      .map((t) => (
        <div key={t.id}>
          <label
            className="flex items-center gap-2 py-0.5 text-sm"
            style={{ paddingLeft: depth * 14 }}
          >
            <Checkbox
              checked={value?.includes(t.id) ?? false}
              onCheckedChange={() => onToggle(t.id)}
            />
            <span className="size-2 rounded-full" style={{ background: t.color }} />
            <span className="truncate">{t.name}</span>
            {t.count > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">{t.count}</span>
            )}
          </label>
          {render(t.id, depth + 1)}
        </div>
      ));
  return <div className="max-h-56 overflow-y-auto">{render(null, 0)}</div>;
}

export function countFilters(f: CorpusFilters): number {
  return Object.entries(f).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v != null && v !== '' && v !== false,
  ).length;
}

/** Filtros de subcorpus: juegos, géneros, plataformas, años, tipos de texto, dirección, hablante y etiquetas. */
export function FiltersPanel({
  value,
  onChange,
}: {
  value: CorpusFilters;
  onChange: (f: CorpusFilters) => void;
}) {
  const profiles = useCorpusProfiles();
  const tags = useAnnotationTags();
  const set = (patch: Partial<CorpusFilters>) => onChange({ ...value, ...patch });
  const genres = useMemo(
    () =>
      [...new Set((profiles.data ?? []).flatMap((p) => p.genres))]
        .sort()
        .map((g) => ({ value: g, label: g })),
    [profiles.data],
  );
  const platforms = useMemo(
    () =>
      [...new Set((profiles.data ?? []).flatMap((p) => p.platforms))]
        .sort()
        .map((g) => ({ value: g, label: g })),
    [profiles.data],
  );
  const n = countFilters(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={n ? 'secondary' : 'outline'} size="sm" data-testid="corpus-filters">
          <Filter /> Filtros{n ? ` (${n})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[40rem] max-w-[95vw]" align="start">
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          <section className="grid content-start gap-1.5">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">Juegos</h4>
            <div className="max-h-40 overflow-y-auto">
              {(profiles.data ?? []).map((p) => (
                <label key={p.gameId} className="flex items-center gap-2 py-0.5 text-sm">
                  <Checkbox
                    checked={value.gameIds?.includes(p.gameId) ?? false}
                    onCheckedChange={() => set({ gameIds: toggle(value.gameIds, p.gameId) })}
                  />
                  <span className="truncate">{p.gameTitle}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.segmentCount}</span>
                </label>
              ))}
              {!profiles.data?.length && (
                <p className="text-xs text-muted-foreground">Aún no hay juegos en el corpus.</p>
              )}
            </div>
          </section>
          <section className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <h4 className="text-xs font-medium uppercase text-muted-foreground">Tipo de texto</h4>
              <Chips
                options={CORPUS_TEXT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                value={value.textTypes}
                onChange={(textTypes) => set({ textTypes })}
              />
            </div>
            <div className="grid gap-1.5">
              <h4 className="text-xs font-medium uppercase text-muted-foreground">
                Dirección de traducción
              </h4>
              <Chips
                options={TRANSLATION_DIRECTIONS.map((t) => ({ value: t.value, label: t.label }))}
                value={value.directions}
                onChange={(directions) => set({ directions })}
              />
            </div>
          </section>
          <section className="grid content-start gap-1.5">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">Género</h4>
            <Chips options={genres} value={value.genres} onChange={(g) => set({ genres: g })} />
            <h4 className="mt-2 text-xs font-medium uppercase text-muted-foreground">Plataforma</h4>
            <Chips
              options={platforms}
              value={value.platforms}
              onChange={(p) => set({ platforms: p })}
            />
          </section>
          <section className="grid content-start gap-2">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">
              Año de lanzamiento
            </h4>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-24"
                inputMode="numeric"
                placeholder="Desde"
                value={value.yearFrom ?? ''}
                onChange={(e) =>
                  set({ yearFrom: e.target.value ? Number(e.target.value) || null : null })
                }
              />
              –
              <Input
                className="h-8 w-24"
                inputMode="numeric"
                placeholder="Hasta"
                value={value.yearTo ?? ''}
                onChange={(e) =>
                  set({ yearTo: e.target.value ? Number(e.target.value) || null : null })
                }
              />
            </div>
            <h4 className="mt-1 text-xs font-medium uppercase text-muted-foreground">Hablante</h4>
            <Input
              className="h-8"
              placeholder="Contiene…"
              value={value.speaker ?? ''}
              onChange={(e) => set({ speaker: e.target.value || undefined })}
            />
            <label className="mt-1 flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.includeRestricted ?? false}
                onCheckedChange={(v) => set({ includeRestricted: v === true || undefined })}
              />
              Incluir el material de uso restringido
            </label>
          </section>
          <section className="grid content-start gap-1.5 sm:col-span-2">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">
              Con anotaciones de
            </h4>
            <TagTree
              tags={tags.data ?? []}
              value={value.tagIds}
              onToggle={(id) => set({ tagIds: toggle(value.tagIds, id) })}
            />
          </section>
        </div>
        {n > 0 && (
          <div className="mt-3 flex border-t pt-3">
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange({})}>
              <X /> Quitar los filtros
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
