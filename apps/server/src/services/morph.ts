import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import zlib from 'node:zlib';
import type { MorphStatus } from '@l10n/shared';
import type { AppContext } from '../context';
import { ValidationError } from '../lib/errors';
import { ensureDir, removeIfExists } from '../lib/fs';
import { newId } from '../lib/ids';

/**
 * Análisis morfológico del coreano con Kiwi (WebAssembly, licencia Apache-2.0).
 * El modelo (unos 90 MB) no va en el instalador: se descarga una vez desde Ajustes o el
 * corpus y se guarda en la carpeta de datos.
 */
export const KIWI_VERSION = '0.24.0';
const MODEL_URL = `https://github.com/bab2min/Kiwi/releases/download/v${KIWI_VERSION}/kiwi_model_v${KIWI_VERSION}_base.tgz`;
const MODEL_FILES = [
  'combiningRule.txt',
  'cong.mdl',
  'default.dict',
  'dialect.dict',
  'extract.mdl',
  'multi.dict',
  'nounchr.mdl',
  'sj.morph',
  'typo.dict',
];
const BATCH = 250;

/** Categorías de Kiwi (Sejong) que se agrupan para las listas de frecuencia. */
const PREDICATES = new Set(['VV', 'VA', 'VX', 'VCP', 'VCN']);

export interface KiwiToken {
  str: string;
  tag: string;
  position: number;
  length: number;
}
interface Kiwi {
  tokenize: (text: string) => KiwiToken[];
}

interface MorphRuntime {
  kiwi: Promise<Kiwi> | null;
  downloading: { received: number; total: number | null } | null;
  analyzing: { done: number; total: number } | null;
  /** Se ha pedido otro análisis mientras había uno en marcha. */
  again: boolean;
  error: string | null;
}
const runtimes = new WeakMap<AppContext, MorphRuntime>();
function runtime(ctx: AppContext): MorphRuntime {
  let r = runtimes.get(ctx);
  if (!r) {
    r = { kiwi: null, downloading: null, analyzing: null, again: false, error: null };
    runtimes.set(ctx, r);
  }
  return r;
}

export function modelDir(ctx: AppContext): string {
  return (
    process.env.L10N_KIWI_MODEL_DIR ??
    path.join(ctx.config.dataDir, 'modelos', `kiwi-${KIWI_VERSION}`)
  );
}

export function isModelInstalled(ctx: AppContext): boolean {
  const dir = modelDir(ctx);
  return MODEL_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}

/** Ruta del módulo WebAssembly: junto al motor en la app empaquetada o en node_modules. */
function wasmPath(): string {
  if (process.env.L10N_KIWI_WASM) return process.env.L10N_KIWI_WASM;
  const req = createRequire(path.join(process.cwd(), 'noop.js'));
  return req.resolve('kiwi-nlp/dist/kiwi-wasm.wasm');
}

/** Lema de un morfema: los verbos y adjetivos con «-다» (먹 → 먹다). */
export function lemmaOf(token: { str: string; tag: string }): string {
  return PREDICATES.has(token.tag) ? `${token.str}다` : token.str;
}

/** Morfemas que se guardan: todos menos la puntuación y los símbolos. */
function keep(tag: string): boolean {
  return !tag.startsWith('S') || tag === 'SL' || tag === 'SH' || tag === 'SN';
}

async function loadKiwi(ctx: AppContext): Promise<Kiwi> {
  const r = runtime(ctx);
  if (!isModelInstalled(ctx))
    throw new ValidationError(
      'Falta el analizador morfológico del coreano. Descárgalo en Corpus → Estadísticas → Análisis morfológico.',
    );
  r.kiwi ??= (async () => {
    const { KiwiBuilder } = (await import('kiwi-nlp')) as {
      KiwiBuilder: {
        create: (wasm: string) => Promise<{ build: (args: unknown) => Promise<Kiwi> }>;
      };
    };
    const builder = await KiwiBuilder.create(wasmPath());
    const dir = modelDir(ctx);
    const modelFiles = Object.fromEntries(
      MODEL_FILES.map((f) => [f, new Uint8Array(fs.readFileSync(path.join(dir, f)))]),
    );
    const started = Date.now();
    const kiwi = await builder.build({ modelFiles });
    ctx.logger.info({ ms: Date.now() - started }, 'Analizador morfológico cargado');
    return kiwi;
  })().catch((error: unknown) => {
    r.kiwi = null;
    throw error;
  });
  return r.kiwi;
}

/** Lee un .tar (ya descomprimido) y escribe los archivos del modelo en `dest`. */
function extractModel(tar: Buffer, dest: string) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(
      header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0',
      8,
    );
    const type = String.fromCharCode(header[156] ?? 48);
    const full = prefix ? `${prefix}/${name}` : name;
    offset += 512;
    if ((type === '0' || type === '\0') && MODEL_FILES.includes(path.basename(full)))
      fs.writeFileSync(path.join(dest, path.basename(full)), tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
}

