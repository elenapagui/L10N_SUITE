import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  Ban,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Receipt,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  INVOICE_STATUSES,
  UNIT_PLURALS,
  formatDateES,
  formatMoney,
  formatNumber,
  labelOf,
  todayISO,
  type Invoice,
  type PendingBillingGroup,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useApiMutation } from '@/hooks/work';
import { api, apiUrl } from '@/lib/api';
import { Stat } from '@/features/work/shared';
import { JobsTable } from '@/features/work/JobsPage';
import { useInvoice, useInvoices, usePendingBilling } from './hooks';
import { InvoiceDialog } from './InvoiceForm';

export function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'issued' && invoice.overdueDays) {
    return <Badge variant="destructive">Vencida ({invoice.overdueDays} d)</Badge>;
  }
  const variant =
    invoice.status === 'paid' ? 'success' : invoice.status === 'cancelled' ? 'outline' : 'warning';
  return <Badge variant={variant}>{labelOf(INVOICE_STATUSES, invoice.status)}</Badge>;
}

function PendingGroup({ group }: { group: PendingBillingGroup }) {
  const [open, setOpen] = useState(false);
  const ids = group.jobs.map((j) => j.id).join(',');
  return (
    <section className="overflow-hidden rounded-lg border bg-card" data-testid="pending-group">
      <header className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-medium">{group.clientName ?? 'Sin cliente'}</h2>
          <p className="text-xs text-muted-foreground">
            {group.jobs.length}{' '}
            {group.jobs.length === 1 ? 'encargo entregado' : 'encargos entregados'} sin facturar
          </p>
        </div>
        <span className="ml-auto text-lg font-semibold tabular-nums">
          {formatMoney(group.totalCents, group.currency)}
        </span>
        {group.clientId && (
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={apiUrl('/billing/summary', { clientId: group.clientId, jobIds: ids })}>
                <FileSpreadsheet /> Resumen para facturar
              </a>
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} data-testid="register-invoice">
              <Receipt /> Registrar factura
            </Button>
          </>
        )}
      </header>
      <div className="p-3">
        <JobsTable jobs={group.jobs} />
      </div>
      {group.clientId && open && (
        <InvoiceDialog
          open={open}
          onOpenChange={setOpen}
          clientId={group.clientId}
          jobs={group.jobs}
        />
      )}
    </section>
  );
}

function InvoiceSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useInvoice(id);
  const confirm = useConfirm();
  const trash = useTrashWithUndo();
  const [paidAt, setPaidAt] = useState(todayISO());
  const action = useApiMutation((path: string) =>
    api(`/invoices/${id}/${path}`, { method: 'POST', body: path === 'pay' ? { paidAt } : {} }),
  );
  const patch = useApiMutation((body: Record<string, unknown>) =>
    api(`/invoices/${id}`, { method: 'PATCH', body }),
  );
  const inv = q.data?.invoice;
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()} title="Registro de factura">
      {!inv ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">Factura {inv.number}</h2>
            <InvoiceStatusBadge invoice={inv} />
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd>{inv.clientName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd>{formatDateES(inv.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vencimiento</dt>
              <dd>{formatDateES(inv.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cobrada el</dt>
              <dd>{formatDateES(inv.paidAt)}</dd>
            </div>
          </dl>
          <dl className="grid gap-1 rounded-lg bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <dt>Base imponible</dt>
              <dd className="tabular-nums">{formatMoney(inv.baseCents, inv.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IVA ({formatNumber(inv.vatPct)} %)</dt>
              <dd className="tabular-nums">{formatMoney(inv.vatCents, inv.currency)}</dd>
            </div>
            {inv.irpfPct > 0 && (
              <div className="flex justify-between">
                <dt>IRPF (−{formatNumber(inv.irpfPct)} %)</dt>
                <dd className="tabular-nums">−{formatMoney(inv.irpfCents, inv.currency)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(inv.totalCents, inv.currency)}</dd>
            </div>
            {inv.exchangeRate !== 1 && (
              <div className="text-xs text-muted-foreground">
                Tipo de cambio: {formatNumber(inv.exchangeRate, 6)}
              </div>
            )}
          </dl>
          <div className="flex flex-wrap items-end gap-2">
            {inv.status === 'issued' && (
              <>
                <Field label="Fecha de cobro" className="w-44">
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </Field>
                <Button onClick={() => action.mutate('pay')} data-testid="invoice-pay">
                  <CircleCheck /> Marcar como cobrada
                </Button>
              </>
            )}
            {inv.status === 'paid' && (
              <Button variant="outline" onClick={() => action.mutate('unpay')}>
                <RotateCcw /> Volver a pendiente de cobro
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={apiUrl('/billing/summary', { invoiceId: inv.id })}>
                <Download /> Resumen en Excel
              </a>
            </Button>
            {inv.status !== 'cancelled' && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  if (
                    await confirm({
                      title: '¿Anular la factura?',
                      description:
                        'Se conserva en el registro como anulada y sus encargos vuelven a estar pendientes de facturar. Recuerda emitir la factura rectificativa en tu programa.',
                      confirmLabel: 'Anular',
                      destructive: true,
                    })
                  ) {
                    action.mutate('cancel');
                  }
                }}
              >
                <Ban /> Anular
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar registro"
              onClick={async () => {
                await trash('invoice', inv.id, `Factura ${inv.number}`, [
                  ['invoices'],
                  ['billing-pending'],
                  ['jobs'],
                ]);
                onClose();
              }}
            >
              <Trash2 />
            </Button>
          </div>
          {q.data!.jobs.length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Encargos facturados</h3>
              <ul className="divide-y rounded-md border text-sm">
                {q.data!.jobs.map((j) => (
                  <li key={j.id}>
                    <Link
                      to="/trabajo/encargos/$jobId"
                      params={{ jobId: j.id }}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{j.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            j.projectName,
                            j.poNumber ? `PO ${j.poNumber}` : null,
                            j.volume != null && j.unit !== 'flat'
                              ? `${formatNumber(j.weightedVolume ?? j.volume)} ${UNIT_PLURALS[j.unit]}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatMoney(j.amountCents, j.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inv.extraLines.length > 0 && (
            <div className="grid gap-1 text-sm">
              <h3 className="font-medium">Otros conceptos</h3>
              {inv.extraLines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span>{l.description}</span>
                  <span className="tabular-nums">{formatMoney(l.amountCents, inv.currency)}</span>
                </div>
              ))}
            </div>
          )}
          <Field label="Notas">
            <Input
              key={inv.id}
              defaultValue={inv.notes ?? ''}
              onBlur={(e) =>
                e.target.value !== (inv.notes ?? '') && patch.mutate({ notes: e.target.value })
              }
            />
          </Field>
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">PDF de la factura</h3>
            <AttachmentsPanel entityType="invoice" entityId={inv.id} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function InvoicesPage() {
  const pending = usePendingBilling();
  const [status, setStatus] = useState('');
  const invoices = useInvoices(status ? { status } : {});
  const search = useSearch({ from: '/finanzas/facturas' });
  const navigate = useNavigate();
  const selected = search.factura ?? null;
  const [tab, setTab] = useState(selected ? 'invoices' : 'pending');
  const setSelected = (id: string | null) =>
    void navigate({ to: '/finanzas/facturas', search: id ? { factura: id } : {}, replace: true });

  const baseCurrency = useSettings().data?.preferences.baseCurrency ?? 'EUR';
  const stats = useMemo(() => {
    const list = invoices.data ?? [];
    const issued = list.filter((i) => i.status === 'issued');
    return {
      pendingBilling: (pending.data ?? [])
        .filter((g) => g.currency === baseCurrency)
        .reduce((s, g) => s + g.totalCents, 0),
      pendingOther: (pending.data ?? [])
        .filter((g) => g.currency !== baseCurrency)
        .map((g) => formatMoney(g.totalCents, g.currency))
        .join(' · '),
      pendingCollection: issued.reduce((s, i) => s + Math.round(i.totalCents * i.exchangeRate), 0),
      overdue: issued.filter((i) => i.overdueDays).length,
    };
  }, [invoices.data, pending.data, baseCurrency]);

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'Número',
        cell: ({ row }) => <span className="font-medium">{row.original.number}</span>,
      },
      {
        accessorKey: 'issueDate',
        header: 'Fecha',
        cell: ({ row }) => formatDateES(row.original.issueDate),
      },
      { accessorKey: 'clientName', header: 'Cliente' },
      {
        accessorKey: 'baseCents',
        header: 'Base',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.baseCents, row.original.currency),
      },
      {
        accessorKey: 'totalCents',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.totalCents, row.original.currency),
      },
      {
        accessorKey: 'dueDate',
        header: 'Vence',
        cell: ({ row }) => formatDateES(row.original.dueDate),
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <InvoiceStatusBadge invoice={row.original} />,
      },
    ],
    [],
  );

  return (
    <Page wide>
      <PageHeader
        title="Facturación"
        icon={<Receipt />}
        description="Seguimiento de lo pendiente de facturar, las facturas emitidas con tu programa de facturación y los cobros."
        actions={
          <Button variant="outline" onClick={() => void navigate({ to: '/finanzas/informes' })}>
            Ver informes
          </Button>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pendiente de facturar"
          value={formatMoney(stats.pendingBilling, baseCurrency)}
          hint={stats.pendingOther ? `Y además ${stats.pendingOther}` : undefined}
          tone={stats.pendingBilling || stats.pendingOther ? 'warning' : undefined}
        />
        <Stat
          label="Pendiente de cobro"
          value={formatMoney(stats.pendingCollection, baseCurrency)}
          hint={`En ${baseCurrency}, con el tipo de cambio de cada factura`}
        />
        <Stat
          label="Facturas vencidas"
          value={stats.overdue}
          tone={stats.overdue ? 'danger' : undefined}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Por facturar</TabsTrigger>
          <TabsTrigger value="invoices">Facturas</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="grid gap-4">
          {pending.isLoading ? (
            <Spinner />
          ) : (pending.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title="No hay nada pendiente de facturar"
              description="Aquí aparecen los encargos entregados que aún no están en ninguna factura."
            />
          ) : (
            pending.data!.map((g) => <PendingGroup key={`${g.clientId}-${g.currency}`} group={g} />)
          )}
        </TabsContent>
        <TabsContent value="invoices" className="grid gap-3">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              <TabsTrigger value="">Todas</TabsTrigger>
              <TabsTrigger value="issued">Pendientes de cobro</TabsTrigger>
              <TabsTrigger value="paid">Cobradas</TabsTrigger>
              <TabsTrigger value="cancelled">Anuladas</TabsTrigger>
            </TabsList>
          </Tabs>
          <DataTable
            data={invoices.data ?? []}
            columns={columns}
            onRowClick={(i) => setSelected(i.id)}
            empty="No hay facturas registradas."
            testId="invoices-table"
          />
        </TabsContent>
      </Tabs>
      <InvoiceSheet id={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}
