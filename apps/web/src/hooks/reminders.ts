import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Reminder } from '@l10n/shared';
import { api } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { router } from '@/router';
import { useSettings } from './core';

const STORAGE_KEY = 'l10n-avisos-mostrados';

function shownKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function remember(keys: Record<string, string>) {
  try {
    // Se conservan solo los avisos de los últimos 3 días.
    const limit = Date.now() - 3 * 86_400_000;
    const pruned = Object.fromEntries(
      Object.entries(keys).filter(([, at]) => Date.parse(at) > limit),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Sin almacenamiento local: los avisos podrían repetirse.
  }
}

/** Comprueba cada 5 minutos si hay entregas próximas o tareas vencidas y avisa una sola vez. */
export function useReminders() {
  const settings = useSettings();
  const enabled = settings.data?.preferences.notifications ?? false;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = async () => {
      try {
        const reminders = await api<Reminder[]>('/reminders');
        if (cancelled) return;
        const shown = shownKeys();
        for (const r of reminders) {
          if (shown[r.key]) continue;
          shown[r.key] = new Date().toISOString();
          if (desktop) void desktop.notify(r.title, r.body);
          toast(r.title, {
            description: r.body,
            duration: 10_000,
            action: { label: 'Ver', onClick: () => void router.navigate({ to: r.route as never }) },
          });
        }
        remember(shown);
      } catch {
        // Si el motor no responde, se reintenta en la siguiente comprobación.
      }
    };
    const first = setTimeout(() => void check(), 5_000);
    const interval = setInterval(() => void check(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [enabled]);
}
