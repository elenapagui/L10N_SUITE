import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderOpen, HardDrive, RotateCcw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTimeES, type BackupInfo, type BackupKind } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { queryKeys, useSettings, useUpdateSettings } from '@/hooks/core';
import { api, apiUrl } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { formatBytes } from '@/lib/utils';

const KIND_LABELS: Record<BackupKind, string> = {
  auto: 'Automática',
  close: 'Al cerrar',
  manual: 'Manual',
  'pre-migration': 'Antes de actualizar',
  'pre-restore': 'Antes de restaurar',
  'pre-import': 'Antes de importar',
  'pre-sync': 'Antes de sincronizar',
};

function reloadApp() {
  if (desktop) void desktop.reload();
  else window.location.reload();
}

export function useBackups() {
  return useQuery({
    queryKey: queryKeys.backups,
    queryFn: () => api<{ directory: string; items: BackupInfo[] }>('/backups'),
  });
}

export function BackupList({ compact = false }: { compact?: boolean }) {
  const backups = useBackups();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: (fileName: string) =>
      api('/backups/restore', { method: 'POST', body: { fileName } }),
    onSuccess: () => {
      toast.success('Copia restaurada. Recargando…');
      setTimeout(reloadApp, 600);
    },
  });
  const create = useMutation({
    mutationFn: () => api<BackupInfo>('/backups', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Copia de seguridad creada');
      void qc.invalidateQueries({ queryKey: queryKeys.backups });
    },
  });

  const onRestore = async (b: BackupInfo) => {
    const ok = await confirm({
      title: '¿Restaurar esta copia?',
      description: (
        <>
          Los datos volverán a como estaban el <strong>{formatDateTimeES(b.createdAt)}</strong>.
          Antes se guardará una copia de los datos actuales, por si quieres volver atrás.
        </>
      ),
      confirmLabel: 'Restaurar',
      destructive: true,
    });
    if (ok) restore.mutate(b.fileName);
  };

  const items = backups.data?.items ?? [];
  return (
    <div className="grid gap-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            data-testid="backup-now"
          >
            {create.isPending ? <Spinner /> : <HardDrive />}
            Hacer copia ahora
          </Button>
          {desktop && backups.data && (
            <Button
              variant="outline"
              onClick={() => void desktop?.openPath(backups.data.directory)}
            >
              <FolderOpen />
              Abrir carpeta de copias
            </Button>
          )}
        </div>
      )}
      {backups.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay copias de seguridad.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-md border">
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Tamaño</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((b) => (
                <TR key={b.fileName} data-testid="backup-row">
                  <TD className="whitespace-nowrap">{formatDateTimeES(b.createdAt)}</TD>
                  <TD>
                    <Badge variant={b.kind === 'manual' ? 'default' : 'secondary'}>
                      {KIND_LABELS[b.kind]}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums text-muted-foreground">
                    {formatBytes(b.size)}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onRestore(b)}
                      disabled={restore.isPending}
                    >
                      <RotateCcw />
                      Restaurar
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function FullCopyPanel() {
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const doExport = async () => {
    let destDir: string | null = null;
    if (desktop) {
      destDir = await desktop.chooseDirectory({ title: 'Elige dónde guardar la copia completa' });
      if (!destDir) return;
    }
    setBusy('export');
    try {
      const result = await api<{ path: string; fileName: string; size: number }>(
        '/backups/export',
        {
          method: 'POST',
          body: { destDir },
        },
      );
      if (desktop) {
        toast.success(`Copia completa guardada (${formatBytes(result.size)})`, {
          action: { label: 'Mostrar', onClick: () => void desktop?.showItemInFolder(result.path) },
        });
      } else {
        window.location.href = apiUrl(`/backups/exports/${encodeURIComponent(result.fileName)}`);
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmImport = () =>
    confirm({
      title: '¿Sustituir todos los datos?',
      description:
        'Todos los datos de este equipo se sustituirán por los de la copia completa. Antes se guardará una copia de seguridad de los datos actuales.',
      confirmLabel: 'Importar y sustituir',
      destructive: true,
    });

  const runImport = async (body: FormData | { path: string }) => {
    setBusy('import');
    try {
      await api('/backups/import', { method: 'POST', body });
      toast.success('Copia completa importada. Recargando…');
      setTimeout(reloadApp, 600);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (desktop) {
      const file = await desktop.chooseFile({
        title: 'Elige la copia completa (.zip)',
        filters: [{ name: 'Copia completa de L10N Suite', extensions: ['zip'] }],
      });
      if (!file || !(await confirmImport())) return;
      await runImport({ path: file });
    } else {
      fileInput.current?.click();
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => void doExport()}
        disabled={busy !== null}
        data-testid="export-full"
      >
        {busy === 'export' ? <Spinner /> : <Download />}
        Exportar copia completa
      </Button>
      <Button variant="outline" onClick={() => void doImport()} disabled={busy !== null}>
        {busy === 'import' ? <Spinner /> : <Upload />}
        Importar copia completa
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !(await confirmImport())) return;
          const form = new FormData();
          form.append('file', file);
          await runImport(form);
        }}
      />
    </div>
  );
}

function BackupPolicy() {
  const settings = useSettings();
  const update = useUpdateSettings('backups');
  const backups = useBackups();
  const policy = settings.data?.backups;
  if (!policy) return <Spinner />;

  const save = (patch: Partial<typeof policy>) =>
    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Ajustes de copias guardados');
        void backups.refetch();
      },
    });

  const chooseDir = async () => {
    const dir = await desktop?.chooseDirectory({ title: 'Carpeta para las copias de seguridad' });
    if (dir) save({ directory: dir });
  };

  return (
    <div className="grid gap-4">
      <Field
        label="Carpeta de las copias"
        hint="Puede estar en OneDrive, iCloud Drive, Dropbox o Google Drive: así tendrás las copias también fuera del equipo. Los datos de trabajo se quedan siempre en el equipo."
      >
        <div className="flex gap-2">
          <Input readOnly value={backups.data?.directory ?? ''} className="font-mono text-xs" />
          {desktop && (
            <Button variant="outline" onClick={() => void chooseDir()}>
              Cambiar
            </Button>
          )}
          {policy.directory && (
            <Button variant="ghost" onClick={() => save({ directory: null })}>
              Usar la predeterminada
            </Button>
          )}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ['keepDaily', 'Copias diarias que se conservan'],
            ['keepWeekly', 'Copias semanales'],
            ['keepMonthly', 'Copias mensuales'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Input
              type="number"
              min={key === 'keepDaily' ? 1 : 0}
              max={120}
              defaultValue={policy[key]}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (Number.isInteger(value) && value !== policy[key]) save({ [key]: value });
              }}
            />
          </Field>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={policy.onClose} onCheckedChange={(onClose) => save({ onClose })} />
        Hacer una copia al cerrar la aplicación si ha habido cambios
      </label>
    </div>
  );
}

export function BackupsSettings() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Copias de seguridad</CardTitle>
          <CardDescription>
            Se hace una copia automática al abrir la app (si han pasado 24 horas), al cerrarla y
            antes de cada actualización. Cada copia se verifica antes de guardarse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupList />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
        </CardHeader>
        <CardContent>
          <BackupPolicy />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Copia completa</CardTitle>
          <CardDescription>
            Un archivo ZIP con todos tus datos y adjuntos. Úsalo para llevarlos a otro ordenador:
            exporta en el principal e importa en el otro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FullCopyPanel />
        </CardContent>
      </Card>
    </div>
  );
}
