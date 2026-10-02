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
