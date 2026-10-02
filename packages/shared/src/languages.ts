export const LANGUAGES = [
  { code: 'ko', label: 'Coreano' },
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' },
  { code: 'ja', label: 'Japonés' },
  { code: 'zh', label: 'Chino' },
  { code: 'fr', label: 'Francés' },
  { code: 'de', label: 'Alemán' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Portugués' },
  { code: 'ca', label: 'Catalán' },
  { code: 'gl', label: 'Gallego' },
  { code: 'eu', label: 'Euskera' },
  { code: 'ru', label: 'Ruso' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export function languageLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

/** «ko» + «es» → «KO→ES». */
export function pairLabel(
  source: string | null | undefined,
  target: string | null | undefined,
): string {
  if (!source && !target) return '—';
  return `${(source ?? '?').toUpperCase()}→${(target ?? '?').toUpperCase()}`;
}
