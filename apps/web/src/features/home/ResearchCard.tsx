import { Link } from '@tanstack/react-router';
import { GraduationCap, Library } from 'lucide-react';
import { PUBLICATION_STATUSES, formatNumber } from '@l10n/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DueLabel } from '@/components/common/badges';
import { StatusBadge } from '@/features/academic/PublicationsPage';
import { usePublications } from '@/features/academic/hooks';
import { useCorpusProfiles } from '@/features/corpus/hooks';

const ACTIVE = new Set<string>(
  PUBLICATION_STATUSES.filter((s) => s.stage === 'writing' || s.stage === 'review').map(
    (s) => s.value,
  ),
);

/** Resumen de la investigación en el panel de inicio: publicaciones en curso y corpus. */
export function ResearchCard() {
  const pubs = usePublications();
  const corpus = useCorpusProfiles();
  const active = (pubs.data ?? [])
    .filter((p) => ACTIVE.has(p.status))
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  const profiles = corpus.data ?? [];
  const included = profiles.filter((p) => p.phase === 'included').length;
  const segments = profiles.reduce((s, p) => s + p.segmentCount, 0);
  if (!pubs.data?.length && !profiles.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Investigación</CardTitle>
        <CardDescription>Publicaciones en curso y estado del corpus.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 p-2 pt-0">
        {active.slice(0, 5).map((p) => (
          <Link
            key={p.id}
            to="/academico/publicaciones/$publicationId"
            params={{ publicationId: p.id }}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
            <StatusBadge status={p.status} />
            {p.deadline && <DueLabel date={p.deadline} className="w-24 text-right" />}
          </Link>
        ))}
        {pubs.data && active.length === 0 && (
          <p className="px-3 py-1 text-sm text-muted-foreground">Ninguna publicación en curso.</p>
        )}
        {profiles.length > 0 && (
          <Link
            to="/corpus"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <Library className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">
              Corpus: {profiles.length} {profiles.length === 1 ? 'juego' : 'juegos'} ({included}{' '}
              {included === 1 ? 'incluido' : 'incluidos'}) · {formatNumber(segments)} segmentos
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
