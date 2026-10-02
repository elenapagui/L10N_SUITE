import { z } from 'zod';
import { patchSchema } from '../schemas/common';

/**
 * Páginas (sustituyen a Notion). El contenido son los bloques del editor (JSON). Las páginas
 * importadas o creadas desde una plantilla llegan en Markdown y el editor las convierte a
 * bloques la primera vez que se abren.
 */
export const CONTENT_FORMATS = ['blocks', 'markdown'] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const pageInputSchema = z.object({
  title: z.string().trim().max(500).default(''),
  icon: z.string().max(16).nullish(),
  parentId: z.string().max(64).nullish(),
  gameId: z.string().max(64).nullish(),
  content: z.unknown().optional(),
  contentFormat: z.enum(CONTENT_FORMATS).default('blocks'),
  isFavorite: z.boolean().default(false),
  /** Plantilla de la que parte (clave de PAGE_TEMPLATES). */
  template: z.string().max(60).nullish(),
  /** Insertar justo después de esta página hermana (por defecto, al final). */
  afterId: z.string().max(64).nullish(),
});
export const pageUpdateSchema = patchSchema(
  pageInputSchema.omit({ template: true, afterId: true }),
).extend({
  /** Posición entre hermanas al mover: índice de destino. */
  index: z.number().int().min(0).optional(),
  /** Al guardar el contenido: versión que el editor tenía (para no pisar cambios). */
  baseVersion: z.number().int().optional(),
});

export interface PageSummary {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  gameId: string | null;
  isFavorite: boolean;
  position: number;
  hasChildren: boolean;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface Page extends PageSummary {
  content: unknown;
  contentFormat: ContentFormat;
  version: number;
  createdAt: string;
  /** Ruta de antepasados para las migas de pan. */
  breadcrumbs: { id: string; title: string; icon: string | null }[];
}

export interface PageRevision {
  id: string;
  pageId: string;
  title: string;
  createdAt: string;
  size: number;
}

export interface Backlink {
  entityType: string;
  entityId: string;
  title: string;
  icon: string | null;
}

/** Mención dentro del contenido: `{ type: 'mention', props: { entityType, entityId, label } }`. */
export interface MentionRef {
  entityType: string;
  entityId: string;
}

type Inline = {
  type?: string;
  text?: string;
  content?: unknown;
  props?: Record<string, unknown>;
  href?: string;
};
type Block = {
  type?: string;
  content?: unknown;
  children?: unknown;
  props?: Record<string, unknown>;
};

function walkInline(
  content: unknown,
  onText: (t: string) => void,
  onMention: (m: MentionRef & { label?: string }) => void,
) {
  if (typeof content === 'string') {
    onText(content);
    return;
  }
  if (!Array.isArray(content)) {
    // Contenido de tabla: { type: 'tableContent', rows: [{ cells: [...] }] }
    const table = content as { type?: string; rows?: { cells?: unknown[] }[] } | null;
    if (table?.type === 'tableContent') {
      for (const row of table.rows ?? []) {
        for (const cell of row.cells ?? []) {
          const c = cell as { type?: string; content?: unknown };
          walkInline(c?.type === 'tableCell' ? c.content : cell, onText, onMention);
          onText('\t');
        }
        onText('\n');
      }
    }
    return;
  }
  for (const item of content as Inline[]) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'text' && typeof item.text === 'string') onText(item.text);
    else if (item.type === 'link') walkInline(item.content, onText, onMention);
    else if (item.type === 'mention' && item.props) {
      const { entityType, entityId, label } = item.props as Record<string, string>;
      if (entityType && entityId) onMention({ entityType, entityId, label });
      if (label) onText(`@${label}`);
    }
  }
}

function walkBlocks(blocks: unknown, visit: (b: Block) => void) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks as Block[]) {
    if (!b || typeof b !== 'object') continue;
    visit(b);
    walkBlocks(b.children, visit);
  }
}

/** Texto plano del contenido (para la búsqueda y las vistas previas). */
export function blocksToPlainText(blocks: unknown, maxLength = 200_000): string {
  const parts: string[] = [];
  let size = 0;
  walkBlocks(blocks, (b) => {
    if (size > maxLength) return;
    let line = '';
    walkInline(
      b.content,
      (t) => (line += t),
      () => undefined,
    );
    if (b.type === 'image' || b.type === 'file' || b.type === 'video' || b.type === 'audio') {
      const name = (b.props?.name ?? b.props?.caption) as string | undefined;
      if (name) line += name;
    }
    if (line) {
      parts.push(line);
      size += line.length;
    }
  });
  return parts.join('\n').slice(0, maxLength);
}

