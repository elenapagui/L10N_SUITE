import { useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Building2, Plus, Trash2 } from 'lucide-react';
import {
  CAT_BANDS,
  CLIENT_KINDS,
  CURRENCIES,
  DEFAULT_CAT_GRID,
  formatMoney,
  type Client,
  type Contact,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect } from '@/components/ui/input';
import { Spinner, Switch } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { CommitInput, DecimalInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useApiMutation, useClient, useProjects } from '@/hooks/work';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { RatesTable } from './RatesTable';
import { ProjectsTable, NewProjectDialog } from './ProjectsPage';
import { BackLink, FieldGrid, Section, Stat, usePatch } from './shared';

function ContactsPanel({ clientId, contacts }: { clientId: string; contacts: Contact[] }) {
  const [name, setName] = useState('');
  const trash = useTrashWithUndo();
  const add = useApiMutation(
    () =>
      api('/contacts', {
        method: 'POST',
        body: { clientId, name, isPrimary: contacts.length === 0 },
      }),
    {
      onSuccess: () => setName(''),
    },
  );
  const update = useApiMutation((v: { id: string } & Partial<Contact>) => {
    const { id, ...patch } = v;
    return api(`/contacts/${id}`, { method: 'PATCH', body: patch });
  });
  return (
    <div className="grid gap-3">
      {contacts.map((c) => (
        <div
          key={c.id}
          className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <CommitInput
            value={c.name}
            onCommit={(v) => v && update.mutate({ id: c.id, name: v })}
            placeholder="Nombre"
          />
          <CommitInput
            value={c.role}
            onCommit={(v) => update.mutate({ id: c.id, role: v })}
            placeholder="Rol (PM, revisión…)"
          />
          <CommitInput
            value={c.email}
            onCommit={(v) => update.mutate({ id: c.id, email: v })}
            placeholder="Correo"
            type="email"
          />
          <CommitInput
            value={c.phone}
            onCommit={(v) => update.mutate({ id: c.id, phone: v })}
            placeholder="Teléfono"
          />
          <div className="flex items-center gap-2">
            <label
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              title="Contacto principal"
            >
              <Switch
                checked={c.isPrimary}
                onCheckedChange={(v) => update.mutate({ id: c.id, isPrimary: v })}
              />
              Principal
            </label>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Eliminar contacto"
              onClick={() => void trash('contact', c.id, c.name, [['client']])}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate(undefined);
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del nuevo contacto"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          <Plus /> Añadir contacto
        </Button>
      </form>
    </div>
  );
}

function CatGridEditor({
  client,
  onSave,
}: {
  client: Client;
  onSave: (grid: Record<string, number>) => void;
}) {
  const grid = { ...DEFAULT_CAT_GRID, ...(client.catGrid ?? {}) };
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Porcentaje que paga este cliente por cada banda de coincidencias. Se aplica al calcular el
        volumen ponderado de sus encargos.
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {CAT_BANDS.map((b) => (
          <Field key={b.key} label={b.label}>
            <DecimalInput
              value={grid[b.key]}
              onCommit={(v) => onSave({ ...grid, [b.key]: v ?? 0 })}
              suffix="%"
              maxDecimals={1}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function ClientDetailPage() {
  const { clientId } = useParams({ strict: false }) as { clientId: string };
  const { tab } = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const q = useClient(clientId);
  const projects = useProjects({ clientId });
  const patch = usePatch<Client>(`/clients/${clientId}`);
  const trash = useTrashWithUndo();
  const [newProject, setNewProject] = useState(false);

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado el cliente.</p>
      </Page>
    );
  const { client, contacts, rates } = q.data;
  const save = (p: Partial<Client>) => patch.mutate(p);

  return (
    <Page>
      <BackLink to="/trabajo/clientes" label="Clientes" />
      <PageHeader
        icon={<Building2 />}
        title={client.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {CLIENT_KINDS.find((k) => k.value === client.kind)?.label}
            {client.country && <span>· {client.country}</span>}
            {!client.active && <Badge variant="outline">Inactivo</Badge>}
          </span>
        }
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={client.active} onCheckedChange={(active) => save({ active })} />{' '}
              Activo
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar cliente"
              onClick={async () => {
                await trash('client', client.id, client.name, [['clients']]);
                void navigate({ to: '/trabajo/clientes' });
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <TagPicker entityType="client" entityId={client.id} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Proyectos" value={client.projectCount} />
        <Stat label="Encargos abiertos" value={client.openJobCount} />
        <Stat
          label="Pendiente de facturar"
          value={formatMoney(client.pendingBillingCents, client.currency)}
          tone={client.pendingBillingCents > 0 ? 'warning' : undefined}
        />
      </div>
      <Tabs defaultValue={tab ?? 'resumen'}>
        <TabsList>
          <TabsTrigger value="resumen">Datos</TabsTrigger>
          <TabsTrigger value="contactos">Contactos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas ({rates.length})</TabsTrigger>
          <TabsTrigger value="proyectos">Proyectos ({client.projectCount})</TabsTrigger>
          <TabsTrigger value="adjuntos">Adjuntos</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen" className="grid gap-6 lg:grid-cols-2">
          <Section title="Datos del cliente">
            <FieldGrid>
              <Field label="Nombre">
                <CommitInput value={client.name} onCommit={(v) => v && save({ name: v })} />
              </Field>
              <Field label="Tipo">
                <NativeSelect
                  value={client.kind}
                  onChange={(e) => save({ kind: e.target.value as Client['kind'] })}
                >
                  {CLIENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Razón social">
                <CommitInput value={client.legalName} onCommit={(v) => save({ legalName: v })} />
              </Field>
              <Field label="NIF / VAT">
                <CommitInput value={client.taxId} onCommit={(v) => save({ taxId: v })} />
              </Field>
              <Field label="País">
                <CommitInput value={client.country} onCommit={(v) => save({ country: v })} />
              </Field>
              <Field label="Correo de facturación">
                <CommitInput
                  value={client.email}
                  onCommit={(v) => save({ email: v })}
                  type="email"
                />
              </Field>
              <Field label="Web">
                <CommitInput value={client.website} onCommit={(v) => save({ website: v })} />
              </Field>
              <Field
                label="Plataforma o CAT del cliente"
                hint="memoQ server, Phrase, XTM, Smartcat, Crowdin…"
              >
                <CommitInput value={client.platform} onCommit={(v) => save({ platform: v })} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2">
                <CommitInput
                  value={client.address}
                  onCommit={(v) => save({ address: v })}
                  multiline
                  rows={2}
                />
              </Field>
            </FieldGrid>
          </Section>
          <div className="grid content-start gap-6">
            <Section title="Condiciones">
              <FieldGrid>
                <Field label="Moneda">
                  <NativeSelect
                    value={client.currency}
                    onChange={(e) => save({ currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Plazo de pago (días)" hint="Vacío = el de tus preferencias">
                  <DecimalInput
                    value={client.paymentTermsDays}
                    onCommit={(v) => save({ paymentTermsDays: v })}
                    maxDecimals={0}
                  />
                </Field>
                <Field label="IVA (%)" hint="Vacío = el de tus preferencias">
                  <DecimalInput
                    value={client.vatPct}
                    onCommit={(v) => save({ vatPct: v })}
                    suffix="%"
                  />
                </Field>
                <Field label="Retención IRPF (%)" hint="0 para clientes extranjeros">
                  <DecimalInput
                    value={client.irpfPct}
                    onCommit={(v) => save({ irpfPct: v })}
                    suffix="%"
                  />
                </Field>
                <Field label="NDA firmado el">
                  <Input
                    type="date"
                    value={client.ndaSignedAt ?? ''}
                    onChange={(e) => save({ ndaSignedAt: e.target.value || null })}
                  />
                </Field>
                <Field label="Valoración">
                  <NativeSelect
                    value={client.rating ?? ''}
                    onChange={(e) =>
                      save({ rating: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">Sin valorar</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {'★'.repeat(n)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGrid>
            </Section>
            <Section title="Rejilla de coincidencias del CAT">
              <CatGridEditor client={client} onSave={(catGrid) => save({ catGrid })} />
            </Section>
          </div>
        </TabsContent>
        <TabsContent value="contactos">
          <ContactsPanel clientId={client.id} contacts={contacts} />
        </TabsContent>
        <TabsContent value="tarifas">
          <RatesTable rates={rates} clientId={client.id} currency={client.currency} />
        </TabsContent>
        <TabsContent value="proyectos" className="grid gap-3">
          <div>
            <Button size="sm" variant="outline" onClick={() => setNewProject(true)}>
              <Plus /> Nuevo proyecto
            </Button>
          </div>
          <ProjectsTable projects={projects.data ?? []} />
          <NewProjectDialog
            open={newProject}
            onOpenChange={setNewProject}
            defaults={{ clientId: client.id }}
          />
        </TabsContent>
        <TabsContent value="adjuntos">
          <AttachmentsPanel entityType="client" entityId={client.id} />
        </TabsContent>
        <TabsContent value="notas">
          <CommitInput
            value={client.notes}
            onCommit={(v) => save({ notes: v })}
            multiline
            rows={12}
            placeholder="Notas sobre el cliente: cómo trabaja, preferencias, contactos clave…"
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
