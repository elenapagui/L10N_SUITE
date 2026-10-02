import type { z } from 'zod';
import { ValidationError } from './errors';

/** Valida con Zod y lanza un error con mensajes en español si los datos no son válidos. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: i.path.map(String).join('.'),
    message: i.message,
  }));
  const first = issues[0];
  throw new ValidationError(first ? first.message : 'Datos no válidos', issues);
}
