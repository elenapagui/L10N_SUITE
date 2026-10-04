import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type {
  Client,
  Game,
  Job,
  Project,
  Task,
  TaskStatus,
  TimeEntry,
  ClientAccount,
} from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-10-02T10:00:00Z');

beforeEach(async () => {
  clock = new Date('2026-10-02T10:00:00Z');
  t = await createTestApp({ now: () => clock });
});

afterEach(async () => {
  await t.cleanup();
});

async function post<T>(url: string, payload: unknown, status = 201): Promise<T> {
  const res = await t.app.inject({ method: 'POST', url, payload: payload as object });
  expect(res.statusCode, res.body).toBe(status);
  return res.json() as T;
}

async function patch<T>(url: string, payload: unknown): Promise<T> {
  const res = await t.app.inject({ method: 'PATCH', url, payload: payload as object });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as T;
}

async function get<T>(url: string): Promise<T> {
  const res = await t.app.inject(url);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as T;
}

async function setup() {
  const client = await post<Client>('/api/clients', {
    name: 'Agencia Hangul',
    kind: 'agency',
    currency: 'EUR',
  });
  const game = await post<Game>('/api/games', {
    title: 'Crónicas del Dragón',
    originalTitle: '용의 연대기',
    genres: ['MMORPG'],
    platforms: ['PC', 'Android'],
  });
  const project = await post<Project>('/api/projects', {
    name: 'Crónicas — live-ops 2026',
    clientId: client.id,
    gameId: game.id,
    sourceLang: 'ko',
    targetLang: 'es',
  });
  return { client, game, project };
}

describe('clientes, contactos y tarifas', () => {
  it('crea clientes con contactos y un único contacto principal', async () => {
    const client = await post<Client>('/api/clients', { name: 'Estudio Seúl', kind: 'studio' });
    expect(client.active).toBe(true);
    await post('/api/contacts', { clientId: client.id, name: 'Ana', isPrimary: true });
    await post('/api/contacts', { clientId: client.id, name: 'Min-jun', isPrimary: true });
    const detail = await get<{ contacts: { name: string; isPrimary: boolean }[] }>(
      `/api/clients/${client.id}`,
    );
    expect(detail.contacts.filter((c) => c.isPrimary).map((c) => c.name)).toEqual(['Min-jun']);
  });

  it('lee «false» y «0» de la URL como falso', async () => {
    const off = await post<Client>('/api/clients', { name: 'Antigua agencia' });
    await patch(`/api/clients/${off.id}`, { active: false });
    await post('/api/clients', { name: 'Agencia activa' });
    const names = async (url: string) => (await get<Client[]>(url)).map((c) => c.name).sort();
    expect(await names('/api/clients')).toEqual(['Agencia activa', 'Antigua agencia']);
    expect(await names('/api/clients?includeInactive=false')).toEqual(['Agencia activa']);
    expect(await names('/api/clients?includeInactive=0')).toEqual(['Agencia activa']);
    const res = await t.app.inject('/api/clients?includeInactive=quizá');
    expect(res.statusCode).toBe(400);
  });

  it('guarda varios accesos de memoQ por cliente; la contraseña no se busca', async () => {
    const client = await post<Client>('/api/clients', { name: 'Hangul Loc' });
    const a = await post<ClientAccount>('/api/client-accounts', {
      clientId: client.id,
      label: 'Servidor principal',
      serverUrl: 'https://memoq.hangul-loc.example',
      username: 'traductora.es',
      password: 'S3creta!',
    });
    await post('/api/client-accounts', {
      clientId: client.id,
      tool: 'phrase',
      label: 'Proyecto Dragón',
      username: 'ana@ejemplo.es',
      password: 'otra',
    });
    const detail = await get<{ accounts: ClientAccount[] }>(`/api/clients/${client.id}`);
    expect(detail.accounts.map((x) => [x.tool, x.label, x.password])).toEqual([
      ['memoq', 'Servidor principal', 'S3creta!'],
      ['phrase', 'Proyecto Dragón', 'otra'],
    ]);
    // El servidor y el usuario se encuentran en la búsqueda global; la contraseña no.
    const byServer = await get<{ entityId: string }[]>('/api/search?q=hangul-loc');
    expect(byServer.some((r) => r.entityId === client.id)).toBe(true);
    expect(await get<unknown[]>('/api/search?q=S3creta')).toHaveLength(0);

    await patch(`/api/client-accounts/${a.id}`, { password: 'Nueva1' });
    const res = await t.app.inject({ method: 'DELETE', url: `/api/client-accounts/${a.id}` });
    expect(res.statusCode).toBe(200);
    expect(
      (await get<ClientAccount[]>(`/api/clients/${client.id}/accounts`)).map((x) => x.label),
    ).toEqual(['Proyecto Dragón']);
  });

  it('elige la tarifa más específica', async () => {
    const { client } = await setup();
    await post('/api/rates', { service: 'translation', unit: 'word', rateMicros: 60_000 });
    await post('/api/rates', {
      clientId: client.id,
      service: 'translation',
      unit: 'word',
      rateMicros: 70_000,
    });
    await post('/api/rates', {
      clientId: client.id,
      service: 'translation',
      unit: 'word',
      sourceLang: 'ko',
      targetLang: 'es',
      rateMicros: 80_000,
    });
    const res = await get<{ rate: { rateMicros: number } }>(
      `/api/rates/resolve?clientId=${client.id}&service=translation&unit=word&sourceLang=ko&targetLang=es`,
    );
    expect(res.rate.rateMicros).toBe(80_000);
    const other = await get<{ rate: { rateMicros: number } }>(
      `/api/rates/resolve?clientId=${client.id}&service=translation&unit=word&sourceLang=en&targetLang=es`,
    );
    expect(other.rate.rateMicros).toBe(70_000);
  });

  it('valida los datos con mensajes en español', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/clients', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Nombre');
  });
});

