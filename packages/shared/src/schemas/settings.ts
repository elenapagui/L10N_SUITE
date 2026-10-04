import { z } from 'zod';

export const profileSettingsSchema = z.object({
  displayName: z.string().max(200).default(''),
  businessName: z.string().max(200).default(''),
  taxId: z.string().max(50).default(''),
  address: z.string().max(500).default(''),
  email: z.string().max(200).default(''),
  phone: z.string().max(50).default(''),
  website: z.string().max(200).default(''),
  iban: z.string().max(50).default(''),
});

export const preferenceSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  baseCurrency: z.string().length(3).default('EUR'),
  defaultVatPct: z.number().min(0).max(100).default(21),
  defaultIrpfPct: z.number().min(0).max(100).default(15),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  workingLanguages: z.array(z.string().min(2).max(8)).default(['ko', 'es', 'en']),
  defaultSourceLang: z.string().min(2).max(8).default('ko'),
  defaultTargetLang: z.string().min(2).max(8).default('es'),
  notifications: z.boolean().default(true),
  /** Tipos de cambio aproximados para las previsiones: 1 unidad de la moneda = X de la principal. */
  fxRates: z.record(z.string().length(3), z.number().positive().max(1_000_000)).default({}),
  /** Días sin respuesta tras los que se avisa para escribir de nuevo a una empresa. */
  applicationFollowUpDays: z.number().int().min(1).max(90).default(10),
  /** Hora de entrega habitual de los encargos (se pone sola al elegir la fecha); '' = ninguna. */
  defaultDueTime: z
    .string()
    .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/)
    .default('23:59'),
});

export const backupSettingsSchema = z.object({
  /** Carpeta de destino de las copias. null = carpeta por defecto dentro de los datos de la app. */
  directory: z.string().max(1000).nullable().default(null),
  keepDaily: z.number().int().min(1).max(60).default(7),
  keepWeekly: z.number().int().min(0).max(52).default(4),
  keepMonthly: z.number().int().min(0).max(120).default(12),
  onClose: z.boolean().default(true),
});

export const settingsSchema = z.object({
  profile: profileSettingsSchema.default(profileSettingsSchema.parse({})),
  preferences: preferenceSettingsSchema.default(preferenceSettingsSchema.parse({})),
  backups: backupSettingsSchema.default(backupSettingsSchema.parse({})),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof Settings;
export const SETTINGS_SECTIONS = ['profile', 'preferences', 'backups'] as const;

export const settingsSectionSchemas = {
  profile: profileSettingsSchema,
  preferences: preferenceSettingsSchema,
  backups: backupSettingsSchema,
} as const;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});
