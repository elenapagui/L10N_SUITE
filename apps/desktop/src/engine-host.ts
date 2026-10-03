import { utilityProcess, type UtilityProcess } from 'electron';
import type { EngineMessage, EngineResponse, EngineStatus } from './protocol';

interface Pending {
  resolve: (res: EngineResponse) => void;
  reject: (err: Error) => void;
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
  lastFatal: string | null = null;

  constructor(
    private readonly enginePath: string,
    private readonly env: Record<string, string>,
    private readonly onStatus: (status: EngineStatus) => void,
    private readonly log: (msg: string) => void,
  ) {}

  start(): void {
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
      this.onStatus('ready');
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
      this.onStatus('failed');
      for (const w of this.readyWaiters.splice(0))
        w.reject(new Error(this.lastFatal ?? 'El motor no arranca'));
      return;
    }
    this.restarts.push(now);
    this.onStatus('restarting');
    setTimeout(() => this.start(), 500 * this.restarts.length);
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

  async request(req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  }): Promise<EngineResponse> {
    await this.waitReady();
    const child = this.child;
    if (!child) throw new Error('El motor no está disponible');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
