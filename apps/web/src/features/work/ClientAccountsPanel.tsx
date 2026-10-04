import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ACCOUNT_TOOLS, labelOf, normalizeUrl, type ClientAccount } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { CommitInput } from '@/components/common/inputs';
import { EmptyState } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copiado`));
}

function IconButton({
  label,
  onClick,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function AccountCard({ a, onChanged }: { a: ClientAccount; onChanged: () => void }) {
  const [shown, setShown] = useState(false);
  const confirm = useConfirm();
  const save = async (patch: Partial<ClientAccount>) => {
    try {
      await api(`/client-accounts/${a.id}`, { method: 'PATCH', body: patch });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
    onChanged();
  };
  const url = normalizeUrl(a.serverUrl);
  return (
    <div className="grid gap-3 rounded-md border p-3" data-testid="client-account">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <NativeSelect
          className="h-8 w-44"
          value={a.tool}
          onChange={(e) => void save({ tool: e.target.value as ClientAccount['tool'] })}
          aria-label="Herramienta"
        >
          {ACCOUNT_TOOLS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <CommitInput
          className="h-8 max-w-xs flex-1"
          value={a.label}
          onCommit={(label) => void save({ label })}
          placeholder="Nombre (servidor principal, proyecto…)"
        />
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label="Eliminar el acceso"
          onClick={async () => {
            const ok = await confirm({
              title: '¿Eliminar este acceso?',
              description: `${labelOf(ACCOUNT_TOOLS, a.tool)}${a.label ? ` · ${a.label}` : ''}${a.username ? ` · ${a.username}` : ''}`,
              confirmLabel: 'Eliminar',
              destructive: true,
            });
            if (!ok) return;
            await api(`/client-accounts/${a.id}`, { method: 'DELETE' });
            onChanged();
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Servidor o enlace">
          <div className="flex items-center gap-1">
            <CommitInput
              value={a.serverUrl}
              onCommit={(serverUrl) => void save({ serverUrl })}
              placeholder="https://memoq.empresa.com o servidor:puerto"
              testId="account-server"
            />
            {a.serverUrl && (
              <IconButton label="Copiar el servidor" onClick={() => copy(a.serverUrl!, 'Servidor')}>
                <Copy className="size-3.5" />
              </IconButton>
            )}
            {url && /^https?:\/\//i.test(url) && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Abrir el enlace"
                title="Abrir el enlace"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </Field>
        <Field label="Usuario">
          <div className="flex items-center gap-1">
            <CommitInput
              value={a.username}
              onCommit={(username) => void save({ username })}
              testId="account-user"
            />
            {a.username && (
              <IconButton
                label="Copiar el usuario"
                onClick={() => copy(a.username!, 'Usuario')}
                testId="account-copy-user"
              >
                <Copy className="size-3.5" />
              </IconButton>
            )}
          </div>
        </Field>
        <Field label="Contraseña">
          <div className="flex items-center gap-1">
            <CommitInput
              key={shown ? 'shown' : 'hidden'}
              type={shown ? 'text' : 'password'}
              value={a.password}
              onCommit={(password) => void save({ password })}
              testId="account-password"
            />
            <IconButton
              label={shown ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
              onClick={() => setShown((s) => !s)}
            >
              {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </IconButton>
            {a.password && (
              <IconButton
                label="Copiar la contraseña"
                onClick={() => copy(a.password!, 'Contraseña')}
              >
                <Copy className="size-3.5" />
              </IconButton>
            )}
          </div>
        </Field>
      </div>
      <CommitInput
        value={a.notes}
        onCommit={(notes) => void save({ notes })}
        placeholder="Notas (versión del cliente de memoQ, VPN, a quién pedir acceso…)"
      />
    </div>
  );
}

/** Accesos del cliente a sus herramientas: servidor de memoQ, Trados, Phrase… */
export function ClientAccountsPanel({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: ClientAccount[];
}) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['client', clientId] });
  const add = async () => {
    try {
      await api('/client-accounts', { method: 'POST', body: { clientId, tool: 'memoq' } });
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido añadir.');
    }
  };
  return (
    <div className="grid gap-3">
      {accounts.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="Sin accesos guardados"
          description="Guarda aquí el servidor de memoQ (u otra herramienta), el usuario y la contraseña de este cliente. Puedes añadir varios."
        />
      ) : (
        accounts.map((a) => <AccountCard key={a.id} a={a} onChanged={refresh} />)
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void add()} data-testid="add-account">
          <Plus /> Añadir acceso
        </Button>
        <span className="text-xs text-muted-foreground">
          Las contraseñas se guardan sin cifrar en tus datos (y en las copias de seguridad y la
          sincronización).
        </span>
      </div>
    </div>
  );
}