describe('encargos', () => {
  it('calcula el volumen ponderado y el importe con la tarifa del cliente', async () => {
    const { client, project } = await setup();
    await post('/api/rates', {
      clientId: client.id,
      service: 'translation',
      unit: 'char',
      sourceLang: 'ko',
      targetLang: 'es',
      rateMicros: 30_000, // 0,03 €/carácter
    });
    const job = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Parche 3.2',
      unit: 'char',
      catAnalysis: [
        { key: 'm100', count: 1000, pct: 25 },
        { key: 'm85', count: 2000, pct: 70 },
        { key: 'new', count: 5000, pct: 100 },
      ],
    });
    expect(job.volume).toBe(8000);
    expect(job.weightedVolume).toBe(6650);
    expect(job.rateMicros).toBe(30_000);
    expect(job.amountCents).toBe(19_950); // 6650 × 0,03 = 199,50 €
    expect(job.receivedAt).toBe('2026-10-02');
    expect(job.clientName).toBe('Agencia Hangul');

    const manual = await patch<Job>(`/api/jobs/${job.id}`, {
      amountManual: true,
      amountCents: 25_000,
    });
    expect(manual.amountCents).toBe(25_000);
    const auto = await patch<Job>(`/api/jobs/${job.id}`, { amountManual: false });
    expect(auto.amountCents).toBe(19_950);
  });

  it('aplica el mínimo de facturación y la tarifa plana', async () => {
    const { client, project } = await setup();
    await post('/api/rates', {
      clientId: client.id,
      service: 'review',
      unit: 'word',
      rateMicros: 20_000,
      minimumCents: 3000,
    });
    const small = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Revisión breve',
      service: 'review',
      volume: 100,
    });
    expect(small.amountCents).toBe(3000);
    const flat = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Ficha de tienda',
      unit: 'flat',
      rateMicros: 150_000_000,
    });
    expect(flat.amountCents).toBe(15_000);
  });

  it('marca la fecha de entrega y suma lo pendiente de facturar del cliente', async () => {
    const { client, project } = await setup();
    const job = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Evento de otoño',
      volume: 1000,
      rateMicros: 50_000,
    });
    const delivered = await patch<Job>(`/api/jobs/${job.id}`, { status: 'delivered' });
    expect(delivered.deliveredAt).toBe('2026-10-02');
    const c = await get<{ client: Client }>(`/api/clients/${client.id}`);
    expect(c.client.pendingBillingCents).toBe(5000);
  });

  it('crea las tareas de la plantilla con fechas relativas a la entrega', async () => {
    const { project } = await setup();
    const job = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Actualización 4.0',
      dueDate: '2026-10-10',
      templateId: 'template-job-standard',
    });
    const tasks = await get<Task[]>(`/api/tasks?jobId=${job.id}`);
    expect(tasks.map((x) => x.title)).toContain('Entregar');
    expect(tasks.find((x) => x.title === 'Entregar')?.dueDate).toBe('2026-10-10');
    expect(tasks.find((x) => x.title === 'Traducir')?.dueDate).toBe('2026-10-08');
    const qa = tasks.find((x) => x.title === 'Control de calidad (QA)')!;
    expect(qa.checklistCount).toBe(5);
    expect(qa.projectId).toBe(project.id);
    expect(qa.areaId).toBe('area-work');
  });
});

