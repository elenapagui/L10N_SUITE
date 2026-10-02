import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const EMOJIS = [
  '📄',
  '📝',
  '📘',
  '📗',
  '📕',
  '📙',
  '📚',
  '📖',
  '🗂️',
  '📁',
  '📌',
  '📎',
  '✅',
  '☑️',
  '⭐',
  '🔥',
  '💡',
  '⚠️',
  '❓',
  '❗',
  '🎯',
  '🚀',
  '🧪',
  '🛠️',
  '🎮',
  '🕹️',
  '👾',
  '⚔️',
  '🛡️',
  '🧙',
  '🐉',
  '🏰',
  '🗺️',
  '💎',
  '🎲',
  '🏆',
  '🇰🇷',
  '🇪🇸',
  '🇬🇧',
  '🌐',
  '💬',
  '🗣️',
  '✍️',
  '🔤',
  '🈶',
  '📏',
  '🔍',
  '🧭',
  '💶',
  '💰',
  '🧾',
  '📊',
  '📈',
  '🗓️',
  '⏰',
  '📅',
  '🤝',
  '📞',
  '✉️',
  '🏷️',
  '🎓',
  '🔬',
  '📑',
  '🧠',
  '🌱',
  '🎨',
  '🎵',
  '🎬',
  '📷',
  '🖥️',
  '📱',
  '❤️',
];

/** Selector de icono (emoji) para páginas y tablas. */
export function EmojiPicker({
  value,
  onChange,
  children,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const pick = (e: string | null) => {
    onChange(e);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid grid-cols-12 gap-0.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`rounded p-1 text-lg leading-none hover:bg-accent ${e === value ? 'bg-accent' : ''}`}
              onClick={() => pick(e)}
              aria-label={`Icono ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="Otro emoji…"
            value={custom}
            maxLength={8}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) pick(custom.trim());
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => pick(null)}>
            Quitar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
