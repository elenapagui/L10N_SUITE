import path from 'node:path';

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Extensiones que no se abren directamente desde la app (por seguridad se muestran en la carpeta). */
export const EXECUTABLE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.ps1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.jar',
  '.scr',
  '.app',
  '.sh',
  '.command',
  '.pkg',
  '.dmg',
  '.lnk',
  '.reg',
  '.hta',
  '.cpl',
]);
