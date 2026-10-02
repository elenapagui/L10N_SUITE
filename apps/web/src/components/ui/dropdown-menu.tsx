import * as React from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof M.Content>,
  React.ComponentPropsWithoutRef<typeof M.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <M.Portal>
    <M.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className,
      )}
      {...props}
    />
  </M.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof M.Item>,
  React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <M.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
      destructive && 'text-destructive focus:text-destructive',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof M.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof M.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <M.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <M.ItemIndicator>
        <Check className="size-4" />
      </M.ItemIndicator>
    </span>
    {children}
  </M.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}
