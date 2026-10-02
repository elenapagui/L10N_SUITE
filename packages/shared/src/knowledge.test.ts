import { describe, expect, it } from 'vitest';
import {
  aggregate,
  applyView,
  blocksToPlainText,
  cellText,
  coerceText,
  computeRows,
  detectColumnType,
  evaluateFormula,
  extractMentions,
  formulaReferences,
  markdownToPlainText,
  type FormulaValue,
  type TableColumn,
  type TableRow,
} from '.';

const today = '2026-10-02';
const ev = (src: string, vars: Record<string, FormulaValue> = {}) =>
  evaluateFormula(
    src,
    (name) => {
      if (!(name in vars)) throw new Error(`No existe ${name}`);
      return vars[name]!;
    },
    { today },
  );

describe('fórmulas', () => {
  it('aritmética, precedencia y referencias', () => {
    expect(ev('1 + 2 * 3')).toEqual({ ok: true, value: 7 });
    expect(ev('(1 + 2) * 3')).toEqual({ ok: true, value: 9 });
    expect(ev('-2 ^ 2')).toEqual({ ok: true, value: -4 });
    expect(ev('{Palabras} * {Tarifa}', { Palabras: 1000, Tarifa: 0.08 })).toEqual({
      ok: true,
      value: 80,
    });
    expect(ev('[Palabras] / 2', { Palabras: 9 })).toEqual({ ok: true, value: 4.5 });
    expect(ev('0.1 + 0.2')).toEqual({ ok: true, value: 0.3 });
  });

  it('funciones en español y en inglés, con «;» o «,»', () => {
    expect(ev('SI({A} > 10; "alto"; "bajo")', { A: 12 })).toEqual({ ok: true, value: 'alto' });
    expect(ev('IF(A > 10, "alto", "bajo")', { A: 2 })).toEqual({ ok: true, value: 'bajo' });
    expect(ev('REDONDEAR(10 / 3; 2)')).toEqual({ ok: true, value: 3.33 });
    expect(ev('SUMA(1; 2; 3) + MAX(4, 9)')).toEqual({ ok: true, value: 15 });
    expect(ev('CONCAT({KO}; " → "; {ES})', { KO: '마법', ES: 'magia' })).toEqual({
      ok: true,
      value: '마법 → magia',
    });
    expect(ev('LARGO("마법사")')).toEqual({ ok: true, value: 3 });
    expect(ev('"a" & 1 & VERDADERO')).toEqual({ ok: true, value: 'a1VERDADERO' });
    expect(ev('Y(1 = 1; NO(FALSO))')).toEqual({ ok: true, value: true });
  });

  it('fechas: sumar días y diferencias', () => {
    expect(ev('{Entrega} + 30', { Entrega: '2026-01-15' })).toEqual({
      ok: true,
      value: '2026-02-14',
    });
    expect(ev('DIAS({Fin}; {Inicio})', { Fin: '2026-03-01', Inicio: '2026-02-01' })).toEqual({
      ok: true,
      value: 28,
    });
    expect(ev('HOY() - 1')).toEqual({ ok: true, value: '2026-10-01' });
  });

  it('errores comprensibles', () => {
    expect(ev('1 / 0')).toEqual({ ok: false, error: 'División por cero' });
    expect(ev('NOEXISTE(1)')).toMatchObject({ ok: false, error: 'Función desconocida: NOEXISTE' });
    expect(ev('(1 + 2')).toMatchObject({ ok: false });
    expect(ev('"sin cerrar')).toMatchObject({ ok: false, error: 'Falta cerrar las comillas' });
    expect(formulaReferences('{A} + SI(B; {C D}; 0)').sort()).toEqual(['A', 'B', 'C D']);
  });
});

const col = (
  id: string,
  type: TableColumn['type'],
  extra: Partial<TableColumn> = {},
): TableColumn => ({
  id,
  tableId: 't',
  name: id,
  type,
  options: {},
  width: null,
  position: 0,
  ...extra,
});
const row = (id: string, values: TableRow['values'], position = 0): TableRow => ({
  id,
  tableId: 't',
  values,
  position,
  createdAt: '',
  updatedAt: '',
});

