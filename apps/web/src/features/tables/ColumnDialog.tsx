import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  CHOICE_COLORS,
  COLUMN_TYPES,
  CURRENCIES,
  FORMULA_FUNCTIONS,
  RELATION_TARGETS,
  computeRows,
  todayISO,
  type ColumnChoice,
  type ColumnOptions,
  type ColumnType,
  type TableColumn,
  type TableRow,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CellDisplay, COLUMN_ICONS, newChoiceId } from './cells';
import { useTables } from './hooks';

function ChoicesEditor({
  choices,
  onChange,
}: {
  choices: ColumnChoice[];
  onChange: (c: ColumnChoice[]) => void;
}) {
  const update = (i: number, patch: Partial<ColumnChoice>) =>
    onChange(choices.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="grid gap-1.5">
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          <GripVertical className="size-4 text-muted-foreground/50" />
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="size-5 shrink-0 rounded-full border"
                style={{ background: c.color }}
                aria-label="Color"
              />
            </PopoverTrigger>
            <PopoverContent className="w-auto">
              <div className="flex gap-1.5">
                {CHOICE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'size-6 rounded-full border-2',
                      c.color === color ? 'border-foreground' : 'border-transparent',
                    )}
                    style={{ background: color }}
                    onClick={() => update(i, { color })}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            value={c.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className="h-8"
          />
          <div className="flex">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={i === 0}
              onClick={() =>
                onChange(
                  choices.map((x, j) =>
                    j === i - 1 ? choices[i]! : j === i ? choices[i - 1]! : x,
                  ),
                )
              }
              aria-label="Subir"
            >
              ↑
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => onChange(choices.filter((_, j) => j !== i))}
              aria-label="Quitar opción"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([
              ...choices,
              {
                id: newChoiceId(),
                label: `Opción ${choices.length + 1}`,
                color: CHOICE_COLORS[(choices.length + 1) % CHOICE_COLORS.length]!,
              },
            ])
          }
        >
          <Plus /> Opción
        </Button>
      </div>
    </div>
  );
}

/** Crear o editar una columna. */
export function ColumnDialog({
  open,
  onOpenChange,
  column,
  columns,
  tableId,
  sampleRow,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  column: TableColumn | null;
  columns: TableColumn[];
  tableId: string;
  sampleRow?: TableRow;
  onSave: (body: { name: string; type: ColumnType; options: ColumnOptions }) => Promise<void>;
}) {
  const tables = useTables();
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('text');
  const [options, setOptions] = useState<ColumnOptions>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(column?.name ?? '');
    setType(column?.type ?? 'text');
    setOptions(column?.options ?? {});
  }, [open, column]);

  const preview = useMemo(() => {
    if (type !== 'formula') return null;
    const draft: TableColumn = {
      id: column?.id ?? '__new',
      tableId,
      name: name || 'Nueva',
      type,
      options,
      width: null,
      position: 999,
    };
    const cols = [...columns.filter((c) => c.id !== draft.id), draft];
    const row = sampleRow ?? {
      id: 'x',
      tableId,
      values: {},
      position: 0,
      createdAt: '',
      updatedAt: '',
    };
    const [r] = computeRows(cols, [row], todayISO());
    return { column: draft, value: r!.computed[draft.id], error: r!.errors[draft.id] };
  }, [type, options, name, columns, column, tableId, sampleRow]);

  const changeType = (t: ColumnType) => {
    setType(t);
    if ((t === 'select' || t === 'multi_select') && !options.choices)
      setOptions({ ...options, choices: [] });
    if (t === 'currency' && !options.currency) setOptions({ ...options, currency: 'EUR' });
    if (t === 'relation' && !options.target) setOptions({ ...options, target: 'game' });
  };

  const typeChangeWarning =
    column && column.type !== type
      ? type === 'formula' || type === 'relation' || column.type === 'relation'
        ? 'Al cambiar a este tipo se vacían los valores actuales de la columna.'
        : 'Los valores se convierten al nuevo tipo; los que no encajen se vacían.'
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{column ? 'Editar columna' : 'Nueva columna'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              data-testid="column-name"
            />
          </Field>
          <Field label="Tipo">
            <NativeSelect
              value={type}
              onChange={(e) => changeType(e.target.value as ColumnType)}
              data-testid="column-type"
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {typeChangeWarning && (
          <p className="text-xs text-amber-700 dark:text-warning">{typeChangeWarning}</p>
        )}
        {(type === 'number' || type === 'percent' || type === 'currency' || type === 'formula') && (
          <div className="grid gap-4 sm:grid-cols-2">
            {type === 'currency' && (
              <Field label="Moneda">
                <NativeSelect
                  value={options.currency ?? 'EUR'}
                  onChange={(e) => setOptions({ ...options, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {type !== 'currency' && (
              <Field label="Decimales">
                <NativeSelect
                  value={String(options.decimals ?? 2)}
                  onChange={(e) => setOptions({ ...options, decimals: Number(e.target.value) })}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
        )}
        {(type === 'select' || type === 'multi_select') && (
          <Field label="Opciones">
            <ChoicesEditor
              choices={options.choices ?? []}
              onChange={(choices) => setOptions({ ...options, choices })}
            />
          </Field>
        )}
        {type === 'relation' && (
          <Field label="Relacionar con">
            <NativeSelect
              value={options.target ?? 'game'}
              onChange={(e) => setOptions({ ...options, target: e.target.value })}
            >
              <optgroup label="Fichas de la app">
                {RELATION_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Filas de otra tabla">
                {(tables.data ?? []).map((t) => (
                  <option key={t.id} value={`table:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </Field>
        )}
        {type === 'formula' && (
          <div className="grid gap-3">
            <Field
              label="Fórmula"
              hint="Columnas entre llaves; argumentos separados por «;»; decimales con punto."
            >
              <Textarea
                value={options.formula ?? ''}
                onChange={(e) => setOptions({ ...options, formula: e.target.value })}
                rows={3}
                className="font-mono text-sm"
                placeholder="{Palabras} * {Tarifa}"
                data-testid="column-formula"
              />
            </Field>
            <div className="flex flex-wrap gap-1">
              {columns
                .filter((c) => c.id !== column?.id)
                .map((c) => {
                  const Icon = COLUMN_ICONS[c.type];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
                      onClick={() =>
                        setOptions({ ...options, formula: `${options.formula ?? ''}{${c.name}}` })
                      }
                    >
                      <Icon className="size-3" /> {c.name}
                    </button>
                  );
                })}
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Funciones disponibles</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {FORMULA_FUNCTIONS.map((f) => (
                  <li key={f.name}>
                    <code className="font-semibold text-foreground">{f.name}</code> — {f.help}
                    <br />
                    <code>{f.example}</code>
                  </li>
                ))}
              </ul>
            </details>
            {preview && (
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {sampleRow ? 'Resultado en la primera fila:' : 'Resultado:'}
                </span>
                <CellDisplay
                  column={preview.column}
                  value={preview.value}
                  error={preview.error}
                  labels={{}}
                />
                {preview.error && <span className="text-xs text-destructive">{preview.error}</span>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ name: name.trim(), type, options });
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
            data-testid="column-save"
          >
            {column ? 'Guardar' : 'Añadir columna'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
