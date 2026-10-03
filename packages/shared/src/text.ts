/** Normaliza a NFC (forma compuesta). Imprescindible para el coreano: algunas fuentes
 *  (p. ej. nombres de archivo en macOS) entregan el hangul descompuesto en jamo. */
export function toNFC(value: string): string {
  return value.normalize('NFC');
}

/**
 * Texto normalizado para búsquedas: minúsculas, sin diacríticos latinos y en NFC.
 * El hangul se descompone en jamo con NFD, pero los jamo no son marcas combinantes,
 * así que se conservan y vuelven a componerse con el NFC final.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapa los comodines de LIKE (`%`, `_`) y el propio carácter de escape `\`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Recorta y convierte las cadenas vacías en null (útil para campos opcionales de formularios). */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** «1 juego», «3 juegos»: el número con la forma singular o plural. */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`;
}
