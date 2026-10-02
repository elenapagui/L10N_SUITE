import * as React from 'react';
import { Tabs as T } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof T.List>,
  React.ComponentPropsWithoutRef<typeof T.List>
>(({ className, ...props }, ref) => (
  <T.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof T.Trigger>,
  React.ComponentPropsWithoutRef<typeof T.Trigger>
>(({ className, ...props }, ref) => (
  <T.Trigger
    ref={ref}
    className={cn(
      'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-4',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof T.Content>,
  React.ComponentPropsWithoutRef<typeof T.Content>
>(({ className, ...props }, ref) => (
  <T.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
