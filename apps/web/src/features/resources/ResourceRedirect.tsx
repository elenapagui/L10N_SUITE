import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Spinner } from '@/components/ui/misc';
import { Page } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';

/** Abre la ficha del juego en la pestaña del término o personaje enlazado. */
export function ResourceRedirect() {
  const { kind, id } = useParams({ strict: false }) as { kind: string; id: string };
  const navigate = useNavigate();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const url = kind === 'personaje' ? `/characters/${id}` : `/glossary/${id}`;
    api<{ gameId: string }>(url)
      .then((r) =>
        navigate({
          to: '/trabajo/juegos/$gameId',
          params: { gameId: r.gameId },
          search: { tab: kind === 'personaje' ? 'personajes' : 'glosario' },
          replace: true,
        }),
      )
      .catch(() => setMissing(true));
  }, [kind, id, navigate]);
  return (
    <Page>
      {missing ? (
        <p className="text-muted-foreground">No se ha encontrado la ficha.</p>
      ) : (
        <Spinner />
      )}
    </Page>
  );
}
