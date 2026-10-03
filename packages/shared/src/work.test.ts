import { describe, expect, it } from 'vitest';
import {
  autoMap,
  parseDurationMinutes,
  parseFlexibleDate,
  splitList,
  DEFAULT_CAT_GRID,
  describeRecurrence,
  emptyAnalysis,
  jobAmount,
  nextOccurrence,
  nextRecurrenceRule,
  type RecurrenceRule,
  parseCatAnalysis,
  rawVolume,
  toRateMicros,
  weightedVolume,
} from './index';

describe('análisis CAT', () => {
  it('pondera el volumen con la rejilla', () => {
    const bands = emptyAnalysis(DEFAULT_CAT_GRID).map((b) =>
      b.key === 'new' ? { ...b, count: 1000 } : b.key === 'm100' ? { ...b, count: 400 } : b,
    );
    expect(rawVolume(bands)).toBe(1400);
    expect(weightedVolume(bands)).toBe(1100); // 1000 + 400 × 25 %
  });

  it('usa la rejilla del cliente', () => {
    const bands = emptyAnalysis({ m100: 0 });
    expect(bands.find((b) => b.key === 'm100')?.pct).toBe(0);
    expect(bands.find((b) => b.key === 'new')?.pct).toBe(100);
  });

  it('lee un análisis pegado desde Excel o el CAT', () => {
    const text = [
      'Context Match\t120',
      'Repetitions\t300',
      '100%\t500',
      '95% - 99%\t200',
      '85% - 94%\t100',
      '75% - 84%\t50',
      '50% - 74%\t30',
      'No Match\t1.234',
    ].join('\n');
    const bands = parseCatAnalysis(text);
    const get = (k: string) => bands.find((b) => b.key === k)?.count;
    expect(get('context')).toBe(120);
    expect(get('repetitions')).toBe(300);
    expect(get('m100')).toBe(500);
    expect(get('m95')).toBe(200);
    expect(get('m85')).toBe(100);
    expect(get('m75')).toBe(50);
    expect(get('m50')).toBe(30);
    expect(get('new')).toBe(1234);
  });

  it('aplica el mínimo de facturación', () => {
    expect(jobAmount({ volume: 100, rateMicros: toRateMicros(0.08), minimumCents: 3000 })).toBe(
      3000,
    );
    expect(jobAmount({ volume: 1000, rateMicros: toRateMicros(0.08), minimumCents: 3000 })).toBe(
      8000,
    );
    expect(jobAmount({ volume: null, rateMicros: 1 })).toBeNull();
  });
});

describe('recurrencia', () => {
  it('calcula la siguiente fecha', () => {
    expect(nextOccurrence('2026-10-02', { freq: 'daily', interval: 1 })).toBe('2026-10-03');
    expect(nextOccurrence('2026-10-02', { freq: 'weekly', interval: 2 })).toBe('2026-10-16');
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2028-02-29', { freq: 'yearly', interval: 1 })).toBe('2029-02-28');
  });

  it('vuelve al día 31 después de un mes más corto', () => {
    let date = '2026-01-31';
    let rule: RecurrenceRule = { freq: 'monthly', interval: 1, monthlyMode: 'same_day' };
    const dates: string[] = [];
    for (let i = 0; i < 4; i++) {
      const next = nextOccurrence(date, rule);
      rule = nextRecurrenceRule(date, rule);
      date = next;
      dates.push(date);
    }
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    // Si se cambia la fecha a mano a un día que no es fin de mes, manda la fecha nueva.
    expect(nextOccurrence('2026-06-15', rule)).toBe('2026-07-15');
  });

  it('salta al último día laborable del mes siguiente', () => {
    // Octubre de 2026 termina en sábado (31) → viernes 30; noviembre termina en lunes 30.
    expect(
      nextOccurrence('2026-09-30', { freq: 'monthly', interval: 1, monthlyMode: 'last_weekday' }),
    ).toBe('2026-10-30');
    expect(
      nextOccurrence('2026-10-30', { freq: 'monthly', interval: 1, monthlyMode: 'last_weekday' }),
    ).toBe('2026-11-30');
  });

  it('se describe en español', () => {
    expect(describeRecurrence({ freq: 'weekly', interval: 1 })).toBe('Cada semana');
    expect(describeRecurrence({ freq: 'monthly', interval: 3 })).toBe('Cada 3 meses');
    expect(describeRecurrence(null)).toBe('No se repite');
  });
});

describe('importación', () => {
  it('interpreta fechas en varios formatos', () => {
    expect(parseFlexibleDate('2026-10-02')).toBe('2026-10-02');
    expect(parseFlexibleDate('02/10/2026')).toBe('2026-10-02');
    expect(parseFlexibleDate('10/02/2026', 'mdy')).toBe('2026-10-02');
    expect(parseFlexibleDate('10/25/2026')).toBe('2026-10-25');
    expect(parseFlexibleDate('1790985600000')).toMatch(/^2026-10-0[23]$/);
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate('35/13/2026')).toBeNull();
  });

  it('interpreta duraciones', () => {
    expect(parseDurationMinutes('1h 30m')).toBe(90);
    expect(parseDurationMinutes('1:45')).toBe(105);
    expect(parseDurationMinutes('1,5 h')).toBe(90);
    expect(parseDurationMinutes('45')).toBe(45);
    expect(parseDurationMinutes('2 horas')).toBe(120);
  });

  it('separa listas y sugiere la asignación de columnas de ClickUp', () => {
    expect(splitList('[urgente, gacha]')).toEqual(['urgente', 'gacha']);
    const mapping = autoMap(
      [
        'Task ID',
        'Task Name',
        'Status',
        'Due Date',
        'List Name',
        'Space Name',
        'Tags',
        'Parent ID',
      ],
      'tasks',
    );
    expect(mapping).toMatchObject({
      title: 'Task Name',
      status: 'Status',
      dueDate: 'Due Date',
      list: 'List Name',
      area: 'Space Name',
      tags: 'Tags',
      externalId: 'Task ID',
      parentExternalId: 'Parent ID',
    });
  });
});
