/** Idiomas de trabajo (proyectos, tarifas y ajustes). El corpus tiene su propia lista. */
export const LANGUAGES = [
  { code: 'ko', label: 'Coreano' },
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export function languageLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

/**
 * Opciones para un selector de idioma. Si el valor guardado es un idioma que ya no está en
 * la lista (datos antiguos), se añade al final para no vaciar el campo sin querer.
 */
export function languageOptions(current?: string | null): { code: string; label: string }[] {
  const list: { code: string; label: string }[] = [...LANGUAGES];
  if (current && !list.some((l) => l.code === current))
    list.push({ code: current, label: `${current.toUpperCase()} (ya no disponible)` });
  return list;
}

/** «ko» + «es» → «KO→ES». */
export function pairLabel(
  source: string | null | undefined,
  target: string | null | undefined,
): string {
  if (!source && !target) return '—';
  return `${(source ?? '?').toUpperCase()}→${(target ?? '?').toUpperCase()}`;
}
