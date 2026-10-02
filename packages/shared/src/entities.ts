/**
 * Registro de tipos de ficha. Se usa para etiquetas, adjuntos, vínculos, búsqueda global
 * y papelera, de modo que cualquier módulo pueda referirse a cualquier otro.
 */
export const ENTITY_TYPES = {
  client: { label: 'Cliente', plural: 'Clientes', route: '/trabajo/clientes' },
  contact: { label: 'Contacto', plural: 'Contactos', route: '/trabajo/clientes' },
  rate: { label: 'Tarifa', plural: 'Tarifas', route: '/trabajo/clientes' },
  game: { label: 'Juego', plural: 'Juegos', route: '/trabajo/juegos' },
  project: { label: 'Proyecto', plural: 'Proyectos', route: '/trabajo/proyectos' },
  job: { label: 'Encargo', plural: 'Encargos', route: '/trabajo/encargos' },
  task: { label: 'Tarea', plural: 'Tareas', route: '/trabajo/tareas' },
  task_list: { label: 'Lista', plural: 'Listas', route: '/trabajo/tareas' },
  time_entry: {
    label: 'Registro de tiempo',
    plural: 'Registros de tiempo',
    route: '/trabajo/tiempo',
  },
  client_query: { label: 'Consulta', plural: 'Consultas', route: '/trabajo/consultas' },
  invoice: { label: 'Factura', plural: 'Facturas', route: '/finanzas/facturas' },
  expense: { label: 'Gasto', plural: 'Gastos', route: '/finanzas/gastos' },
  page: { label: 'Página', plural: 'Páginas', route: '/paginas' },
  custom_table: { label: 'Tabla', plural: 'Tablas', route: '/tablas' },
  glossary_term: { label: 'Término', plural: 'Términos', route: '/trabajo/juegos' },
  character: { label: 'Personaje', plural: 'Personajes', route: '/trabajo/juegos' },
  corpus_version: { label: 'Versión del corpus', plural: 'Versiones del corpus', route: '/corpus' },
  corpus_document: {
    label: 'Documento del corpus',
    plural: 'Documentos del corpus',
    route: '/corpus/documentos',
  },
  publication: { label: 'Publicación', plural: 'Publicaciones', route: '/academico/publicaciones' },
  journal: { label: 'Revista', plural: 'Revistas', route: '/academico/revistas' },
  reference: { label: 'Referencia', plural: 'Referencias', route: '/academico/biblioteca' },
  attachment: { label: 'Adjunto', plural: 'Adjuntos', route: '/ajustes' },
  tag: { label: 'Etiqueta', plural: 'Etiquetas', route: '/ajustes/etiquetas' },
} as const;

export type EntityType = keyof typeof ENTITY_TYPES;

export const ENTITY_TYPE_KEYS = Object.keys(ENTITY_TYPES) as EntityType[];

export function entityLabel(type: string): string {
  return (ENTITY_TYPES as Record<string, { label: string }>)[type]?.label ?? type;
}

export function isEntityType(value: string): value is EntityType {
  return value in ENTITY_TYPES;
}
