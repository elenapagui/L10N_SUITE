import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Building2, Plus, Search } from 'lucide-react';
import {
  CLIENT_KINDS,
  CURRENCIES,
  formatDateES,
  formatMoney,
  labelOf,
  plural,
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
import {
  CardGrid,
  GroupedList,
  PeriodPicker,
  ViewSwitcher,
  usePeriod,
  usePersistentState,
  type GroupOption,
  type ViewKind,
} from '@/components/views/views';
import { moneyText, usePeriodJobStats } from './JobViews';
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

type ClientRow = Client & { periodJobs: number; periodMoney: Map<string, number> | undefined };

const CLIENT_GROUPS: GroupOption<ClientRow>[] = [
  { value: 'kind', label: 'Tipo', get: (c) => labelOf(CLIENT_KINDS, c.kind) },
  { value: 'country', label: 'País', get: (c) => c.country },
  { value: 'active', label: 'En activo', get: (c) => (c.active ? 'Activos' : 'Inactivos') },
];

export function ClientsPage() {
  const clients = useClients();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = usePersistentState<ViewKind>('l10n-view-clients', 'table');
  const [groupBy, setGroupBy] = usePersistentState('l10n-group-clients', 'kind');
  const { period, setPeriod, range } = usePeriod('clients');
  const stats = usePeriodJobStats(range, (j) => j.clientId);

  const data = useMemo<ClientRow[]>(() => {
    const q = filter.trim().toLowerCase();
    return (clients.data ?? [])
      .filter((c) => showInactive || c.active)
      .filter((c) => !range || stats.has(c.id))
      .filter(
        (c) =>
          !q ||
          [c.name, c.legalName, c.country, c.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
      )
      .map((c) => ({
        ...c,
        periodJobs: stats.get(c.id)?.count ?? 0,
        periodMoney: stats.get(c.id)?.money,
      }));
  }, [clients.data, showInactive, stats, range, filter]);
  const openClient = (c: Client) =>
    void navigate({ to: '/trabajo/clientes/$clientId', params: { clientId: c.id } });

  const columns = useMemo<ColumnDef<ClientRow, unknown>[]>(
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
      { accessorKey: 'periodJobs', header: 'Encargos', meta: { align: 'right' } },
      {
        id: 'income',
        header: 'Ingresos',
        meta: { align: 'right' },
        accessorFn: (c) => [...(c.periodMoney?.values() ?? [])].reduce((a, b) => a + b, 0),
        cell: ({ row }) => moneyText(row.original.periodMoney),
      },
    ],
    [],
  );
  const table = (items: ClientRow[]) => (
    <DataTable data={items} columns={columns} onRowClick={openClient} testId="clients-table" />
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
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <PeriodPicker period={period} onChange={setPeriod} range={range} />
              <ViewSwitcher
                views={['table', 'cards', 'grouped']}
                value={layout}
                onChange={setLayout}
              />
            </div>
          </div>
          {layout === 'cards' ? (
            <CardGrid
              items={data}
              getId={(c) => c.id}
              onClick={openClient}
              renderCard={(c) => (
                <>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[labelOf(CLIENT_KINDS, c.kind), c.country].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {!c.active && <Badge variant="outline">Inactivo</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{plural(c.projectCount, 'proyecto', 'proyectos')}</span>
                    <span>{c.openJobCount} encargos abiertos</span>
                    {c.pendingBillingCents > 0 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {formatMoney(c.pendingBillingCents, c.currency)} por facturar
                      </span>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span>{plural(c.periodJobs, 'encargo', 'encargos')}</span>
                    <span className="ml-auto font-medium text-foreground tabular-nums">
                      {moneyText(c.periodMoney)}
                    </span>
                  </div>
                </>
              )}
              empty="No hay clientes."
            />
          ) : layout === 'grouped' ? (
            <GroupedList
              items={data}
              options={CLIENT_GROUPS}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              render={table}
              subtotal={(items) => {
                const m = new Map<string, number>();
                for (const c of items)
                  for (const [cur, v] of c.periodMoney ?? []) m.set(cur, (m.get(cur) ?? 0) + v);
                return `${plural(
                  items.reduce((a, c) => a + c.periodJobs, 0),
                  'encargo',
                  'encargos',
                )} · ${moneyText(m)}`;
              }}
            />
          ) : (
            table(data)
          )}
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
