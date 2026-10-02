import { describe, expect, it } from 'vitest';
import {
  SearchSyntaxError,
  cleanSegmentText,
  compileCondition,
  countCharacters,
  kwic,
  matches,
  tokenize,
} from '.';

const cond = (
  query: string,
  mode: 'text' | 'word' | 'prefix' | 'wildcard' | 'regex' = 'text',
  lang = 'es',
) => compileCondition({ lang, mode, query, negate: false, caseSensitive: false });

describe('limpieza de textos del corpus', () => {
  it('quita etiquetas, conserva o sustituye variables y normaliza', () => {
    const raw = '<color=#ff0000>¡Hola,</color> {0}!\\n¿Tienes %d [b]monedas[/b]?  ';
    expect(
      cleanSegmentText(raw, { markup: 'strip', variables: 'keep', literalNewlines: true }),
    ).toEqual({
      text: '¡Hola, {0}!\n¿Tienes %d monedas?',
      markupRemoved: 4,
      variables: 2,
    });
    expect(
      cleanSegmentText(raw, { markup: 'keep', variables: 'placeholder', literalNewlines: false })
        .text,
    ).toBe('<color=#ff0000>¡Hola,</color> ⟨VAR⟩!\\n¿Tienes ⟨VAR⟩ [b]monedas[/b]?');
    // Hangul en NFD (jamos sueltos) → NFC (sílabas)
    expect(
      cleanSegmentText('마법', { markup: 'keep', variables: 'keep', literalNewlines: true })
        .text,
    ).toBe('마법');
  });
});

describe('recuentos', () => {
  it('eojeol en coreano y palabras en español', () => {
    expect(tokenize('마법사가 던전에 들어갔다. "좋아!"', 'ko')).toEqual([
      '마법사가',
      '던전에',
      '들어갔다',
      '좋아',
    ]);
    expect(tokenize('¡El hechicero entró en la mazmorra, ¿no?', 'es')).toEqual([
      'el',
      'hechicero',
      'entró',
      'en',
      'la',
      'mazmorra',
      'no',
    ]);
    expect(tokenize("It's the player's turn", 'en')).toEqual(["it's", 'the', "player's", 'turn']);
    expect(countCharacters('마법사 가')).toBe(4);
  });
});

describe('búsqueda del concordanciador', () => {
  it('contiene: sin distinguir mayúsculas ni tildes', () => {
    const c = cond('cancion');
    expect(matches('La CANCIÓN del héroe', c.regex)).toBe(true);
    expect(c.ftsLiteral).toBe('cancion');
    expect(cond('niño').regex.test('NINO')).toBe(true);
  });
  it('palabra completa y comienzo de palabra (útil en coreano)', () => {
    expect(matches('la habilidad especial', cond('habilidad', 'word').regex)).toBe(true);
    expect(matches('las habilidades', cond('habilidad', 'word').regex)).toBe(false);
    const ko = cond('마법사', 'prefix', 'ko');
    expect(kwic('그 마법사가 웃었다', ko.regex, 10).map((k) => k.match)).toEqual(['마법사가']);
    expect(matches('흑마법사', ko.regex)).toBe(false);
  });
  it('comodines y expresiones regulares', () => {
    const w = cond('habilidad*', 'wildcard');
    expect(kwic('Una habilidad y dos habilidades', w.regex, 5).map((k) => k.match)).toEqual([
      'habilidad',
      'habilidades',
    ]);
    expect(w.ftsLiteral).toBe('habilidad');
    expect(kwic('poción, pocima', cond('poci?n', 'wildcard').regex, 5).map((k) => k.match)).toEqual(
      ['poción'],
    );
    const r = cond('\\d+ (monedas|oro)', 'regex');
    expect(kwic('Ganas 50 monedas y 3 oro', r.regex, 5).map((k) => k.match)).toEqual([
      '50 monedas',
      '3 oro',
    ]);
    expect(r.ftsLiteral).toBeNull();
    expect(() => cond('(sin cerrar', 'regex')).toThrow(SearchSyntaxError);
    expect(() => cond('a*', 'regex')).toThrow(SearchSyntaxError);
  });
  it('KWIC con contexto a cada lado y búsquedas cortas', () => {
    const lines = kwic(
      'El hechicero lanzó un hechizo al hechicero rival',
      cond('hechicero').regex,
      8,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ left: 'El ', match: 'hechicero', right: ' lanzó u' });
    expect(lines[1]!.left).toBe('hizo al ');
    const short = cond('마법', 'text', 'ko');
    expect(short.ftsLiteral).toBeNull();
    expect(short.likeLiteral).toBe('마법');
  });
});