/** Fichas mencionadas con «@» en el contenido (sin repetir). */
export function extractMentions(blocks: unknown): MentionRef[] {
  const seen = new Map<string, MentionRef>();
  walkBlocks(blocks, (b) => {
    walkInline(
      b.content,
      () => undefined,
      (m) =>
        seen.set(`${m.entityType}:${m.entityId}`, {
          entityType: m.entityType,
          entityId: m.entityId,
        }),
    );
  });
  return [...seen.values()];
}

/** Texto plano aproximado de un Markdown (para indexar antes de convertirlo a bloques). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\|/g, ' ')
    .trim();
}

export interface PageTemplate {
  key: string;
  label: string;
  icon: string;
  description: string;
  markdown: string;
}

/** Plantillas de página (en Markdown; el editor las convierte a bloques). */
export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: 'style_guide',
    label: 'Guía de estilo',
    icon: '📘',
    description: 'Tono, tratamiento, convenciones y terminología de un juego',
    markdown: `## Datos generales

- **Juego:**
- **Cliente:**
- **Par de idiomas:** KO → ES (España)
- **Público y clasificación (PEGI):**

## Tono y registro

Describe el tono general (épico, desenfadado, infantil…) y cómo varía entre interfaz, diálogos y textos de marketing.

## Tratamiento del jugador

- [ ] Tú
- [ ] Usted
- [ ] Impersonal

Ejemplos de referencia:

| Coreano | Español |
| --- | --- |
|  |  |

## Personajes

Consulta la pestaña **Personajes** del juego para el género gramatical, el tratamiento (반말/존댓말) y la forma de hablar de cada uno.

## Convenciones

- **Mayúsculas:** solo en la primera palabra de los títulos de menú.
- **Números y unidades:** separador decimal con coma; espacio fino antes de % en textos largos.
- **Variables y etiquetas:** no se traducen ({0}, %s, <color=#fff>…).
- **Longitud:** límite de caracteres en botones y notificaciones.
- **Lenguaje inclusivo:**

## Terminología clave

Consulta el **glosario** del juego. Términos prohibidos y motivo:

## Dudas resueltas

> Pega aquí las respuestas del cliente que afectan a todo el proyecto.
`,
  },
  {
    key: 'kickoff',
    label: 'Kickoff de proyecto',
    icon: '🚀',
    description: 'Todo lo acordado al empezar un proyecto',
    markdown: `## Resumen

- **Cliente y contacto (PM):**
- **Juego:**
- **Alcance:** UI · diálogos · objetos · marketing
- **Volumen estimado:**
- **Herramienta (CAT/plataforma):**
- **Calendario:** inicio  · entregas parciales  · entrega final

## Materiales de referencia

- [ ] Glosario del cliente
- [ ] Guía de estilo
- [ ] Capturas, vídeos o build
- [ ] Traducciones anteriores (memoria)

## Instrucciones del cliente

## Riesgos y dudas abiertas

## Próximos pasos

- [ ] Configurar el proyecto en la herramienta
- [ ] Preparar el glosario inicial
- [ ] Enviar la primera tanda de consultas
`,
  },
  {
    key: 'lqa_report',
    label: 'Informe de LQA',
    icon: '🧪',
    description: 'Resultados de una pasada de control de calidad lingüístico',
    markdown: `## Datos de la pasada

- **Build / versión:**
- **Plataforma:**
- **Fechas:**
- **Alcance probado:**

## Resumen

| Severidad | Incidencias |
| --- | --- |
| Crítica | 0 |
| Alta | 0 |
| Media | 0 |
| Baja | 0 |

## Incidencias destacadas

1.

## Problemas recurrentes

- Truncamientos:
- Concordancia de género y número con variables:
- Terminología:

## Recomendaciones
`,
  },
  {
    key: 'meeting',
    label: 'Acta de reunión',
    icon: '🗓️',
    description: 'Asistentes, puntos tratados y acuerdos',
    markdown: `**Fecha:**  · **Asistentes:**

## Orden del día

1.

## Notas

## Acuerdos

-

## Tareas

- [ ]
`,
  },
  {
    key: 'reading_note',
    label: 'Ficha de lectura',
    icon: '📖',
    description: 'Notas de lectura de un artículo o libro',
    markdown: `**Referencia:**

## Idea principal

## Metodología y corpus

## Conceptos clave

-

## Citas textuales

> «» (p. )

## Valoración y relación con mi investigación
`,
  },
  {
    key: 'article_plan',
    label: 'Plan de artículo',
    icon: '✍️',
    description: 'Estructura de un artículo académico',
    markdown: `## Pregunta de investigación

## Hipótesis u objetivos

## Revista objetivo

- **Revista:**
- **Extensión máxima:**
- **Estilo de citas:**

## Corpus y metodología

- **Juegos analizados:**
- **Versión del corpus:**

## Estructura

1. Introducción
2. Marco teórico
3. Metodología
4. Análisis
5. Conclusiones

## Bibliografía pendiente

- [ ]
`,
  },
];
