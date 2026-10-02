import { describe, expect, it } from 'vitest';
import {
  amountFromVolume,
  formatDateES,
  formatMoney,
  normalizeForSearch,
  pairLabel,
  parseDecimal,
  toRateMicros,
  addDaysISO,
  diffDaysISO,
} from './index';

describe('parseDecimal', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234.56', 1234.56],
    ['0,075', 0.075],
    ['0.075', 0.075],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['12', 12],
    ['  7,5 € ', 7.5],
    ['-3,25', -3.25],
  ])('%s → %d', (input, expected) => {
    expect(parseDecimal(input)).toBeCloseTo(expected, 10);
  });

  it('devuelve null con textos no numéricos', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
});

describe('dinero', () => {
  it('calcula importes sin errores de coma flotante', () => {
    // 12 345 palabras a 0,075 €/palabra = 925,875 € → 925,88 €
    expect(amountFromVolume(12_345, toRateMicros(0.075))).toBe(92_588);
    // 0,1 + 0,2 no debe dar 0,30000000000000004
    expect(amountFromVolume(3, toRateMicros(0.1))).toBe(30);
  });

  it('formatea en español', () => {
    expect(formatMoney(123456)).toBe('1234,56 €');
    expect(formatMoney(12345678)).toBe('123.456,78 €');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('normalizeForSearch', () => {
  it('quita tildes y mayúsculas', () => {
    expect(normalizeForSearch('Acción  ÉPICA')).toBe('accion epica');
  });

  it('conserva el hangul y lo recompone aunque llegue descompuesto', () => {
    const decomposed = '마법사'.normalize('NFD');
    expect(decomposed.length).toBeGreaterThan(3);
    expect(normalizeForSearch(decomposed)).toBe('마법사');
  });
});

describe('fechas e idiomas', () => {
  it('formatea y opera con fechas ISO', () => {
    expect(formatDateES('2026-10-02')).toBe('02/10/2026');
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDaysISO('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('muestra pares de idiomas', () => {
    expect(pairLabel('ko', 'es')).toBe('KO→ES');
  });
});
