import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster, toast } from 'sonner';
import { ConfirmProvider } from '@/components/ui/confirm';
import { TooltipProvider } from '@/components/ui/misc';
import { router } from './router';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
  },
  mutationCache: new MutationCache({
    // Cualquier error al guardar se muestra al usuario; las pantallas pueden añadir su propio manejo.
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.options.onError) toast.error(error.message);
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors closeButton />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
