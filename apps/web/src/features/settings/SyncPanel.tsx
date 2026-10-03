import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  CloudUpload,
  CloudDownload,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTimeES, type SyncStatus } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { cn } from '@/lib/utils';

export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync'],
    queryFn: () => api<SyncStatus>('/sync'),
    refetchInterval: 5 * 60_000,
  });

/** Tras cargar la versión del otro ordenador, la interfaz se recarga entera. */
function reloadApp() {
  if (desktop) void desktop.reload();
  else window.location.reload();
}

function useSyncActions() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<SyncStatus>, done?: (s: SyncStatus) => void) => {
    setBusy(true);
    try {
      const s = await fn();
      qc.setQueryData(['sync'], s);
      done?.(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se ha podido sincronizar.');
    } finally {
      setBusy(false);
    }
  };
  const push = (force = false) =>
    run(
      () => api<SyncStatus>('/sync/push', { method: 'POST', body: { force } }),
      (s) => {
        if (s.conflict)
          toast.warning('Hay cambios del otro ordenador sin cargar: elige qué versión quieres.');
        else toast.success('Copia enviada a la carpeta de sincronización');
      },
    );
  const pull = async (force = false) => {
    if (force) {
      const ok = await confirm({
        title: '¿Cargar la versión del otro ordenador?',
        description:
          'Los cambios hechos aquí desde la última sincronización se sustituirán. Antes se hace una copia de seguridad, así que podrás recuperarlos desde Copias de seguridad.',
        confirmLabel: 'Cargar la otra versión',
        destructive: true,
      });
      if (!ok) return;
    }
    await run(
      () => api<SyncStatus>('/sync/pull', { method: 'POST', body: { force } }),
      (s) => {
        if (s.conflict) return;
        toast.success('Datos del otro ordenador cargados');
        setTimeout(reloadApp, 600);
      },
    );
  };
  return { busy, push, pull };
}

function RemoteLine({ s }: { s: SyncStatus }) {
  if (!s.remote) return <span>La carpeta aún no tiene ninguna copia.</span>;
  return (
    <span>
      Última copia en la carpeta: <strong>{s.remote.deviceName}</strong>,{' '}
      {formatDateTimeES(s.remote.savedAt)}
    </span>
  );
}

