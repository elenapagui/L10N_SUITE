import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Series de un gráfico: el color sigue a la serie (posición fija de la paleta), nunca al orden. */
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

const axisNumber = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0,
  useGrouping: 'always',
});

/** Marcas «redondas»: 1, 2 o 5 × 10^n, unas 4 líneas de referencia. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step)
    ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/** Barra con el extremo de dato redondeado (4 px) y la base recta, anclada a la línea de cero. */
function barPath(x: number, w: number, y0: number, y1: number, r = 4): string {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-label="Leyenda"
    >
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Marco común: título, leyenda y conmutador entre gráfico y tabla (accesible y copiable). */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  children,
  testId,
}: {
  title: string;
  description?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-lg border bg-card p-4" data-testid={testId}>
      <header className="mb-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {legend}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          aria-label={asTable ? 'Ver gráfico' : 'Ver como tabla'}
          title={asTable ? 'Ver gráfico' : 'Ver como tabla'}
        >
          {asTable ? <BarChart3 /> : <Table2 />}
        </Button>
      </header>
      {asTable ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  );
}

/**
 * Barras agrupadas verticales (p. ej., facturado y gastos por mes) con un único eje,
 * rejilla discreta y tooltip por grupo.
 */
export function GroupedBarChart<T extends { label: string }>({
  data,
  series,
  value,
  format,
  height = 240,
  ariaLabel,
}: {
  data: T[];
  series: ChartSeries[];
  value: (row: T, key: string) => number;
  format: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 8, right: 8, bottom: 24, left: 56 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const values = data.flatMap((d) => series.map((s) => value(d, s.key)));
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const y = (v: number) => margin.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const band = innerW / Math.max(1, data.length);
  const groupW = Math.min(band * 0.7, 18 * series.length + 2 * (series.length - 1));
  const gap = 2;
  const barW = (groupW - gap * (series.length - 1)) / series.length;

  useEffect(() => setHover(null), [data]);

  const hovered = hover != null ? data[hover] : null;
  const tipLeft = hover != null ? margin.left + band * hover + band / 2 : 0;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block select-none"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={margin.left + innerW}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--chart-grid)"
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text
              x={margin.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {axisNumber.format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = margin.left + band * i + (band - groupW) / 2;
          return (
            <g key={d.label}>
              {hover === i && (
                <rect
                  x={margin.left + band * i}
                  y={margin.top}
                  width={band}
                  height={innerH}
                  className="fill-muted"
                  opacity={0.6}
                />
              )}
              {series.map((s, j) => (
                <path
                  key={s.key}
                  d={barPath(gx + j * (barW + gap), barW, y(0), y(value(d, s.key)))}
                  fill={s.color}
                />
              ))}
              <text
                x={margin.left + band * i + band / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {d.label}
              </text>
              {/* Zona sensible más grande que la marca. */}
              <rect
                x={margin.left + band * i}
                y={margin.top}
                width={band}
                height={innerH + margin.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(value(d, s.key))}`).join(', ')}`}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(tipLeft, 80), width - 80),
            transform: 'translateX(-50%)',
          }}
          role="status"
        >
          <div className="mb-1 font-medium text-foreground">{hovered.label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto pl-3 tabular-nums text-foreground">
                {format(value(hovered, s.key))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barras horizontales de una sola serie (desgloses). Las etiquetas y los valores van en
 * tinta de texto; la barra solo codifica la magnitud.
 */
export function HBarList({
  rows,
  format,
  color = 'var(--chart-1)',
  empty = 'Sin datos en este periodo.',
  max: maxRows = 10,
}: {
  rows: { key: string; label: string; value: number; hint?: string }[];
  format: (v: number) => string;
  color?: string;
  empty?: string;
  max?: number;
}) {
  if (rows.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  let shown = rows;
  if (rows.length > maxRows) {
    const rest = rows.slice(maxRows - 1);
    shown = [
      ...rows.slice(0, maxRows - 1),
      {
        key: '__other',
        label: `Otros (${rest.length})`,
        value: rest.reduce((s, r) => s + r.value, 0),
      },
    ];
  }
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.value)));
  return (
    <ul className="grid gap-2">
      {shown.map((r) => (
        <li
          key={r.key}
          className="group grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm"
          title={
            r.hint ? `${r.label}: ${format(r.value)} · ${r.hint}` : `${r.label}: ${format(r.value)}`
          }
        >
          <span className="truncate text-muted-foreground group-hover:text-foreground">
            {r.label}
          </span>
          <span className="h-3 rounded-r-[4px] bg-muted/50">
            <span
              className={cn(
                'block h-full rounded-r-[4px] transition-opacity group-hover:opacity-80',
              )}
              style={{
                width: r.value === 0 ? 0 : `${Math.max(0.5, (Math.abs(r.value) / max) * 100)}%`,
                background: color,
              }}
            />
          </span>
          <span className="tabular-nums">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
