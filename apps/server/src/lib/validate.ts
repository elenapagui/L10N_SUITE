import { z } from 'zod';
import { ValidationError } from './errors';

/**
 * Booleano de la URL («true», «false», «1», «0»). z.coerce.boolean() no sirve: convierte
 * cualquier texto no vacío, también «false», en verdadero.
 */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

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
