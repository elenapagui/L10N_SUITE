import * as React from 'react';
import { AlertDialog as A } from 'radix-ui';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = React.createContext<(options: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);

/** Diálogo de confirmación asíncrono: `if (await confirm({...})) …` */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: Resolver }) | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <A.Root open={state !== null} onOpenChange={(open) => !open && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <A.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-xl">
            <A.Title className="text-lg font-semibold">{state?.title}</A.Title>
            {state?.description && (
              <A.Description asChild>
                <div className="text-sm text-muted-foreground">{state.description}</div>
              </A.Description>
            )}
            <div className="flex justify-end gap-2">
              <A.Cancel
                className={buttonVariants({ variant: 'outline' })}
                onClick={() => close(false)}
              >
                {state?.cancelLabel ?? 'Cancelar'}
              </A.Cancel>
              <A.Action
                className={cn(
                  buttonVariants({ variant: state?.destructive ? 'destructive' : 'default' }),
                )}
                onClick={() => close(true)}
              >
                {state?.confirmLabel ?? 'Aceptar'}
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}