describe('actualizaciones parciales', () => {
  it('un PATCH solo cambia los campos enviados (no restablece valores por defecto)', async () => {
    const { client, project } = await setup();
    await patch(`/api/clients/${client.id}`, { kind: 'publisher', currency: 'USD', active: false });
    const renamed = await patch<Client>(`/api/clients/${client.id}`, {
      name: 'Agencia renombrada',
    });
    expect(renamed.kind).toBe('publisher');
    expect(renamed.currency).toBe('USD');
    expect(renamed.active).toBe(false);

    const job = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Original',
      service: 'lqa',
      unit: 'hour',
    });
    await patch(`/api/jobs/${job.id}`, { status: 'delivered', billingStatus: 'invoiced' });
    const after = await patch<Job>(`/api/jobs/${job.id}`, { title: 'Nuevo título' });
    expect(after.status).toBe('delivered');
    expect(after.billingStatus).toBe('invoiced');
    expect(after.service).toBe('lqa');
    expect(after.unit).toBe('hour');

    const tag = await post<{ id: string; color: string }>('/api/tags', {
      name: 'Roja',
      color: '#ff0000',
    });
    const tagAfter = await patch<{ color: string }>(`/api/tags/${tag.id}`, { name: 'Sigue roja' });
    expect(tagAfter.color).toBe('#ff0000');

    const status = await post<TaskStatus>('/api/task-statuses', {
      name: 'Hecha del todo',
      category: 'done',
    });
    const statusAfter = await patch<TaskStatus>(`/api/task-statuses/${status.id}`, {
      name: 'Terminada',
    });
    expect(statusAfter.category).toBe('done');
  });
});

