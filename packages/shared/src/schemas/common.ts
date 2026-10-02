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
