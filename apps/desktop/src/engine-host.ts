import { utilityProcess, type UtilityProcess } from 'electron';
import type { EngineMessage, EngineResponse, EngineStatus } from './protocol';

interface Pending {
  resolve: (res: EngineResponse) => void;
  reject: (err: Error) => void;
}

/** Ninguna operación local debería tardar tanto; así una petición colgada no bloquea la interfaz. */
const REQUEST_TIMEOUT_MS = 5 * 60_000;

export class EngineTimeoutError extends Error {
  constructor() {
    super('La operación ha tardado demasiado y se ha cancelado la espera.');
  }
}

/**
 * Arranca y supervisa el motor. Si el proceso se cae, lo reinicia (hasta 5 veces por minuto)
 * y avisa a la interfaz para que muestre «Reconectando…».
 */
export class EngineHost {
  private child: UtilityProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private ready = false;
  private stopping = false;
  private restarts: number[] = [];
  private status: EngineStatus = 'restarting';
  lastFatal: string | null = null;

  constructor(
    private readonly enginePath: string,
    private readonly env: Record<string, string>,
    private readonly onStatus: (status: EngineStatus) => void,
    private readonly log: (msg: string) => void,
  ) {}

  get currentStatus(): EngineStatus {
    return this.status;
  }

  private setStatus(status: EngineStatus) {
    this.status = status;
    this.onStatus(status);
  }

  start(): void {
    // Durante el cierre no se vuelve a arrancar (por ejemplo, un reinicio programado).
    if (this.stopping || this.child) return;
    this.ready = false;
    const child = utilityProcess.fork(this.enginePath, [], {
      serviceName: 'L10N Suite (motor)',
      env: { ...process.env, ...this.env } as Record<string, string>,
      stdio: 'pipe',
    });
    this.child = child;
    child.stdout?.on('data', (d: Buffer) => this.log(`[motor] ${d.toString().trimEnd()}`));
    child.stderr?.on('data', (d: Buffer) => this.log(`[motor:error] ${d.toString().trimEnd()}`));
    child.on('message', (msg: EngineMessage) => this.onMessage(msg));
    child.on('exit', (code) => this.onExit(code));
  }

  private onMessage(msg: EngineMessage) {
    if (msg.type === 'ready') {
      this.ready = true;
      this.setStatus('ready');
      for (const w of this.readyWaiters.splice(0)) w.resolve();
    } else if (msg.type === 'fatal') {
      this.lastFatal = msg.message;
      this.log(`[motor] error fatal: ${msg.message}`);
    } else if (msg.type === 'response') {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  }

  private onExit(code: number) {
    this.ready = false;
    this.child = null;
    for (const p of this.pending.values()) p.reject(new Error('El motor se ha detenido'));
    this.pending.clear();
    if (this.stopping) return;
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < 60_000);
    this.log(`[motor] se ha detenido (código ${code})`);
    if (this.restarts.length >= 5) {
      this.setStatus('failed');
      for (const w of this.readyWaiters.splice(0))
        w.reject(new Error(this.lastFatal ?? 'El motor no arranca'));
      return;
    }
    this.restarts.push(now);
    this.setStatus('restarting');
    setTimeout(() => this.start(), 500 * this.restarts.length);
  }

  /** «Reintentar» tras un fallo: vuelve a arrancar el motor desde cero. */
  retry(): void {
    if (this.stopping || this.child || this.status !== 'failed') return;
    this.restarts = [];
    this.lastFatal = null;
    this.setStatus('restarting');
    this.start();
  }

  waitReady(timeoutMs = 60_000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('El motor tarda demasiado en arrancar')),
        timeoutMs,
      );
      this.readyWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  async request(
    req: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: Uint8Array;
    },
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<EngineResponse> {
    if (this.stopping) throw new Error('La aplicación se está cerrando');
    await this.waitReady();
    const child = this.child;
    if (!child) throw new Error('El motor no está disponible');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Si la respuesta llega después, se descarta.
        this.pending.delete(id);
        reject(new EngineTimeoutError());
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      child.postMessage({ type: 'request', id, ...req });
    });
  }

  /** Cierre ordenado: el motor hace la copia «al cerrar» y cierra la base de datos. */
  async stop(timeoutMs = 90_000): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, timeoutMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.postMessage({ type: 'shutdown' });
    });
  }
}
