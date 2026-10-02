import { useEffect } from 'react';
import { useSettings } from './core';

export type Theme = 'system' | 'light' | 'dark';

export function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('l10n-theme', theme);
  } catch {
    // Sin almacenamiento local: el tema se aplicará al cargar los ajustes.
  }
}

/** Sincroniza el tema guardado en los ajustes con la interfaz (y con el del sistema). */
export function useThemeSync() {
  const { data } = useSettings();
  const theme = data?.preferences.theme;
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);
}
