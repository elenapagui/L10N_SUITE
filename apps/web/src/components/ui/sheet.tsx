import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Panel lateral (para ver y editar una ficha sin salir de la lista). */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  headerActions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l bg-background shadow-2xl outline-none',
            className,
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <D.Title className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
              {title}
            </D.Title>
            {headerActions}
            <D.Close className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-4" />
              <span className="sr-only">Cerrar</span>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
