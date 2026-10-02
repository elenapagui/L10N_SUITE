import * as React from 'react';
import { Checkbox as C, Switch as S, Tooltip as T, Separator as Sep } from 'radix-ui';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof C.Root>,
  React.ComponentPropsWithoutRef<typeof C.Root>
>(({ className, ...props }, ref) => (
  <C.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 cursor-pointer rounded-sm border border-input shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <C.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" strokeWidth={3} />
    </C.Indicator>
  </C.Root>
));
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof S.Root>,
  React.ComponentPropsWithoutRef<typeof S.Root>
>(({ className, ...props }, ref) => (
  <S.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className,
    )}
    {...props}
  >
    <S.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </S.Root>
));
Switch.displayName = 'Switch';

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={4}
          className="z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
}: {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <Sep.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-label="Cargando" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