/** Descarga e instala el modelo de Kiwi (una sola vez). */
export async function downloadModel(ctx: AppContext): Promise<void> {
  const r = runtime(ctx);
  if (r.downloading) return;
  if (isModelInstalled(ctx)) return;
  r.downloading = { received: 0, total: null };
  r.error = null;
  const tmp = path.join(ctx.config.tmpDir, `kiwi-${newId()}.tgz`);
  const staging = `${modelDir(ctx)}.${newId()}.parcial`;
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body)
      throw new Error(`No se ha podido descargar el modelo (HTTP ${res.status}).`);
    r.downloading.total = Number(res.headers.get('content-length')) || null;
    ensureDir(path.dirname(tmp));
    const out = fs.createWriteStream(tmp);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      r.downloading.received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((ok) => out.once('drain', () => ok()));
    }
    await new Promise<void>((ok, fail) =>
      out.end((err?: Error | null) => (err ? fail(err) : ok())),
    );
    ensureDir(staging);
    extractModel(zlib.gunzipSync(fs.readFileSync(tmp)), staging);
    if (!MODEL_FILES.every((f) => fs.existsSync(path.join(staging, f))))
      throw new Error('El archivo descargado no contiene el modelo completo.');
    ensureDir(path.dirname(modelDir(ctx)));
    fs.rmSync(modelDir(ctx), { recursive: true, force: true });
    fs.renameSync(staging, modelDir(ctx));
    ctx.logger.info('Modelo de Kiwi instalado');
  } catch (error) {
    r.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    r.downloading = null;
    removeIfExists(tmp);
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function pendingCount(ctx: AppContext): number {
  return (
    ctx.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM segment_texts st WHERE st.lang = 'ko'
         AND NOT EXISTS (SELECT 1 FROM segment_morph_done d WHERE d.segment_id = st.segment_id)`,
      )
      .get() as { n: number }
  ).n;
}

/**
 * Analiza en segundo plano los textos coreanos pendientes, por tandas, cediendo el turno entre
 * tandas para que la app siga respondiendo.
 */
export async function analyzePending(ctx: AppContext): Promise<void> {
  const r = runtime(ctx);
  if (r.analyzing || !isModelInstalled(ctx) || ctx.integrity !== 'ok' || ctx.maintenance) return;
  let total: number;
  try {
    total = pendingCount(ctx);
  } catch {
    return; // La base de datos se está cerrando o cambiando.
  }
  if (!total) return;
  r.analyzing = { done: 0, total };
  r.error = null;
  try {
    const kiwi = await loadKiwi(ctx);
    const select = ctx.sqlite.prepare(
      `SELECT st.segment_id AS id, st.text FROM segment_texts st WHERE st.lang = 'ko'
       AND NOT EXISTS (SELECT 1 FROM segment_morph_done d WHERE d.segment_id = st.segment_id)
       LIMIT ${BATCH}`,
    );
    const insert = ctx.sqlite.prepare(
      'INSERT INTO segment_morphs (segment_id, lemma, tag, start, end) VALUES (?, ?, ?, ?, ?)',
    );
    const done = ctx.sqlite.prepare(
      'INSERT OR REPLACE INTO segment_morph_done (segment_id, analyzed_at) VALUES (?, ?)',
    );
    for (;;) {
      if (ctx.maintenance) break;
      const rows = select.all() as { id: number; text: string }[];
      if (!rows.length) break;
      // Un texto que Kiwi no puede analizar se marca igualmente como analizado (sin lemas):
      // si no, se volvería a intentar siempre y bloquearía el resto.
      const analyzed = rows.map((row) => {
        try {
          return { id: row.id, tokens: kiwi.tokenize(row.text) };
        } catch (error) {
          ctx.logger.warn({ err: error, segmentId: row.id }, 'Kiwi no ha podido analizar un texto');
          return { id: row.id, tokens: [] as KiwiToken[] };
        }
      });
      const now = ctx.nowISO();
      ctx.sqlite.transaction(() => {
        for (const a of analyzed) {
          ctx.sqlite.prepare('DELETE FROM segment_morphs WHERE segment_id = ?').run(a.id);
          for (const t of a.tokens)
            if (keep(t.tag)) insert.run(a.id, lemmaOf(t), t.tag, t.position, t.position + t.length);
          done.run(a.id, now);
        }
      })();
      r.analyzing.done += rows.length;
      await new Promise((ok) => setImmediate(ok));
    }
  } catch (error) {
    r.error = error instanceof Error ? error.message : String(error);
    ctx.logger.warn({ err: error }, 'Falló el análisis morfológico');
  } finally {
    r.analyzing = null;
    if (r.again && !r.error) {
      r.again = false;
      setImmediate(() => void analyzePending(ctx));
    }
  }
}

/** Lanza el análisis sin esperar (tras importar textos o al instalar el modelo). */
export function kickAnalysis(ctx: AppContext): void {
  if (!isModelInstalled(ctx)) return;
  const r = runtime(ctx);
  if (r.analyzing) r.again = true;
  else void analyzePending(ctx);
}

/** Lema que se busca a partir de lo que escribe la usuaria («먹었다» o «먹다» → 먹다). */
export async function queryLemma(
  ctx: AppContext,
  query: string,
): Promise<{ lemma: string; tag: string }> {
  const kiwi = await loadKiwi(ctx);
  const tokens = kiwi.tokenize(query.trim().normalize('NFC'));
  const content = tokens.find((t) => /^(NN|NR|NP|VV|VA|VX|VC|MA|MM|XR|IC|SL|SH)/.test(t.tag));
  const t = content ?? tokens.find((t) => keep(t.tag));
  if (!t) throw new ValidationError('No se ha reconocido ninguna palabra en la búsqueda por lema.');
  return { lemma: lemmaOf(t), tag: t.tag };
}

export function morphStatus(ctx: AppContext): MorphStatus {
  const r = runtime(ctx);
  const counts = ctx.sqlite
    .prepare(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM segment_morph_done d WHERE d.segment_id = st.segment_id) THEN 1 ELSE 0 END) AS analyzed
       FROM segment_texts st WHERE st.lang = 'ko'`,
    )
    .get() as { total: number; analyzed: number | null };
  return {
    version: KIWI_VERSION,
    installed: isModelInstalled(ctx),
    downloading: r.downloading,
    analyzing: r.analyzing,
    total: counts.total,
    analyzed: counts.analyzed ?? 0,
    error: r.error,
  };
}
