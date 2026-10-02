export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export function apiUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `./api${path}${qs ? `?${qs}` : ''}`;
}

/** Llamada al motor. Lanza ApiError con el mensaje (en español) que devuelve el servidor. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const init: RequestInit = { method, signal, headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined || (method !== 'GET' && method !== 'DELETE')) {
    init.body = JSON.stringify(body ?? {});
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path, query), init);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      'No hay conexión con el motor de la aplicación. Inténtalo de nuevo.',
      0,
      'sin_conexion',
    );
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const payload = (data ?? {}) as { message?: string; error?: string; details?: unknown };
    throw new ApiError(
      payload.message ?? `Error ${res.status}`,
      res.status,
      payload.error ?? 'desconocido',
      payload.details,
    );
  }
  return data as T;
}
