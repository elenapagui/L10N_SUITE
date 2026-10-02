import * as React from 'react';
import { Popover as P } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof P.Content>,
  React.ComponentPropsWithoutRef<typeof P.Content>
>(({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
  <P.Portal>
    <P.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none',
        className,
      )}
      {...props}
    />
  </P.Portal>
));
PopoverContent.displayName = 'PopoverContent';
