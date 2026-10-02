/** Listas de valores de la Fase 1 con sus etiquetas en español. */

function labels<const T extends readonly { value: string; label: string }[]>(items: T) {
  return items;
}

export const CLIENT_KINDS = labels([
  { value: 'agency', label: 'Agencia' },
  { value: 'studio', label: 'Estudio / desarrolladora' },
  { value: 'publisher', label: 'Editora' },
  { value: 'individual', label: 'Particular' },
  { value: 'other', label: 'Otro' },
] as const);

export const SERVICES = labels([
  { value: 'translation', label: 'Traducción' },
  { value: 'review', label: 'Revisión' },
  { value: 'lqa', label: 'LQA' },
  { value: 'transcreation', label: 'Transcreación' },
  { value: 'mtpe', label: 'Posedición (MTPE)' },
  { value: 'subtitling', label: 'Subtitulado' },
  { value: 'terminology', label: 'Terminología' },
  { value: 'consulting', label: 'Consultoría' },
  { value: 'other', label: 'Otro' },
] as const);

export const UNITS = labels([
  { value: 'word', label: 'Palabra' },
  { value: 'char', label: 'Carácter' },
  { value: 'hour', label: 'Hora' },
  { value: 'minute', label: 'Minuto' },
  { value: 'page', label: 'Página' },
  { value: 'flat', label: 'Tarifa plana' },
] as const);

export const UNIT_PLURALS: Record<string, string> = {
  word: 'palabras',
  char: 'caracteres',
  hour: 'horas',
  minute: 'minutos',
  page: 'páginas',
  flat: 'unidades',
};

export const CONTENT_TYPES = labels([
  { value: 'ui', label: 'Interfaz (UI)' },
  { value: 'dialogue', label: 'Diálogos' },
  { value: 'narrative', label: 'Narrativa / lore' },
  { value: 'items', label: 'Objetos y habilidades' },
  { value: 'tutorial', label: 'Tutoriales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'store', label: 'Ficha de tienda' },
  { value: 'patch_notes', label: 'Notas de parche' },
  { value: 'event', label: 'Evento / live-ops' },
  { value: 'subtitles', label: 'Subtítulos / cinemáticas' },
  { value: 'legal', label: 'Legal (EULA, privacidad)' },
  { value: 'mixed', label: 'Mixto' },
  { value: 'other', label: 'Otro' },
] as const);

export const GAME_STATUSES = labels([
  { value: 'development', label: 'En desarrollo' },
  { value: 'released', label: 'Publicado' },
  { value: 'end_of_service', label: 'Cierre de servicio' },
] as const);

export const BUSINESS_MODELS = labels([
  { value: 'premium', label: 'Premium' },
  { value: 'f2p', label: 'Free-to-play' },
  { value: 'gacha', label: 'Gacha' },
  { value: 'subscription', label: 'Suscripción' },
  { value: 'live_service', label: 'Juego como servicio' },
  { value: 'other', label: 'Otro' },
] as const);

export const GENRE_SUGGESTIONS = [
  'RPG',
  'MMORPG',
  'ARPG',
  'Acción',
  'Aventura',
  'Estrategia',
  'Puzle',
  'Simulación',
  'Deportes',
  'Carreras',
  'Lucha',
  'Shooter',
  'Novela visual',
  'Roguelike',
  'Battle royale',
  'MOBA',
  'Gestión',
  'Ritmo',
  'Terror',
  'Idle',
  'Casual',
];

export const PLATFORM_SUGGESTIONS = [
  'PC',
  'Steam',
  'PlayStation 5',
  'PlayStation 4',
  'Xbox Series',
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Android',
  'iOS',
  'Web',
];

export const PROJECT_STATUSES = labels([
  { value: 'prospect', label: 'Prospecto' },
  { value: 'active', label: 'Activo' },
  { value: 'paused', label: 'En pausa' },
  { value: 'completed', label: 'Completado' },
  { value: 'archived', label: 'Archivado' },
] as const);

export const JOB_STATUSES = labels([
  { value: 'received', label: 'Recibido' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'client_review', label: 'Revisión del cliente' },
  { value: 'closed', label: 'Cerrado' },
  { value: 'cancelled', label: 'Cancelado' },
] as const);

export const BILLING_STATUSES = labels([
  { value: 'not_billable', label: 'No facturable' },
  { value: 'pending', label: 'Pendiente de facturar' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'paid', label: 'Cobrado' },
] as const);

export const QUERY_STATUSES = labels([
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviada' },
  { value: 'answered', label: 'Respondida' },
  { value: 'closed', label: 'Cerrada' },
] as const);

export const TASK_STATUS_CATEGORIES = labels([
  { value: 'todo', label: 'Pendiente' },
  { value: 'doing', label: 'En curso' },
  { value: 'done', label: 'Hecha' },
] as const);

export const PRIORITIES = labels([
  { value: '1', label: 'Urgente' },
  { value: '2', label: 'Alta' },
  { value: '3', label: 'Normal' },
  { value: '4', label: 'Baja' },
] as const);

export type ValueOf<T extends readonly { value: string }[]> = T[number]['value'];
export type ClientKind = ValueOf<typeof CLIENT_KINDS>;
export type Service = ValueOf<typeof SERVICES>;
export type Unit = ValueOf<typeof UNITS>;
export type ContentType = ValueOf<typeof CONTENT_TYPES>;
export type GameStatus = ValueOf<typeof GAME_STATUSES>;
export type BusinessModel = ValueOf<typeof BUSINESS_MODELS>;
export type ProjectStatus = ValueOf<typeof PROJECT_STATUSES>;
export type JobStatus = ValueOf<typeof JOB_STATUSES>;
export type BillingStatus = ValueOf<typeof BILLING_STATUSES>;
export type QueryStatus = ValueOf<typeof QUERY_STATUSES>;
export type TaskStatusCategory = ValueOf<typeof TASK_STATUS_CATEGORIES>;

export function labelOf(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (value == null) return '—';
  return list.find((i) => i.value === value)?.label ?? value;
}

export function valuesOf<T extends readonly { value: string }[]>(
  list: T,
): [T[number]['value'], ...T[number]['value'][]] {
  return list.map((i) => i.value) as [T[number]['value'], ...T[number]['value'][]];
}
