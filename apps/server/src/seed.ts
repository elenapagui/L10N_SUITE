/**
 * Datos de ejemplo para probar la aplicación: `npm run seed` (con L10N_DATA_DIR apuntando a
 * una carpeta de pruebas). No se usa nunca en la app de escritorio.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDaysISO, todayISO } from '@l10n/shared';
import { buildApp } from './app';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..', '..');

const app = await buildApp({
  dataDir: process.env.L10N_DATA_DIR ?? path.join(repoRoot, '.data'),
  migrationsDir: path.join(serverRoot, 'drizzle'),
  appVersion: 'seed',
});

async function post<T = { id: string }>(url: string, payload: unknown): Promise<T> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object });
  if (res.statusCode >= 300) throw new Error(`${url}: ${res.body}`);
  return res.json() as T;
}
async function patch(url: string, payload: unknown) {
  const res = await app.inject({ method: 'PATCH', url, payload: payload as object });
  if (res.statusCode >= 300) throw new Error(`${url}: ${res.body}`);
  return res.json();
}

const today = todayISO();
const d = (n: number) => addDaysISO(today, n);

await app.inject({
  method: 'PUT',
  url: '/api/settings/profile',
  payload: { displayName: 'Elena', businessName: 'Traducciones de ejemplo' },
});

const hangul = await post('/api/clients', {
  name: 'Hangul Localization Studio',
  kind: 'agency',
  country: 'Corea del Sur',
  currency: 'USD',
  irpfPct: 0,
  vatPct: 0,
  platform: 'memoQ server',
});
const pixel = await post('/api/clients', {
  name: 'Pixel Iberia Localización',
  kind: 'agency',
  country: 'España',
  currency: 'EUR',
  irpfPct: 15,
  vatPct: 21,
  platform: 'Phrase',
});
const moon = await post('/api/clients', {
  name: 'Moonlight Games',
  kind: 'studio',
  country: 'Corea del Sur',
  currency: 'USD',
  irpfPct: 0,
  vatPct: 0,
  platform: 'Hoja de cálculo',
});
await post('/api/contacts', {
  clientId: hangul.id,
  name: 'Ji-woo Park',
  role: 'PM',
  email: 'jiwoo@example.com',
  isPrimary: true,
});
await post('/api/contacts', {
  clientId: pixel.id,
  name: 'Marta Ruiz',
  role: 'PM',
  email: 'marta@example.com',
  isPrimary: true,
});
await post('/api/rates', {
  clientId: hangul.id,
  service: 'translation',
  unit: 'char',
  sourceLang: 'ko',
  targetLang: 'es',
  rateMicros: 35_000,
  currency: 'USD',
});
await post('/api/rates', {
  clientId: pixel.id,
  service: 'translation',
  unit: 'word',
  sourceLang: 'en',
  targetLang: 'es',
  rateMicros: 70_000,
  currency: 'EUR',
  minimumCents: 3000,
});
await post('/api/rates', {
  clientId: pixel.id,
  service: 'review',
  unit: 'hour',
  rateMicros: 30_000_000,
  currency: 'EUR',
});
await post('/api/rates', {
  clientId: moon.id,
  service: 'lqa',
  unit: 'hour',
  rateMicros: 28_000_000,
  currency: 'USD',
});

const aether = await post('/api/games', {
  title: 'Crónicas de Aether',
  originalTitle: '에테르 연대기',
  developer: 'Studio Haneul',
  releaseYear: 2025,
  genres: ['MMORPG'],
  platforms: ['PC', 'Android', 'iOS'],
  businessModel: 'gacha',
  pegi: 'PEGI 12',
});
const neon = await post('/api/games', {
  title: 'Neon Drift',
  originalTitle: '네온 드리프트',
  developer: 'Moonlight Games',
  releaseYear: 2026,
  genres: ['Carreras', 'Arcade'],
  platforms: ['PC', 'Nintendo Switch'],
  businessModel: 'premium',
  status: 'development',
});
const garden = await post('/api/games', {
  title: 'Jardín de Espíritus',
  originalTitle: '정령의 정원',
  developer: 'Bori Soft',
  releaseYear: 2024,
  genres: ['Simulación', 'Novela visual'],
  platforms: ['Android', 'iOS'],
  businessModel: 'f2p',
});

const pAether = await post('/api/projects', {
  name: 'Crónicas de Aether — live-ops KO→ES',
  clientId: hangul.id,
  gameId: aether.id,
  sourceLang: 'ko',
  targetLang: 'es',
  catTool: 'memoQ',
  color: '#6366f1',
  templateId: 'template-project-localization',
  startDate: d(0),
});
const pNeon = await post('/api/projects', {
  name: 'Neon Drift — localización y LQA',
  clientId: moon.id,
  gameId: neon.id,
  sourceLang: 'ko',
  targetLang: 'es',
  catTool: 'Hoja de cálculo',
  color: '#ec4899',
});
const pGarden = await post('/api/projects', {
  name: 'Jardín de Espíritus — EN→ES',
  clientId: pixel.id,
  gameId: garden.id,
  sourceLang: 'en',
  targetLang: 'es',
  catTool: 'Phrase',
  color: '#14b8a6',
});

const analysis = (n: number, m100: number, fuzzy: number, rep: number) => [
  { key: 'repetitions', count: rep, pct: 25 },
  { key: 'm100', count: m100, pct: 25 },
  { key: 'm85', count: fuzzy, pct: 70 },
  { key: 'new', count: n, pct: 100 },
];

const j1 = await post('/api/jobs', {
  projectId: pAether.id,
  title: 'Parche 2.4 — evento de otoño',
  unit: 'char',
  contentType: 'event',
  poNumber: 'HLS-2026-118',
  dueDate: d(2),
  dueTime: '10:00',
  catAnalysis: analysis(5200, 800, 1300, 600),
  templateId: 'template-job-standard',
});
await patch(`/api/jobs/${j1.id}`, { status: 'in_progress' });
const j2 = await post('/api/jobs', {
  projectId: pAether.id,
  title: 'Notas del parche 2.3',
  unit: 'char',
  contentType: 'patch_notes',
  poNumber: 'HLS-2026-104',
  dueDate: d(-8),
  volume: 2100,
});
await patch(`/api/jobs/${j2.id}`, { status: 'delivered', deliveredAt: d(-8) });
const j3 = await post('/api/jobs', {
  projectId: pAether.id,
  title: 'Nuevo personaje: Seo-yeon',
  unit: 'char',
  contentType: 'dialogue',
  dueDate: d(6),
  catAnalysis: analysis(3400, 0, 450, 120),
});
const j4 = await post('/api/jobs', {
  projectId: pNeon.id,
  title: 'LQA de la build 0.9',
  service: 'lqa',
  unit: 'hour',
  volume: 12,
  dueDate: d(0),
  dueTime: '18:00',
});
await patch(`/api/jobs/${j4.id}`, { status: 'in_progress' });
const j5 = await post('/api/jobs', {
  projectId: pGarden.id,
  title: 'Diálogos del capítulo 5',
  unit: 'word',
  contentType: 'dialogue',
  poNumber: 'PI-5531',
  dueDate: d(-1),
  volume: 4300,
});
await patch(`/api/jobs/${j5.id}`, { status: 'in_progress' });
const j6 = await post('/api/jobs', {
  projectId: pGarden.id,
  title: 'Ficha de tienda (Google Play)',
  unit: 'flat',
  contentType: 'store',
  rateMicros: 90_000_000,
  dueDate: d(-20),
});
await patch(`/api/jobs/${j6.id}`, { status: 'closed', billingStatus: 'paid' });

await post('/api/client-queries', {
  projectId: pAether.id,
  jobId: j1.id,
  stringId: 'EVT_AUTUMN_NPC_014',
  sourceText: '단풍 축제에 오신 걸 환영해요, 모험가님!',
  question:
    '«모험가님»: ¿tratamos al jugador de tú o de usted en este evento? En el anterior se usó «tú».',
  status: 'sent',
});
await post('/api/client-queries', {
  projectId: pAether.id,
  jobId: j3.id,
  stringId: 'CHR_SEOYEON_NAME',
  sourceText: '서연',
  question: '¿Se mantiene el nombre «Seo-yeon» con guion o «Seoyeon» como en el tráiler?',
  answer: 'Seo-yeon, con guion.',
  status: 'answered',
});

const admin = 'area-admin';
await post('/api/tasks', {
  title: 'Facturar el mes',
  areaId: admin,
  dueDate: d(5),
  recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'last_weekday' },
  priority: 2,
  checklist: ['Revisar encargos entregados', 'Emitir facturas', 'Registrar en L10N Suite'],
});
await post('/api/tasks', {
  title: 'Presentar el modelo 303 del trimestre',
  areaId: admin,
  dueDate: d(18),
  priority: 2,
});
await post('/api/tasks', {
  title: 'Renovar la licencia de memoQ',
  areaId: admin,
  dueDate: d(-2),
  priority: 1,
});
await post('/api/tasks', {
  title: 'Revisar la segunda versión del artículo sobre honoríficos',
  areaId: 'area-academic',
  dueDate: d(3),
});
await post('/api/tasks', {
  title: 'Alinear los diálogos de «Jardín de Espíritus»',
  areaId: 'area-corpus',
  dueDate: d(9),
  gameId: garden.id,
});
await post('/api/tasks', {
  title: 'Preparar glosario de habilidades de Aether',
  projectId: pAether.id,
  dueDate: d(1),
  priority: 2,
});

const start = new Date();
start.setHours(start.getHours() - 3, 0, 0, 0);
const end = new Date(start.getTime() + 95 * 60_000);
await post('/api/time-entries', {
  jobId: j1.id,
  startedAt: start.toISOString(),
  endedAt: end.toISOString(),
  note: 'Diálogos del evento',
});
const y1 = new Date(start.getTime() - 24 * 3_600_000);
await post('/api/time-entries', {
  jobId: j5.id,
  startedAt: y1.toISOString(),
  endedAt: new Date(y1.getTime() + 150 * 60_000).toISOString(),
});
await post('/api/time-entries', {
  jobId: j4.id,
  startedAt: new Date(y1.getTime() + 4 * 3_600_000).toISOString(),
  endedAt: new Date(y1.getTime() + 6 * 3_600_000).toISOString(),
  note: 'Pasada de LQA en Switch',
});

// Finanzas: encargos ya facturados de meses anteriores, una factura vencida y gastos.
const months = (n: number) => {
  const dt = new Date(`${today}T12:00:00`);
  dt.setMonth(dt.getMonth() - n, 10);
  return dt.toISOString().slice(0, 10);
};
const past = [
  { title: 'Diálogos del capítulo 2', volume: 18200, ago: 5, paidAfter: 34 },
  { title: 'Diálogos del capítulo 3', volume: 21400, ago: 4, paidAfter: 41 },
  { title: 'Diálogos del capítulo 4', volume: 16800, ago: 3, paidAfter: 29 },
  { title: 'Evento de San Valentín', volume: 7300, ago: 2, paidAfter: null },
];
let invoiceNo = 1;
for (const p of past) {
  const job = await post('/api/jobs', {
    projectId: pGarden.id,
    title: p.title,
    unit: 'word',
    contentType: 'dialogue',
    dueDate: months(p.ago),
    volume: p.volume,
  });
  await patch(`/api/jobs/${job.id}`, { status: 'delivered', deliveredAt: months(p.ago) });
  const issueDate = addDaysISO(months(p.ago), 18);
  const inv = await post('/api/invoices', {
    number: `${issueDate.slice(0, 4)}-${String(invoiceNo++).padStart(3, '0')}`,
    clientId: pixel.id,
    issueDate,
    jobIds: [job.id],
  });
  if (p.paidAfter != null) {
    await post(`/api/invoices/${inv.id}/pay`, { paidAt: addDaysISO(issueDate, p.paidAfter) });
  }
}
for (const [ago, concept, supplier, category, base, vat] of [
  [5, 'Licencia anual de memoQ', 'memoQ Ltd.', 'software', 62000, 21],
  [5, 'Cuota de autónomos', 'Seguridad Social', 'social_security', 29400, 0],
  [4, 'Cuota de autónomos', 'Seguridad Social', 'social_security', 29400, 0],
  [4, 'Congreso de traducción audiovisual', 'Universidad', 'training', 12000, 21],
  [3, 'Cuota de autónomos', 'Seguridad Social', 'social_security', 29400, 0],
  [3, 'Diccionario coreano-español', 'Librería', 'books', 3846, 4],
  [2, 'Cuota de autónomos', 'Seguridad Social', 'social_security', 29400, 0],
  [2, 'Gestoría (trimestre)', 'Asesoría', 'advisor', 9000, 21],
  [1, 'Cuota de autónomos', 'Seguridad Social', 'social_security', 29400, 0],
  [1, 'Fibra y móvil', 'Operadora', 'utilities', 4950, 21],
] as const) {
  await post('/api/expenses', {
    date: months(ago),
    concept,
    supplier,
    category,
    baseCents: base,
    vatPct: vat,
  });
}

for (const [name, color] of [
  ['Urgente', '#ef4444'],
  ['Gacha', '#a855f7'],
  ['NDA estricto', '#f97316'],
] as const) {
  await post('/api/tags', { name, color });
}

await app.close();
console.log('Datos de ejemplo creados.');
