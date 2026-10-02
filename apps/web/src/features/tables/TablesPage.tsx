import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  FileUp,
  Kanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Sheet as SheetIcon,
  Table2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  VIEW_TYPES,
  applyView,
  computeRows,
  formatDateTimeES,
  todayISO,
  type CustomTableDetail,
  type TableColumn,
  type TableView,
  type ViewType,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { EmojiPicker } from '@/components/common/EmojiPicker';
import { EntitySelect } from '@/components/common/EntitySelect';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useGames } from '@/hooks/work';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BoardView, CalendarView } from './BoardViews';
import { ColumnDialog } from './ColumnDialog';
import { Grid } from './Grid';
import { RowSheet } from './RowSheet';
import { ViewToolbar } from './ViewToolbar';
import { useTable, useTableActions, useTableRows, useTables } from './hooks';

const VIEW_ICONS: Record<ViewType, typeof Table2> = {
  grid: SheetIcon,
  board: Kanban,
  calendar: CalendarDays,
};

/** Importa un Excel o CSV como tabla(s) nueva(s). */
export function useImportTables(gameId?: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async (file: File) => {
    const form = new FormData();
    if (gameId) form.append('gameId', gameId);
    form.append('file', file, file.name);
    const id = toast.loading(`Importando «${file.name}»…`);
    try {
      const tables = await api<CustomTableDetail[]>('/tables/import', {
        method: 'POST',
        body: form,
      });
      toast.success(
        tables.length === 1
          ? `Tabla «${tables[0]!.name}» creada`
          : `${tables.length} tablas creadas (una por hoja)`,
        { id },
      );
      await qc.invalidateQueries({ queryKey: ['tables'] });
      if (tables[0]) void navigate({ to: '/tablas/$tableId', params: { tableId: tables[0].id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar.', { id });
    }
  };
}

export function NewTableDialog({
  open,
  onOpenChange,
  gameId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gameId?: string;
}) {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tabla</DialogTitle>
        </DialogHeader>
        <Field label="Nombre">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seguimiento de candidaturas, tarifas del mercado…"
            data-testid="table-name"
          />
        </Field>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              const t = await api<CustomTableDetail>('/tables', {
                method: 'POST',
                body: { name: name.trim(), gameId },
              });
              await qc.invalidateQueries({ queryKey: ['tables'] });
              onOpenChange(false);
              setName('');
              void navigate({ to: '/tablas/$tableId', params: { tableId: t.id } });
            }}
            data-testid="create-table"
          >
            Crear tabla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TablesPage() {
  const tables = useTables();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFile = useImportTables();
  return (
    <Page wide>
      <PageHeader
        title="Tablas"
        icon={<Table2 />}
        description="Hojas de cálculo propias con columnas con tipo, fórmulas, filtros y vistas de tablero y calendario."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              data-testid="import-table"
            >
              <FileUp /> Importar Excel o CSV
            </Button>
            <Button onClick={() => setOpen(true)} data-testid="new-table">
              <Plus /> Nueva tabla
            </Button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        data-testid="import-table-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }}
      />
      {tables.isLoading ? (
        <Spinner />
      ) : !tables.data?.length ? (
        <EmptyState
          icon={<Table2 />}
          title="Aún no tienes tablas"
          description="Crea una desde cero o importa un Excel. Desde Google Sheets: Archivo → Descargar → Microsoft Excel."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.data.map((t) => (
            <Link
              key={t.id}
              to="/tablas/$tableId"
              params={{ tableId: t.id }}
              className="grid gap-1 rounded-lg border bg-card p-4 hover:border-primary/50 hover:bg-accent/30"
            >
              <span className="flex items-center gap-2 font-medium">
                <span className="text-lg">{t.icon ?? '📊'}</span>
                <span className="truncate">{t.name}</span>
              </span>
              {t.description && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{t.description}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {t.rowCount} {t.rowCount === 1 ? 'fila' : 'filas'} · {formatDateTimeES(t.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
      <NewTableDialog open={open} onOpenChange={setOpen} />
    </Page>
  );
}

function ViewTabs({
  table,
  active,
  onSelect,
  actions,
}: {
  table: CustomTableDetail;
  active: TableView;
  onSelect: (id: string) => void;
  actions: ReturnType<typeof useTableActions>;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<TableView | null>(null);
  const [name, setName] = useState('');
  const addView = async (type: ViewType) => {
    const label = VIEW_TYPES.find((v) => v.value === type)!.label;
    const v = await api<TableView>(`/tables/${table.id}/views`, {
      method: 'POST',
      body: { name: label, type },
    });
    await qc.invalidateQueries({ queryKey: ['table', table.id] });
    onSelect(v.id);
  };
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 pt-2">
      {table.views.map((v) => {
        const Icon = VIEW_ICONS[v.type];
        const isActive = v.id === active.id;
        return (
          <div
            key={v.id}
            className={cn(
              'group flex items-center rounded-t-md border-b-2',
              isActive ? 'border-primary' : 'border-transparent',
            )}
          >
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-sm',
                isActive ? 'font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onSelect(v.id)}
            >
              <Icon className="size-4" /> {v.name}
            </button>
            {isActive && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                    aria-label="Opciones de la vista"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() => {
                      setName(v.name);
                      setRenaming(v);
                    }}
                  >
                    <Pencil /> Cambiar nombre
                  </DropdownMenuItem>
                  {table.views.length > 1 && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={async () => {
                        if (
                          !(await confirm({
                            title: `¿Eliminar la vista «${v.name}»?`,
                            description: 'Los datos de la tabla no se borran.',
                            confirmLabel: 'Eliminar',
                            destructive: true,
                          }))
                        )
                          return;
                        await api(`/table-views/${v.id}`, { method: 'DELETE' });
                        await qc.invalidateQueries({ queryKey: ['table', table.id] });
                        onSelect(table.views.find((x) => x.id !== v.id)!.id);
                      }}
                    >
                      <Trash2 /> Eliminar vista
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="add-view"
          >
            <Plus /> Vista
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {VIEW_TYPES.map((t) => {
            const Icon = VIEW_ICONS[t.value];
            return (
              <DropdownMenuItem key={t.value} onSelect={() => void addView(t.value)}>
                <Icon /> {t.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nombre de la vista</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                if (renaming) void actions.patchView(renaming, { name: name.trim() });
                setRenaming(null);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TablePage() {
  const { tableId } = useParams({ strict: false }) as { tableId: string };
  const table = useTable(tableId);
  const data = useTableRows(tableId);
  const games = useGames();
  const actions = useTableActions(tableId);
  const navigate = useNavigate();
  const trash = useTrashWithUndo();
  const [viewId, setViewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [columnDialog, setColumnDialog] = useState<{ column: TableColumn | null } | null>(null);
  const [editInfo, setEditInfo] = useState(false);

  const t = table.data;
  const view = t ? (t.views.find((v) => v.id === viewId) ?? t.views[0]!) : null;
  const allColumns = useMemo(
    () => [...(t?.columns ?? [])].sort((a, b) => a.position - b.position),
    [t],
  );
  const columns = useMemo(
    () => allColumns.filter((c) => !view?.config.hidden.includes(c.id)),
    [allColumns, view],
  );
  const computed = useMemo(
    () => computeRows(allColumns, data.data?.rows ?? [], todayISO()),
    [allColumns, data.data],
  );
  const rows = useMemo(
    () =>
      view
        ? applyView(allColumns, computed, view.config, { search, labels: data.data?.labels })
        : [],
    [allColumns, computed, view, search, data.data?.labels],
  );

  if (table.isLoading || data.isLoading) {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  if (!t || !view) {
    return (
      <Page>
        <p className="text-muted-foreground">Esta tabla no existe o está en la papelera.</p>
      </Page>
    );
  }
  const labels = data.data?.labels ?? {};
  const rowForSheet = openRow ? (computed.find((r) => r.id === openRow) ?? null) : null;

  const patchTable = async (body: Record<string, unknown>) => {
    await api(`/tables/${t.id}`, { method: 'PATCH', body });
    await actions.refreshAll();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <Link to="/tablas" className="text-sm text-muted-foreground hover:text-foreground">
          Tablas
        </Link>
        <span className="text-muted-foreground">/</span>
        <EmojiPicker value={t.icon} onChange={(icon) => void patchTable({ icon })}>
          <button
            type="button"
            className="rounded-md text-2xl leading-none hover:bg-accent"
            aria-label="Cambiar icono"
          >
            {t.icon ?? '📊'}
          </button>
        </EmojiPicker>
        <h1 className="text-xl font-semibold" data-testid="table-title">
          {t.name}
        </h1>
        <span className="text-sm text-muted-foreground">
          {rows.length !== computed.length
            ? `${rows.length} de ${computed.length}`
            : computed.length}{' '}
          {computed.length === 1 ? 'fila' : 'filas'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de la tabla">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditInfo(true)}>
                <Pencil /> Nombre, descripción y juego
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={async () => {
                  await trash('custom_table', t.id, t.name, [['tables']]);
                  void navigate({ to: '/tablas' });
                }}
              >
                <Trash2 /> Eliminar tabla
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {t.description && <p className="px-4 pt-1 text-sm text-muted-foreground">{t.description}</p>}
      <ViewTabs table={t} active={view} onSelect={setViewId} actions={actions} />
      <div className="flex min-h-0 flex-1 flex-col border-t">
        <ViewToolbar
          tableId={t.id}
          view={view}
          columns={columns}
          allColumns={allColumns}
          search={search}
          onSearch={setSearch}
          actions={actions}
        />
        {view.type === 'grid' && (
          <Grid
            view={view}
            columns={columns}
            rows={rows}
            labels={labels}
            actions={actions}
            onOpenRow={setOpenRow}
            onEditColumn={(column) => setColumnDialog({ column })}
          />
        )}
        {view.type === 'board' && (
          <BoardView
            view={view}
            columns={columns}
            allColumns={allColumns}
            rows={rows}
            labels={labels}
            actions={actions}
            onOpenRow={setOpenRow}
          />
        )}
        {view.type === 'calendar' && (
          <CalendarView
            view={view}
            columns={columns}
            allColumns={allColumns}
            rows={rows}
            labels={labels}
            actions={actions}
            onOpenRow={setOpenRow}
          />
        )}
      </div>
      <RowSheet
        row={rowForSheet}
        columns={allColumns}
        labels={labels}
        actions={actions}
        onClose={() => setOpenRow(null)}
      />
      <ColumnDialog
        open={columnDialog !== null}
        onOpenChange={(o) => !o && setColumnDialog(null)}
        column={columnDialog?.column ?? null}
        columns={allColumns}
        tableId={t.id}
        sampleRow={data.data?.rows[0]}
        onSave={async (body) => {
          if (columnDialog?.column) await actions.patchColumn(columnDialog.column.id, body);
          else await actions.createColumn(body);
        }}
      />
      <TableInfoDialog
        open={editInfo}
        onOpenChange={setEditInfo}
        table={t}
        games={(games.data ?? []).map((g) => ({ value: g.id, label: g.title }))}
        onSave={patchTable}
      />
    </div>
  );
}

function TableInfoDialog({
  open,
  onOpenChange,
  table,
  games,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: CustomTableDetail;
  games: { value: string; label: string }[];
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(table.name);
  const [description, setDescription] = useState(table.description ?? '');
  const [gameId, setGameId] = useState<string | null>(table.gameId);
  useEffect(() => {
    if (!open) return;
    setName(table.name);
    setDescription(table.description ?? '');
    setGameId(table.gameId);
  }, [open, table]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Datos de la tabla</DialogTitle>
        </DialogHeader>
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descripción">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Juego (opcional)">
          <EntitySelect
            options={games}
            value={gameId}
            onChange={setGameId}
            allowEmpty
            emptyLabel="Ninguno"
            placeholder="Vincular a un juego"
          />
        </Field>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              await onSave({ name: name.trim(), description, gameId });
              onOpenChange(false);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
