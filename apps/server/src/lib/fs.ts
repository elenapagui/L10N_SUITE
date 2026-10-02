import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Escribe un archivo de forma atómica: primero a un temporal y después renombra. */
export function writeFileAtomic(file: string, data: string | Buffer): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function removeIfExists(file: string): void {
  fs.rmSync(file, { force: true });
}

/** Nombre de archivo seguro para Windows y macOS. */
export function safeFileName(name: string, fallback = 'archivo'): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- los caracteres de control no son válidos en nombres de archivo
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  return cleaned === '' ? fallback : cleaned;
}

/** Comprueba que `target` está dentro de `root` (evita rutas con «..»). */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Renombra `src` sobre `dest`. En Windows un archivo recién cerrado puede seguir bloqueado
 * unos instantes (antivirus, indexador): se reintenta y, como último recurso, se copia.
 */
export function replaceFile(src: string, dest: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
      sleepSync(100);
    }
  }
  try {
    fs.copyFileSync(src, dest);
    fs.rmSync(src, { force: true });
  } catch {
    throw lastError;
  }
}