describe('tablas personalizadas', () => {
  it('detecta el tipo de las columnas al importar', () => {
    expect(detectColumnType(['12,5', '1.234,56', '', '7'])).toEqual({ type: 'number' });
    expect(detectColumnType(['15/03/2026', '1/4/2026'])).toEqual({ type: 'date' });
    expect(detectColumnType(['2026-03-15'])).toEqual({ type: 'date' });
    expect(detectColumnType(['21 %', '10%'])).toEqual({ type: 'percent' });
    expect(detectColumnType(['12,50 €', '3 €'])).toEqual({ type: 'currency', currency: 'EUR' });
    expect(detectColumnType(['sí', 'no', 'Sí'])).toEqual({ type: 'checkbox' });
    expect(detectColumnType(['https://a.es', 'http://b.com/x'])).toEqual({ type: 'url' });
    expect(detectColumnType(['RPG', 'Gacha', 'RPG', 'Acción', 'RPG', 'Gacha'])).toEqual({
      type: 'select',
    });
    expect(detectColumnType(['마법사', 'Hola, ¿qué tal?', '1'])).toEqual({ type: 'text' });
  });

  it('convierte el texto pegado y crea las opciones nuevas', () => {
    let n = 0;
    const id = () => `c${++n}`;
    const genre = col('g', 'multi_select', {
      options: { choices: [{ id: 'rpg', label: 'RPG', color: '#64748b' }] },
    });
    const r = coerceText(genre, 'rpg, Gacha', id);
    expect(r.value).toEqual(['rpg', 'c1']);
    expect(r.newChoices).toEqual([{ id: 'c1', label: 'Gacha', color: expect.any(String) }]);
    expect(coerceText(col('m', 'currency'), '1.234,50 €', id).value).toBe(123450);
    expect(coerceText(col('d', 'date'), '05/11/2026', id).value).toBe('2026-11-05');
    expect(coerceText(col('n', 'number'), 'abc', id)).toMatchObject({ invalid: true });
    expect(coerceText(col('b', 'checkbox'), 'x', id).value).toBe(true);
  });

  it('calcula fórmulas encadenadas, detecta referencias circulares y filtra y ordena', () => {
    const cols = [
      col('palabras', 'number', { name: 'Palabras' }),
      col('tarifa', 'currency', { name: 'Tarifa' }),
      col('importe', 'formula', { name: 'Importe', options: { formula: '{Palabras} * {Tarifa}' } }),
      col('iva', 'formula', {
        name: 'Con IVA',
        options: { formula: 'REDONDEAR({Importe} * 1.21; 2)' },
      }),
      col('x', 'formula', { name: 'X', options: { formula: '{Y} + 1' } }),
      col('y', 'formula', { name: 'Y', options: { formula: '{X} + 1' } }),
      col('estado', 'select', {
        name: 'Estado',
        options: {
          choices: [
            { id: 'a', label: 'Abierto', color: '#64748b' },
            { id: 'c', label: 'Cerrado', color: '#64748b' },
          ],
        },
      }),
    ];
    const rows = computeRows(
      cols,
      [
        row('1', { palabras: 1000, tarifa: 8, estado: 'a' }, 1),
        row('2', { palabras: 500, tarifa: 10, estado: 'c' }, 2),
        row('3', { palabras: null, tarifa: 10 }, 3),
      ],
      today,
    );
    expect(rows[0]!.computed.importe).toBe(80);
    expect(rows[0]!.computed.iva).toBe(96.8);
    expect(rows[0]!.errors.x).toMatch(/circular|Error/);
    expect(rows[2]!.computed.importe).toBe(0);

    const filtered = applyView(cols, rows, {
      filters: [{ columnId: 'estado', op: 'eq', value: 'c' }],
      filterMode: 'and',
      sorts: [],
      hidden: [],
      totals: {},
    });
    expect(filtered.map((r) => r.id)).toEqual(['2']);
    const sorted = applyView(cols, rows, {
      filters: [],
      filterMode: 'and',
      sorts: [{ columnId: 'palabras', dir: 'desc' }],
      hidden: [],
      totals: {},
    });
    // Las vacías van al final también en orden descendente.
    expect(sorted.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(
      applyView(
        cols,
        rows,
        { filters: [], filterMode: 'and', sorts: [], hidden: [], totals: {} },
        { search: 'cerr' },
      ).map((r) => r.id),
    ).toEqual(['2']);
    expect(
      aggregate(
        cols[1]!,
        rows.map((r) => r.computed.tarifa),
        'sum',
      ),
    ).toMatch(/0,28/);
    expect(
      aggregate(
        cols[0]!,
        rows.map((r) => r.computed.palabras),
        'empty',
      ),
    ).toBe('1');
    expect(cellText(cols[6]!, 'c')).toBe('Cerrado');
  });
});

describe('contenido de las páginas', () => {
  const blocks = [
    {
      type: 'heading',
      content: [{ type: 'text', text: 'Guía de estilo', styles: {} }],
      children: [],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Ver ', styles: {} },
        { type: 'mention', props: { entityType: 'game', entityId: 'g1', label: 'Aether' } },
        {
          type: 'link',
          href: 'https://x',
          content: [{ type: 'text', text: ' enlace', styles: {} }],
        },
      ],
      children: [
        {
          type: 'table',
          content: {
            type: 'tableContent',
            rows: [
              {
                cells: [
                  [{ type: 'text', text: '마법' }],
                  { type: 'tableCell', content: [{ type: 'text', text: 'magia' }] },
                ],
              },
            ],
          },
          children: [],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'mention', props: { entityType: 'game', entityId: 'g1', label: 'Aether' } },
      ],
    },
  ];
  it('extrae el texto y las menciones', () => {
    const text = blocksToPlainText(blocks);
    expect(text).toContain('Guía de estilo');
    expect(text).toContain('@Aether');
    expect(text).toContain('마법\tmagia');
    expect(extractMentions(blocks)).toEqual([{ entityType: 'game', entityId: 'g1' }]);
    expect(blocksToPlainText('no es una lista')).toBe('');
  });
  it('convierte Markdown en texto plano', () => {
    expect(markdownToPlainText('## Título\n\n- [ ] **Tarea** con [enlace](http://x)\n> cita')).toBe(
      'Título\n\nTarea con enlace\ncita',
    );
  });
});
