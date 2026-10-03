import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  CORPUS_LANGS,
  formatNumber,
  koreanPosLabel,
  langLabel,
  type CorpusFilters,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ChartFrame, HBarList } from '@/features/finance/charts';
import { Stat } from '@/features/work/shared';
import { FiltersPanel } from './FiltersPanel';
import { useCorpusStats, useFrequencies, useMorphStatus } from './hooks';
import { MorphPanel } from './MorphPanel';

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; segments: number; games: number }[];
}) {
  return (
    <ChartFrame
      title={title}
      description="Segmentos"
      table={
        <Table>
          <THead>
            <TR>
              <TH>{title}</TH>
              <TH className="text-right">Segmentos</TH>
              <TH className="text-right">Juegos</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD>{r.label}</TD>
                <TD className="text-right tabular-nums">{formatNumber(r.segments, 0)}</TD>
                <TD className="text-right tabular-nums">{r.games}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      <HBarList
        rows={rows.map((r) => ({
          key: r.key,
          label: r.label,
          value: r.segments,
          hint: `${r.games} juegos`,
        }))}
        format={(v) => formatNumber(v, 0)}
      />
    </ChartFrame>
  );
}

/** CSV sencillo (con comillas cuando hace falta). */
function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c)))
        .join(','),
    )
    .join('\r\n');
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function FrequencyList({ filters, langs }: { filters: CorpusFilters; langs: string[] }) {
  const [lang, setLang] = useState(langs[0] ?? 'ko');
  const [stopwords, setStopwords] = useState(true);
  const [minLength, setMinLength] = useState(1);
  const [unit, setUnit] = useState<'word' | 'lemma'>('word');
  const byLemma = lang === 'ko' && unit === 'lemma';
  const morph = useMorphStatus();
  const lemmaReady = Boolean(morph.data?.installed && morph.data.analyzed > 0);
  const q = useFrequencies(lang, filters, {
    limit: 500,
    minLength: byLemma ? 1 : minLength,
    stopwords,
    unit: byLemma && lemmaReady ? 'lemma' : 'word',
  });
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-medium">Lista de frecuencias</h2>
          <p className="text-xs text-muted-foreground">
            {byLemma
              ? 'Lemas con su categoría (análisis morfológico)'
              : lang === 'ko'
                ? 'Eojeol (unidades entre espacios)'
                : 'Palabras en minúsculas'}
            ; las 500 más frecuentes.
          </p>
        </div>
        <NativeSelect
          className="h-8 w-36"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          aria-label="Idioma"
        >
          {(langs.length ? langs : CORPUS_LANGS.map((l) => l.value)).map((l) => (
            <option key={l} value={l}>
              {langLabel(l)}
            </option>
          ))}
        </NativeSelect>
        {lang === 'ko' && (
          <NativeSelect
            className="h-8 w-44"
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'word' | 'lemma')}
            aria-label="Unidad"
            data-testid="freq-unit"
          >
            <option value="word">Eojeol</option>
            <option value="lemma">Lemas (morfología)</option>
          </NativeSelect>
        )}
        {!byLemma && (
          <NativeSelect
            className="h-8 w-40"
            value={String(minLength)}
            onChange={(e) => setMinLength(Number(e.target.value))}
            aria-label="Longitud mínima"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Cualquier longitud' : `${n}+ caracteres`}
              </option>
            ))}
          </NativeSelect>
        )}
        {(lang === 'es' || lang === 'en' || byLemma) && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={stopwords} onCheckedChange={(v) => setStopwords(v === true)} />
            {byLemma ? 'Sin partículas ni terminaciones' : 'Sin palabras vacías'}
          </label>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!q.data}
          onClick={() =>
            q.data &&
            download(
              `frecuencias-${lang}.csv`,
              toCSV([
                byLemma
                  ? ['Lema', 'Categoría', 'Frecuencia', 'Segmentos']
                  : ['Forma', 'Frecuencia', 'Segmentos'],
                ...q.data.rows.map((r) =>
                  byLemma
                    ? [r.token, koreanPosLabel(r.tag ?? ''), r.count, r.segments]
                    : [r.token, r.count, r.segments],
                ),
              ]),
            )
          }
        >
          <Download /> CSV
        </Button>
      </header>
      {byLemma && !lemmaReady ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Para contar lemas, descarga el analizador y espera a que termine el análisis (arriba, en
          «Análisis morfológico del coreano»).
        </p>
      ) : !q.data ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {formatNumber(q.data.tokens, 0)} ocurrencias · {formatNumber(q.data.types, 0)} formas
            distintas
            {q.data.tokens > 0 &&
              ` · proporción tipo/ocurrencia ${formatNumber(q.data.types / q.data.tokens, 3)}`}
          </p>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <THead>
                <TR>
                  <TH className="w-12 text-right">#</TH>
                  <TH>{byLemma ? 'Lema' : 'Forma'}</TH>
                  {byLemma && <TH>Categoría</TH>}
                  <TH className="text-right">Frecuencia</TH>
                  <TH className="text-right">Segmentos</TH>
                </TR>
              </THead>
              <TBody>
                {q.data.rows.map((r, i) => (
                  <TR key={`${r.token}/${r.tag ?? ''}`}>
                    <TD className="text-right text-muted-foreground tabular-nums">{i + 1}</TD>
                    <TD lang={lang} className="font-medium">
                      {r.token}
                    </TD>
                    {byLemma && (
                      <TD className="text-xs text-muted-foreground">
                        {koreanPosLabel(r.tag ?? '')}
                      </TD>
                    )}
                    <TD className="text-right tabular-nums">{formatNumber(r.count, 0)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(r.segments, 0)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}

export function StatsPanel() {
  const [filters, setFilters] = useState<CorpusFilters>({});
  const stats = useCorpusStats(filters);
  const s = stats.data;
  return (
    <div className="grid gap-4">
      <MorphPanel />
      <div className="flex items-center gap-2">
        <FiltersPanel value={filters} onChange={setFilters} />
        <span className="text-sm text-muted-foreground">
          Las estadísticas se calculan sobre el subcorpus filtrado.
        </span>
      </div>
      {!s ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4" data-testid="corpus-kpis">
            <Stat label="Juegos" value={s.games} />
            <Stat label="Documentos" value={formatNumber(s.documents, 0)} />
            <Stat label="Segmentos" value={formatNumber(s.segments, 0)} />
            <Stat label="Anotaciones" value={formatNumber(s.annotations, 0)} />
          </div>
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-medium">Por idioma</h2>
            <Table>
              <THead>
                <TR>
                  <TH>Idioma</TH>
                  <TH className="text-right">Textos</TH>
                  <TH className="text-right">Caracteres (sin espacios)</TH>
                  <TH className="text-right">Eojeol o palabras</TH>
                  <TH className="text-right">Formas distintas</TH>
                  <TH className="text-right">Media por segmento</TH>
                </TR>
              </THead>
              <TBody>
                {s.languages.map((l) => (
                  <TR key={l.lang}>
                    <TD className="font-medium">{langLabel(l.lang)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(l.texts, 0)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(l.characters, 0)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(l.tokens, 0)}{' '}
                      <span className="text-xs text-muted-foreground">{l.tokenLabel}</span>
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(l.types, 0)}</TD>
                    <TD className="text-right tabular-nums">
                      {l.texts ? formatNumber(l.tokens / l.texts, 1) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Distribution title="Tipo de texto" rows={s.byTextType} />
            <Distribution title="Género" rows={s.byGenre} />
            <Distribution title="Plataforma" rows={s.byPlatform} />
            <Distribution title="Año de lanzamiento" rows={s.byYear} />
            <Distribution title="Fase" rows={s.byPhase} />
            <Distribution title="Dirección de traducción" rows={s.byDirection} />
          </div>
          <FrequencyList filters={filters} langs={s.languages.map((l) => l.lang)} />
        </>
      )}
    </div>
  );
}
