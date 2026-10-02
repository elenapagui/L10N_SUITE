import { useState } from 'react';
import { Plus } from 'lucide-react';
import { addDaysISO, todayISO } from '@l10n/shared';
import { Input } from '@/components/ui/input';
import { useApiMutation } from '@/hooks/work';
import { api } from '@/lib/api';

/**
 * Alta rápida: escribe y pulsa Intro. Reconoce «hoy», «mañana» y «!» (urgente) al final.
 * Ejemplo: «Enviar consultas mañana !»
 */
export function parseQuickTask(text: string): {
  title: string;
  dueDate: string | null;
  priority?: number;
} {
  let title = text.trim();
  let dueDate: string | null = null;
  let priority: number | undefined;
  if (/\s!+$/.test(title)) {
    priority = 1;
    title = title.replace(/\s!+$/, '');
  }
  const today = todayISO();
  const rules: [RegExp, string][] = [
    [/\s+(hoy)$/i, today],
    [/\s+(mañana|manana)$/i, addDaysISO(today, 1)],
    [/\s+(pasado mañana|pasado manana)$/i, addDaysISO(today, 2)],
  ];
  for (const [re, date] of rules) {
    if (re.test(title)) {
      dueDate = date;
      title = title.replace(re, '');
      break;
    }
  }
  return { title: title.trim(), dueDate, priority };
}

export function TaskQuickAdd({
  defaults = {},
  placeholder = 'Nueva tarea… (Intro para añadir; «hoy», «mañana» y «!» al final)',
}: {
  defaults?: Record<string, string | null | undefined>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const create = useApiMutation(
    (body: Record<string, unknown>) => api('/tasks', { method: 'POST', body }),
    { onSuccess: () => setText('') },
  );
  return (
    <form
      className="flex items-center gap-2 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseQuickTask(text);
        if (!parsed.title) return;
        create.mutate({
          ...defaults,
          ...parsed,
          dueDate: parsed.dueDate ?? defaults.dueDate ?? null,
        });
      }}
    >
      <Plus className="size-4 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        data-testid="task-quick-add"
      />
    </form>
  );
}
