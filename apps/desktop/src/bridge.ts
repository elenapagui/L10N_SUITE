import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { EngineTimeoutError, type EngineHost } from './engine-host';
import { isInside } from './paths';

export const APP_ORIGIN = 'app://l10n';

/** Debe llamarse antes de app.whenReady(). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

/**
 * app://l10n/api/... → motor (por mensajes, sin red).
 * app://l10n/...     → archivos de la interfaz compilada.
 */
export function handleAppProtocol(engine: EngineHost, webDir: string): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'l10n') return new Response('No encontrado', { status: 404 });

    if (url.pathname.startsWith('/api/')) {
      const method = request.method.toUpperCase();
      const body =
        method === 'GET' || method === 'HEAD'
          ? undefined
          : new Uint8Array(await request.arrayBuffer());
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      try {
        const res = await engine.request({ method, url: url.pathname + url.search, headers, body });
        const outHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (key === 'content-length' || key === 'transfer-encoding' || key === 'connection')
            continue;
          if (Array.isArray(value)) value.forEach((v) => outHeaders.append(key, v));
          else outHeaders.set(key, value);
        }
        return new Response(
          NULL_BODY_STATUS.has(res.status) ? null : (res.body as Uint8Array<ArrayBuffer>),
          {
            status: res.status,
            headers: outHeaders,
          },
        );
      } catch (error) {
        if (error instanceof EngineTimeoutError)
          return new Response(JSON.stringify({ error: 'tiempo_agotado', message: error.message }), {
            status: 504,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        return new Response(
          JSON.stringify({
            error: 'sin_motor',
            message: `El motor de la aplicación no responde: ${(error as Error).message}`,
          }),
          { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } },
        );
      }
    }

    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('No encontrado', { status: 404 });
    }
    if (rel === '/' || rel === '') rel = '/index.html';
    let file = path.join(webDir, ...rel.split('/').filter(Boolean));
    if (!isInside(webDir, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(webDir, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}
