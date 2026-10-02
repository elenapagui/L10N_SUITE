import { useEffect, useState } from 'react';
import { Pause, Play, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field } from '@/components/ui/label';
import { EntitySelect } from '@/components/common/EntitySelect';
import { useJobs, useProjects, useTimer } from '@/hooks/work';
import { formatClock } from '@/lib/format';
import { useTimerControls } from './useTimerControls';

/** Cronómetro de la barra superior: muestra el tiempo en marcha o permite arrancarlo. */
export function TimerWidget() {
  const timer = useTimer();
  const controls = useTimerControls();
  const running = timer.data?.running ?? null;
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const projects = useProjects({ status: 'active,prospect,paused' });
  const jobs = useJobs(projectId ? { projectId, open: true } : { open: true });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (running) {
    const elapsed = Math.max(0, Math.floor((now - Date.parse(running.startedAt)) / 1000));
    const label = running.taskTitle ?? running.jobTitle ?? running.projectName ?? 'Sin asignar';
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-sm"
        data-testid="timer-running"
      >
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        <span className="max-w-48 truncate">{label}</span>
        <span className="font-mono tabular-nums">{formatClock(elapsed)}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => controls.stop()}
          aria-label="Parar el cronómetro"
          data-testid="timer-stop"
        >
          <Pause />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="timer-open">
          <Timer /> Cronómetro
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <Field label="Proyecto (opcional)">
          <EntitySelect
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setJobId(null);
            }}
          />
        </Field>
        <Field label="Encargo (opcional)">
          <EntitySelect
            options={(jobs.data ?? []).map((j) => ({
              value: j.id,
              label: j.title,
              hint: j.projectName,
            }))}
            value={jobId}
            onChange={setJobId}
          />
        </Field>
        <Button
          onClick={() => {
            controls.start({ projectId, jobId });
            setOpen(false);
          }}
          data-testid="timer-start"
        >
          <Play /> Empezar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