/** Ajustes → Sincronización. */
export function SyncSettings() {
  const q = useSyncStatus();
  const qc = useQueryClient();
  const { busy, push, pull } = useSyncActions();
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  useEffect(() => {
    if (q.data) {
      setName(q.data.deviceName);
      setDir(q.data.directory ?? '');
    }
  }, [q.data?.deviceName, q.data?.directory]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = q.data;
  if (!s) return <Spinner />;
  const save = async (patch: { directory?: string | null; deviceName?: string }) => {
    try {
      qc.setQueryData(['sync'], await api<SyncStatus>('/sync', { method: 'PUT', body: patch }));
      toast.success('Sincronización configurada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se ha podido guardar.');
    }
  };
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Sincronización entre ordenadores</CardTitle>
          <CardDescription>
            Para usar la app en dos ordenadores (no a la vez). Al cerrar la app se deja una copia en
            una carpeta que tu servicio en la nube (OneDrive, iCloud Drive, Dropbox, Google Drive…)
            lleva al otro ordenador; al abrirla allí, se cargan los cambios. Tus datos de trabajo
            nunca se guardan directamente en la nube.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Carpeta sincronizada"
            hint={
              'La misma carpeta de la nube en los dos ordenadores (por ejemplo, OneDrive\\Documentos o iCloud Drive).'
            }
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <Input
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                onBlur={() => dir !== (s.directory ?? '') && void save({ directory: dir || null })}
                placeholder="Sin configurar"
                className="font-mono text-xs"
                data-testid="sync-directory"
              />
              {desktop && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const chosen = await desktop!.chooseDirectory({
                      title: 'Carpeta de la nube para sincronizar',
                    });
                    if (chosen) {
                      setDir(chosen);
                      void save({ directory: chosen });
                    }
                  }}
                >
                  <FolderOpen /> Elegir…
                </Button>
              )}
              {s.directory && (
                <Button variant="ghost" onClick={() => void save({ directory: null })}>
                  Desactivar
                </Button>
              )}
            </div>
          </Field>
          <Field label="Nombre de este ordenador" hint="Para saber de dónde viene cada copia.">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== s.deviceName && void save({ deviceName: name })}
              data-testid="sync-device"
            />
          </Field>
        </CardContent>
      </Card>
      {s.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              {s.lastSyncAt
                ? `Última sincronización de este ordenador: ${formatDateTimeES(s.lastSyncAt)}.`
                : 'Este ordenador aún no se ha sincronizado.'}{' '}
              {s.dirty ? 'Hay cambios sin enviar.' : 'No hay cambios sin enviar.'}
            </p>
            <p className="text-muted-foreground">
              <RemoteLine s={s} />
            </p>
            {s.conflict ? (
              <ConflictChoice s={s} busy={busy} push={push} pull={pull} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void push()} disabled={busy} data-testid="sync-push">
                  <CloudUpload /> Enviar ahora
                </Button>
                {s.incoming && (
                  <Button variant="outline" onClick={() => void pull()} disabled={busy}>
                    <CloudDownload /> Cargar los cambios de {s.remote?.deviceName}
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La copia se envía sola al cerrar la app. Antes de cargar la del otro ordenador se hace
              una copia de seguridad de la de aquí.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConflictChoice({
  s,
  busy,
  push,
  pull,
}: {
  s: SyncStatus;
  busy: boolean;
  push: (force?: boolean) => Promise<void>;
  pull: (force?: boolean) => Promise<void>;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" /> Hay cambios en los dos ordenadores
      </p>
      <p>
        «{s.remote?.deviceName}» envió una versión el {formatDateTimeES(s.remote?.savedAt)} y aquí
        también has hecho cambios. Elige con qué versión te quedas; la otra se guarda como copia de
        seguridad.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void push(true)}
          disabled={busy}
          data-testid="sync-keep-local"
        >
          Quedarme con la de este ordenador
        </Button>
        <Button
          variant="outline"
          onClick={() => void pull(true)}
          disabled={busy}
          data-testid="sync-take-remote"
        >
          Usar la de «{s.remote?.deviceName}»
        </Button>
      </div>
    </div>
  );
}

/**
 * Indicador de la barra superior y avisos al abrir: datos cargados del otro ordenador, conflicto
 * o error. Solo aparece si la sincronización está configurada.
 */
export function SyncIndicator() {
  const q = useSyncStatus();
  const { busy, push, pull } = useSyncActions();
  const [conflictOpen, setConflictOpen] = useState(false);
  const s = q.data;
  const event = s?.lastEvent;
  useEffect(() => {
    if (!event) return;
    if (event.kind === 'received')
      toast.success(`Se han cargado los cambios de «${event.deviceName}»`, {
        description: formatDateTimeES(event.at),
      });
    else if (event.kind === 'conflict') setConflictOpen(true);
    else if (event.kind === 'error')
      toast.error('No se ha podido sincronizar al abrir', { description: event.message });
    if (event.kind !== 'sent') void api('/sync/ack', { method: 'POST' });
  }, [event?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s?.configured) return null;
  const state = s.conflict ? 'conflict' : s.incoming ? 'incoming' : s.dirty ? 'pending' : 'ok';
  const label = {
    conflict: 'Hay cambios en los dos ordenadores',
    incoming: `Hay cambios de «${s.remote?.deviceName}» para cargar`,
    pending: 'Cambios sin enviar (se envían al cerrar)',
    ok: `Sincronizado${s.lastSyncAt ? ` (${formatDateTimeES(s.lastSyncAt)})` : ''}`,
  }[state];
  const Icon =
    state === 'ok'
      ? Cloud
      : state === 'pending'
        ? CloudUpload
        : state === 'incoming'
          ? CloudDownload
          : CloudOff;
  return (
    <>
      <Link
        to="/ajustes"
        search={{ tab: 'sincronizacion' } as never}
        title={label}
        aria-label={label}
        className={cn(
          'flex size-8 items-center justify-center rounded-md hover:bg-accent',
          state === 'conflict' && 'text-destructive',
          state === 'incoming' && 'text-primary',
          (state === 'ok' || state === 'pending') && 'text-muted-foreground',
        )}
        data-testid="sync-indicator"
      >
        <Icon className="size-4" />
      </Link>
      <Dialog open={conflictOpen && s.conflict} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sincronización: elige una versión</DialogTitle>
          </DialogHeader>
          <ConflictChoice s={s} busy={busy} push={push} pull={pull} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConflictOpen(false)}>
              Decidir más tarde
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