describe('tareas', () => {
  it('se completan, se reabren y registran la fecha de finalización', async () => {
    const task = await post<Task>('/api/tasks', { title: 'Leer guía de estilo' });
    expect(task.statusCategory).toBe('todo');
    const done = await patch<{ task: Task }>(`/api/tasks/${task.id}`, { statusId: 'status-done' });
    expect(done.task.completedAt).toBe(clock.toISOString());
    const reopened = await patch<{ task: Task }>(`/api/tasks/${task.id}`, {
      statusId: 'status-doing',
    });
    expect(reopened.task.completedAt).toBeNull();
  });

  it('al completar una tarea que se repite crea la siguiente', async () => {
    const tag = await post<{ id: string }>('/api/tags', { name: 'Administración' });
    const task = await post<Task>('/api/tasks', {
      title: 'Facturar el mes',
      dueDate: '2026-10-30',
      recurrence: { freq: 'monthly', interval: 1, monthlyMode: 'last_weekday' },
      checklist: ['Revisar encargos entregados', 'Enviar facturas'],
    });
    await t.app.inject({
      method: 'PUT',
      url: '/api/taggings',
      payload: { entityType: 'task', entityId: task.id, tagIds: [tag.id] },
    });
    const res = await patch<{ task: Task; next: Task }>(`/api/tasks/${task.id}`, {
      statusId: 'status-done',
    });
    expect(res.task.recurrence).toBeNull();
    expect(res.next.dueDate).toBe('2026-11-30');
    expect(res.next.recurrence?.freq).toBe('monthly');
    expect(res.next.checklistCount).toBe(2);
    expect(res.next.checklistDoneCount).toBe(0);
    expect(res.next.tags.map((x) => x.name)).toEqual(['Administración']);
  });

  it('oculta las subtareas cuando la principal va a la papelera', async () => {
    const parent = await post<Task>('/api/tasks', { title: 'Preparar entrega' });
    await post<Task>('/api/tasks', { title: 'Comprobar etiquetas', parentId: parent.id });
    expect((await get<Task>(`/api/tasks/${parent.id}`)).subtaskCount).toBe(1);
    await t.app.inject({ method: 'DELETE', url: `/api/tasks/${parent.id}` });
    expect(await get<Task[]>('/api/tasks')).toHaveLength(0);
    await post('/api/trash/restore', { entityType: 'task', entityId: parent.id }, 200);
    expect(await get<Task[]>('/api/tasks')).toHaveLength(2);
  });

  it('filtra por vencidas y para hoy', async () => {
    await post('/api/tasks', { title: 'Ayer', dueDate: '2026-10-01' });
    await post('/api/tasks', { title: 'Hoy', dueDate: '2026-10-02' });
    await post('/api/tasks', { title: 'Mañana', dueDate: '2026-10-03' });
    expect((await get<Task[]>('/api/tasks?due=overdue')).map((x) => x.title)).toEqual(['Ayer']);
    expect((await get<Task[]>('/api/tasks?due=today')).map((x) => x.title)).toEqual(['Hoy']);
  });

  it('gestiona estados personalizados y mueve las tareas al borrar uno', async () => {
    const status = await post<TaskStatus>('/api/task-statuses', {
      name: 'Esperando al cliente',
      category: 'doing',
      color: '#eab308',
    });
    const task = await post<Task>('/api/tasks', {
      title: 'Consulta pendiente',
      statusId: status.id,
    });
    expect(task.statusName).toBe('Esperando al cliente');
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/task-statuses/${status.id}?moveTo=status-doing`,
    });
    expect(del.statusCode).toBe(200);
    expect((await get<Task>(`/api/tasks/${task.id}`)).statusId).toBe('status-doing');
    const last = await t.app.inject({
      method: 'DELETE',
      url: '/api/task-statuses/status-done?moveTo=status-todo',
    });
    expect(last.statusCode).toBe(409);
  });
});

describe('tiempo', () => {
  it('usa un único cronómetro y suma el tiempo al encargo', async () => {
    const { project } = await setup();
    const job = await post<Job>('/api/jobs', { projectId: project.id, title: 'Diálogos cap. 2' });
    const started = await post<{ running: TimeEntry }>('/api/timer/start', { jobId: job.id }, 200);
    expect(started.running.projectId).toBe(project.id);
    clock = new Date(clock.getTime() + 30 * 60_000);
    await post('/api/timer/start', { projectId: project.id }, 200);
    clock = new Date(clock.getTime() + 15 * 60_000);
    const stopped = await post<{ stopped: TimeEntry }>('/api/timer/stop', {}, 200);
    expect(stopped.stopped.durationSeconds).toBe(15 * 60);
    expect((await get<Job>(`/api/jobs/${job.id}`)).loggedSeconds).toBe(30 * 60);
    expect((await get<{ running: null }>('/api/timer')).running).toBeNull();
  });

  it('rechaza registros manuales con el fin antes del inicio', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/time-entries',
      payload: { startedAt: '2026-10-02T10:00:00Z', endedAt: '2026-10-02T09:00:00Z' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('consultas al cliente', () => {
  it('registra la respuesta y exporta la hoja de consultas en Excel', async () => {
    const { project } = await setup();
    const q = await post<{ id: string; status: string }>('/api/client-queries', {
      projectId: project.id,
      stringId: 'NPC_GREET_001',
      sourceText: '어서 오세요, 용사님!',
      question: '¿El héroe es hombre, mujer o se elige? Afecta a la concordancia.',
      status: 'sent',
    });
    const answered = await patch<{ status: string; answeredAt: string }>(
      `/api/client-queries/${q.id}`,
      {
        answer: 'Se elige al crear el personaje; usad formas neutras.',
      },
    );
    expect(answered.status).toBe('answered');
    expect(answered.answeredAt).toBe('2026-10-02');
    const res = await t.app.inject(`/api/client-queries/export?projectId=${project.id}`);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Consultas')!;
    expect(ws.getRow(2).getCell(3).value).toBe('NPC_GREET_001');
    expect(ws.getRow(2).getCell(4).value).toBe('어서 오세요, 용사님!');
  });
});

describe('panel, calendario y papelera', () => {
  it('reúne entregas, tareas e importes del día', async () => {
    const { project } = await setup();
    await post('/api/jobs', {
      projectId: project.id,
      title: 'Entrega próxima',
      dueDate: '2026-10-05',
      volume: 100,
      rateMicros: 100_000,
    });
    await post('/api/jobs', { projectId: project.id, title: 'Atrasado', dueDate: '2026-09-30' });
    const done = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Ya entregado',
      volume: 1000,
      rateMicros: 100_000,
    });
    await patch(`/api/jobs/${done.id}`, { status: 'delivered' });
    await post('/api/tasks', { title: 'Hoy', dueDate: '2026-10-02' });
    await post('/api/tasks', { title: 'Vencida', dueDate: '2026-09-01' });

    const d = await get<{
      upcomingJobs: Job[];
      overdueJobs: Job[];
      tasksToday: Task[];
      tasksOverdue: Task[];
      deliveredThisMonthCents: number;
      pendingBillingCents: number;
    }>('/api/dashboard');
    expect(d.upcomingJobs.map((j) => j.title)).toEqual(['Entrega próxima']);
    expect(d.overdueJobs.map((j) => j.title)).toEqual(['Atrasado']);
    expect(d.tasksToday.map((x) => x.title)).toEqual(['Hoy']);
    expect(d.tasksOverdue.map((x) => x.title)).toEqual(['Vencida']);
    expect(d.deliveredThisMonthCents).toBe(10_000);
    expect(d.pendingBillingCents).toBe(10_000);

    const events = await get<{ kind: string; title: string }[]>(
      '/api/calendar?from=2026-10-01&to=2026-10-31',
    );
    expect(events.map((e) => e.title)).toEqual(['Hoy', 'Entrega: Entrega próxima']);

    const reminders = await get<{ key: string }[]>('/api/reminders');
    expect(reminders.some((r) => r.key.startsWith('tasks:'))).toBe(true);
    expect(reminders.some((r) => r.key.includes(':retrasado:'))).toBe(true);
  });

  it('un proyecto en la papelera oculta sus encargos y tareas; al vaciarla se borran', async () => {
    const { project } = await setup();
    const job = await post<Job>('/api/jobs', {
      projectId: project.id,
      title: 'Encargo',
      templateId: 'template-job-standard',
    });
    expect((await get<Task[]>('/api/tasks')).length).toBeGreaterThan(0);
    await t.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}` });
    expect(await get<Job[]>('/api/jobs')).toHaveLength(0);
    expect(await get<Task[]>('/api/tasks')).toHaveLength(0);
    expect((await t.app.inject(`/api/jobs/${job.id}`)).statusCode).toBe(404);
    await post('/api/trash/purge', { entityType: 'project', entityId: project.id }, 200);
    const left = t.app.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('indexa las fichas para la búsqueda global', async () => {
    await setup();
    const results = await get<{ entityType: string; title: string }[]>(
      `/api/search?q=${encodeURIComponent('용의')}`,
    );
    expect(results.map((r) => r.entityType)).toContain('game');
    const projects = await get<{ entityType: string }[]>('/api/search?q=live-ops');
    expect(projects.map((r) => r.entityType)).toContain('project');
  });
});
