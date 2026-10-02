import { z } from 'zod';
import { optionalText, patchSchema, requiredText } from '../schemas/common';

/** Recursos de cada juego: glosario y personajes. */
export const TERM_STATUSES = [
  { value: 'proposed', label: 'Propuesto' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'forbidden', label: 'Prohibido' },
] as const;
export type TermStatus = (typeof TERM_STATUSES)[number]['value'];

export const TERM_CATEGORIES = [
  { value: 'character', label: 'Personaje' },
  { value: 'place', label: 'Lugar' },
  { value: 'item', label: 'Objeto' },
  { value: 'skill', label: 'Habilidad' },
  { value: 'ui', label: 'Interfaz' },
  { value: 'mechanic', label: 'Mecánica' },
  { value: 'faction', label: 'Facción' },
  { value: 'monster', label: 'Enemigo' },
  { value: 'event', label: 'Evento' },
  { value: 'other', label: 'Otro' },
] as const;
export type TermCategory = (typeof TERM_CATEGORIES)[number]['value'];

export const glossaryTermInputSchema = z.object({
  gameId: z.string().min(1, 'Elige un juego').max(64),
  termKo: optionalText(500),
  termEs: optionalText(500),
  termEn: optionalText(500),
  category: z
    .enum(TERM_CATEGORIES.map((c) => c.value) as [TermCategory, ...TermCategory[]])
    .nullish(),
  status: z.enum(['proposed', 'approved', 'forbidden']).default('proposed'),
  context: optionalText(5000),
  source: optionalText(500),
  notes: optionalText(5000),
});
export const glossaryTermUpdateSchema = patchSchema(glossaryTermInputSchema.omit({ gameId: true }));

export interface GlossaryTerm {
  id: string;
  gameId: string;
  gameTitle: string | null;
  termKo: string | null;
  termEs: string | null;
  termEn: string | null;
  category: TermCategory | null;
  status: TermStatus;
  context: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const GRAMMATICAL_GENDERS = [
  { value: 'm', label: 'Masculino' },
  { value: 'f', label: 'Femenino' },
  { value: 'n', label: 'No binario / neutro' },
  { value: 'variable', label: 'Variable (lo elige el jugador)' },
  { value: 'unknown', label: 'Sin determinar' },
] as const;
export type GrammaticalGender = (typeof GRAMMATICAL_GENDERS)[number]['value'];

/** Cómo trata el personaje al jugador o a los demás en español. */
export const ADDRESS_FORMS = [
  { value: 'tu', label: 'Tú' },
  { value: 'usted', label: 'Usted' },
  { value: 'vos', label: 'Vos' },
  { value: 'mixed', label: 'Depende del interlocutor' },
] as const;
export type AddressForm = (typeof ADDRESS_FORMS)[number]['value'];

/** Nivel de habla en el original coreano. */
export const KO_SPEECH_LEVELS = [
  { value: 'banmal', label: '반말 (informal)' },
  { value: 'haeyo', label: '해요체 (cortés)' },
  { value: 'hamnida', label: '하십시오체 (formal)' },
  { value: 'mixed', label: 'Mixto' },
] as const;
export type KoSpeechLevel = (typeof KO_SPEECH_LEVELS)[number]['value'];

export const characterInputSchema = z.object({
  gameId: z.string().min(1, 'Elige un juego').max(64),
  nameKo: optionalText(200),
  nameEs: requiredText('Nombre en español', 200),
  nameEn: optionalText(200),
  gender: z.enum(['m', 'f', 'n', 'variable', 'unknown']).default('unknown'),
  addressForm: z.enum(['tu', 'usted', 'vos', 'mixed']).nullish(),
  koSpeechLevel: z.enum(['banmal', 'haeyo', 'hamnida', 'mixed']).nullish(),
  speechStyle: optionalText(5000),
  description: optionalText(10_000),
  notes: optionalText(10_000),
});
export const characterUpdateSchema = patchSchema(characterInputSchema.omit({ gameId: true }));

export interface Character {
  id: string;
  gameId: string;
  nameKo: string | null;
  nameEs: string;
  nameEn: string | null;
  gender: GrammaticalGender;
  addressForm: AddressForm | null;
  koSpeechLevel: KoSpeechLevel | null;
  speechStyle: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
