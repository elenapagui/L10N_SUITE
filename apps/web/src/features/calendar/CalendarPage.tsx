import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { addDaysISO, toISODate, todayISO, type CalendarEvent } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useApiMutation, useCalendar } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOpenTask } from '@/features/work/tasks/TaskSheetContext';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function gridStart(year: number, month: number): string {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - offset);
  return toISODate(first);
}

export function CalendarPage() {
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const start = gridStart(cursor.year, cursor.month);
  const end = addDaysISO(start, 41);
  const events = useCalendar(start, end);
  const openTask = useOpenTask();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState<string | null>(null);

  const move = useApiMutation((v: { kind: string; id: string; date: string }) =>
    api(v.kind === 'task' ? `/tasks/${v.id}` : `/jobs/${v.id}`, {
      method: 'PATCH',
      body: { dueDate: v.date },
    }),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events.data ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [events.data]);

  const rawMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(cursor.year, cursor.month, 1),
  );
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const open = (e: CalendarEvent) => {
    if (e.kind === 'task') openTask(e.entityId);
    else void navigate({ to: '/trabajo/encargos/$jobId', params: { jobId: e.entityId } });
  };

  return (
    <Page wide>
      <PageHeader
        title="Calendario"
        icon={<CalendarDays />}
        description="Entregas de encargos y tareas con fecha. Arrastra un elemento a otro día para cambiar su fecha."
      />
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })
          }
        >
          Hoy
        </Button>
        <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <h2 className="ml-2 text-lg font-semibold">{monthLabel}</h2>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 42 }, (_, i) => {
            const day = addDaysISO(start, i);
            const inMonth = Number(day.slice(5, 7)) - 1 === cursor.month;
            const list = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(day);
                }}
                onDragLeave={() => setDragOver((d) => (d === day ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const [kind, id] = e.dataTransfer.getData('text/plain').split(':');
                  if (kind && id) move.mutate({ kind, id, date: day });
                }}
                className={cn(
                  'min-h-28 border-b border-r p-1.5 text-xs [&:nth-child(7n)]:border-r-0',
                  !inMonth && 'bg-muted/30 text-muted-foreground',
                  dragOver === day && 'bg-accent',
                )}
                data-testid={`day-${day}`}
              >
                <div
                  className={cn(
                    'mb-1 flex size-6 items-center justify-center rounded-full text-xs',
                    day === today && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {Number(day.slice(8))}
                </div>
                <div className="grid gap-1">
                  {list.slice(0, 5).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      draggable
                      onDragStart={(ev) =>
                        ev.dataTransfer.setData('text/plain', `${e.kind}:${e.entityId}`)
                      }
                      onClick={() => open(e)}
                      title={[e.title, e.subtitle].filter(Boolean).join(' — ')}
                      className={cn(
                        'flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left',
                        e.done && 'line-through opacity-60',
                        e.kind === 'job'
                          ? 'bg-primary/15 font-medium text-primary'
                          : 'hover:bg-muted',
                      )}
                    >
                      {e.kind === 'job' ? (
                        <Package className="size-3 shrink-0" />
                      ) : (
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: e.color }}
                        />
                      )}
                      {e.time && <span className="tabular-nums">{e.time}</span>}
                      <span className="truncate">{e.title}</span>
                    </button>
                  ))}
                  {list.length > 5 && (
                    <span className="px-1.5 text-muted-foreground">y {list.length - 5} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
