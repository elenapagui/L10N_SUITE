import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Briefcase,
  FileUp,
  FolderOpen,
  HardDrive,
  Info,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Tag,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { CURRENCIES, languageOptions, type Settings } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Kbd, Spinner, Switch } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useAppInfo, useSettings, useUpdateSettings } from '@/hooks/core';
import { useClients } from '@/hooks/work';
import { DecimalInput } from '@/components/common/inputs';
import { applyTheme } from '@/hooks/theme';
import { desktop, modKey } from '@/lib/desktop';
import { BackupsSettings } from './BackupsPanel';
import { TagsManager } from './TagsManager';
import { WorkSettings } from './WorkSettings';
import { ImportWizard } from './ImportWizard';
import { NotionImport } from './NotionImport';

export const SETTINGS_TABS = [
  'perfil',
  'preferencias',
  'trabajo',
  'etiquetas',
  'importar',
  'copias',
  'acerca',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

function ProfileForm({ initial }: { initial: Settings['profile'] }) {
  const [form, setForm] = useState(initial);
  const update = useUpdateSettings('profile');
  useEffect(() => setForm(initial), [initial]);
  const set = (key: keyof Settings['profile']) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos profesionales</CardTitle>
        <CardDescription>
          Se usan en los resúmenes para facturar y en los informes. Solo se guardan en este equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(form, { onSuccess: () => toast.success('Datos guardados') });
          }}
        >
          <Field label="Nombre para mostrar" htmlFor="displayName">
            <Input id="displayName" value={form.displayName} onChange={set('displayName')} />
          </Field>
          <Field label="Nombre fiscal o razón social" htmlFor="businessName">
            <Input id="businessName" value={form.businessName} onChange={set('businessName')} />
          </Field>
          <Field label="NIF / VAT" htmlFor="taxId">
            <Input id="taxId" value={form.taxId} onChange={set('taxId')} />
          </Field>
          <Field label="Correo electrónico" htmlFor="email">
            <Input id="email" type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Web" htmlFor="website">
            <Input id="website" value={form.website} onChange={set('website')} />
          </Field>
          <Field label="IBAN" htmlFor="iban">
            <Input id="iban" value={form.iban} onChange={set('iban')} className="font-mono" />
          </Field>
          <Field label="Dirección fiscal" htmlFor="address" className="sm:col-span-2">
            <Textarea id="address" value={form.address} onChange={set('address')} rows={2} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={update.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Tipos de cambio aproximados de las monedas que usan tus clientes, para la previsión de cobros. */
function FxRatesField({
  initial,
  save,
}: {
  initial: Settings['preferences'];
  save: (patch: Partial<Settings['preferences']>) => void;
}) {
  const clients = useClients();
  const used = [
    ...new Set(
      (clients.data ?? []).map((c) => c.currency).filter((c) => c !== initial.baseCurrency),
    ),
  ].sort();
  if (!used.length) return null;
  return (
    <Field
      label="Tipos de cambio aproximados"
      hint="Solo para la previsión de cobros mientras no haya facturas en esa moneda. Las facturas usan su propio tipo."
      className="sm:col-span-2"
    >
      <div className="flex flex-wrap gap-3">
        {used.map((code) => (
          <label key={code} className="flex items-center gap-2 text-sm">
            1 {code} =
            <DecimalInput
              value={
                initial.fxRates?.[code] != null ? Math.round(initial.fxRates[code] * 1e6) : null
              }
              onCommit={(micros) => {
                const next = { ...(initial.fxRates ?? {}) };
                if (micros && micros > 0) next[code] = micros / 1e6;
                else delete next[code];
                save({ fxRates: next });
              }}
              scale={1_000_000}
              maxDecimals={6}
              suffix={initial.baseCurrency}
              className="w-32"
              testId={`fx-${code}`}
            />
          </label>
        ))}
      </div>
    </Field>
  );
}

function PreferencesForm({ initial }: { initial: Settings['preferences'] }) {
  const update = useUpdateSettings('preferences');
  const save = (patch: Partial<Settings['preferences']>) =>
    update.mutate(patch, { onSuccess: () => toast.success('Preferencias guardadas') });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferencias</CardTitle>
        <CardDescription>
          Valores por defecto al crear clientes, encargos y facturas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Tema">
          <NativeSelect
            value={initial.theme}
            onChange={(e) => {
              const theme = e.target.value as Settings['preferences']['theme'];
              applyTheme(theme);
              save({ theme });
            }}
          >
            <option value="system">Como el sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </NativeSelect>
        </Field>
        <Field label="Moneda principal">
          <NativeSelect
            value={initial.baseCurrency}
            onChange={(e) => save({ baseCurrency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="IVA por defecto (%)">
          <Input
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={initial.defaultVatPct}
            onBlur={(e) => save({ defaultVatPct: Number(e.target.value) })}
          />
        </Field>
        <Field
          label="Retención de IRPF por defecto (%)"
          hint="Normalmente 15 % (7 % los primeros años de actividad)."
        >
          <Input
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={initial.defaultIrpfPct}
            onBlur={(e) => save({ defaultIrpfPct: Number(e.target.value) })}
          />
        </Field>
        <Field label="Plazo de pago por defecto (días)">
          <Input
            type="number"
            min={0}
            max={365}
            defaultValue={initial.paymentTermsDays}
            onBlur={(e) => save({ paymentTermsDays: Number(e.target.value) })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Idioma de origen habitual">
            <NativeSelect
              value={initial.defaultSourceLang}
              onChange={(e) => save({ defaultSourceLang: e.target.value })}
            >
              {languageOptions(initial.defaultSourceLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Idioma de destino habitual">
            <NativeSelect
              value={initial.defaultTargetLang}
              onChange={(e) => save({ defaultTargetLang: e.target.value })}
            >
              {languageOptions(initial.defaultTargetLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <FxRatesField initial={initial} save={save} />
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch
            checked={initial.notifications}
            onCheckedChange={(notifications) => save({ notifications })}
          />
          Avisos del sistema para entregas próximas, tareas vencidas y cobros atrasados
        </label>
      </CardContent>
    </Card>
  );
}

function AboutPanel() {
  const info = useAppInfo();
  if (!info.data) return <Spinner />;
  const d = info.data;
  const rows: [string, string][] = [
    ['Versión', d.version],
    ['Versión de los datos', String(d.schemaVersion)],
    ['Integridad de la base de datos', d.integrity === 'ok' ? 'Correcta' : 'Con errores'],
    ['Carpeta de datos', d.dataDir],
    ['Base de datos', d.dbPath],
    ['Copias de seguridad', d.backupsDir],
  ];
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>L10N Suite</CardTitle>
          <CardDescription>
            Espacio de trabajo para la traducción de videojuegos, la investigación académica y el
            corpus. Tus datos se guardan solo en este equipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-[220px_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all font-mono text-xs leading-5">{v}</dd>
              </div>
            ))}
          </dl>
          {desktop && (
            <div>
              <Button variant="outline" onClick={() => void desktop?.openPath(d.dataDir)}>
                <FolderOpen />
                Abrir carpeta de datos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Atajos de teclado</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[220px_1fr]">
            <dt>
              <Kbd>{modKey} K</Kbd>
            </dt>
            <dd>Búsqueda global e ir a cualquier sección</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: SettingsTab };
  const navigate = useNavigate();
  const settings = useSettings();
  const current: SettingsTab = tab && SETTINGS_TABS.includes(tab) ? tab : 'perfil';

  return (
    <Page>
      <PageHeader title="Ajustes" icon={<SettingsIcon />} />
      <Tabs
        value={current}
        onValueChange={(value) =>
          void navigate({ to: '/ajustes', search: { tab: value } as never })
        }
      >
        <TabsList>
          <TabsTrigger value="perfil">
            <User /> Perfil
          </TabsTrigger>
          <TabsTrigger value="preferencias">
            <SlidersHorizontal /> Preferencias
          </TabsTrigger>
          <TabsTrigger value="trabajo">
            <Briefcase /> Trabajo
          </TabsTrigger>
          <TabsTrigger value="etiquetas">
            <Tag /> Etiquetas
          </TabsTrigger>
          <TabsTrigger value="importar">
            <FileUp /> Importar
          </TabsTrigger>
          <TabsTrigger value="copias" data-testid="tab-copias">
            <HardDrive /> Copias de seguridad
          </TabsTrigger>
          <TabsTrigger value="acerca">
            <Info /> Acerca de
          </TabsTrigger>
        </TabsList>
        {settings.data ? (
          <>
            <TabsContent value="perfil">
              <ProfileForm initial={settings.data.profile} />
            </TabsContent>
            <TabsContent value="preferencias">
              <PreferencesForm initial={settings.data.preferences} />
            </TabsContent>
          </>
        ) : (
          <Spinner className="mt-4" />
        )}
        <TabsContent value="trabajo">
          <WorkSettings />
        </TabsContent>
        <TabsContent value="etiquetas">
          <Card>
            <CardHeader>
              <CardTitle>Etiquetas</CardTitle>
              <CardDescription>Comunes a toda la aplicación.</CardDescription>
            </CardHeader>
            <CardContent>
              <TagsManager />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="importar">
          <NotionImport />
          <ImportWizard />
        </TabsContent>
        <TabsContent value="copias">
          <BackupsSettings />
        </TabsContent>
        <TabsContent value="acerca">
          <AboutPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
