import { z } from 'zod';
import { ENTITY_TYPE_KEYS } from '../entities';
import { ISO_DATE_RE } from '../dates';

export const idSchema = z.string().min(1, 'Falta el identificador').max(64);

export const entityTypeSchema = z.enum(ENTITY_TYPE_KEYS as [string, ...string[]], {
  error: 'Tipo de ficha desconocido',
});

export const isoDateSchema = z.string().regex(ISO_DATE_RE, 'Fecha no válida (AAAA-MM-DD)');

export const isoDateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas');

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color no válido (formato #RRGGBB)');

/** Texto obligatorio, recortado. */
export const requiredText = (label: string, max = 500) =>
  z
    .string({ error: `${label}: campo obligatorio` })
    .trim()
    .min(1, `${label}: campo obligatorio`)
    .max(max, `${label}: máximo ${max} caracteres`);

/** Texto opcional: '' se convierte en null. */
export const optionalText = (max = 10_000) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => {
      if (v == null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    });

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Esquema para actualizaciones parciales (PATCH): todos los campos opcionales y SIN valores
 * por defecto. Con `.partial()` Zod 4 mantiene los `.default()`, y un PATCH que solo cambia
 * el título restablecería, por ejemplo, el estado de un encargo.
 */
export function patchSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): ReturnType<z.ZodObject<T>['partial']> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let f = field as z.ZodType;
    while (f instanceof z.ZodDefault) f = f.unwrap() as z.ZodType;
    shape[key] = f.optional();
  }
  return z.object(shape) as unknown as ReturnType<z.ZodObject<T>['partial']>;
}
