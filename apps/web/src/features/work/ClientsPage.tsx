import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, Plus, Search } from 'lucide-react';
import {
  CLIENT_KINDS,
  CURRENCIES,
  formatDateES,
  formatMoney,
  labelOf,
  valuesOf,
  type Client,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useApiMutation, useClients } from '@/hooks/work';
import { api } from '@/lib/api';

export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = '',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (c: Client) => void;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<string>('agency');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const create = useApiMutation(
    () => api<Client>('/clients', { method: 'POST', body: { name, kind, country, currency } }),
    {
      onSuccess: (c) => {
        onOpenChange(false);
        setName('');
        onCreated?.(c);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(undefined);
          }}
        >
          <Field label="Nombre" htmlFor="client-name">
            <Input
              id="client-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agencia, estudio o editora"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tipo">
              <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
                {CLIENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="País">
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Corea del Sur"
              />
            </Field>
            <Field label="Moneda">
              <NativeSelect value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Crear cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientsPage() {
  const clients = useClients();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);

  const data = useMemo(
    () => (clients.data ?? []).filter((c) => showInactive || c.active),
    [clients.data, showInactive],
  );

  const columns = useMemo<ColumnDef<Client, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Cliente',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {!row.original.active && <Badge variant="outline">Inactivo</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'kind',
        header: 'Tipo',
        cell: ({ row }) => labelOf(CLIENT_KINDS, row.original.kind),
      },
      { accessorKey: 'country', header: 'País', cell: ({ row }) => row.original.country ?? '—' },
      { accessorKey: 'projectCount', header: 'Proyectos', meta: { align: 'right' } },
      { accessorKey: 'openJobCount', header: 'Encargos abiertos', meta: { align: 'right' } },
      {
        accessorKey: 'pendingBillingCents',
        header: 'Pendiente de facturar',
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.pendingBillingCents > 0
            ? formatMoney(row.original.pendingBillingCents, row.original.currency)
            : '—',
      },
      {
        accessorKey: 'lastJobAt',
        header: 'Último encargo',
        cell: ({ row }) => formatDateES(row.original.lastJobAt),
      },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader
        title="Clientes"
        icon={<Building2 />}
        description="Agencias, estudios y editoras con sus contactos, tarifas y condiciones."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="new-client">
            <Plus /> Nuevo cliente
          </Button>
        }
      />
      {clients.data && clients.data.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="Aún no hay clientes"
          description="Añade las agencias y estudios con los que trabajas para asociarles proyectos, tarifas y contactos."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Añadir el primero
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar…"
                className="pl-8"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Mostrar inactivos
            </label>
          </div>
          <DataTable
            data={data}
            columns={columns}
            filter={filter}
            onRowClick={(c) =>
              void navigate({ to: '/trabajo/clientes/$clientId', params: { clientId: c.id } })
            }
            testId="clients-table"
          />
        </div>
      )}
      <NewClientDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(c) =>
          void navigate({ to: '/trabajo/clientes/$clientId', params: { clientId: c.id } })
        }
      />
    </Page>
  );
}

export const CLIENT_KIND_VALUES = valuesOf(CLIENT_KINDS);
