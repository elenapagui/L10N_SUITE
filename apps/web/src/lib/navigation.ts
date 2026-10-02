import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  FileText,
  FolderKanban,
  Gamepad2,
  GraduationCap,
  House,
  Library,
  ListChecks,
  MessageCircleQuestion,
  Package,
  Receipt,
  Search,
  Settings,
  Table2,
  Timer,
  Trash2,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Fase de la hoja de ruta en la que se construye (para las secciones aún no disponibles). */
  phase?: number;
  keywords?: string;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ label: 'Inicio', to: '/', icon: House, keywords: 'panel dashboard hoy' }],
  },
  {
    label: 'Trabajo',
    items: [
      { label: 'Proyectos', to: '/trabajo/proyectos', icon: FolderKanban, phase: 1 },
      {
        label: 'Encargos',
        to: '/trabajo/encargos',
        icon: Package,
        phase: 1,
        keywords: 'lotes pedidos jobs',
      },
      {
        label: 'Tareas',
        to: '/trabajo/tareas',
        icon: ListChecks,
        phase: 1,
        keywords: 'kanban pendientes',
      },
      {
        label: 'Clientes',
        to: '/trabajo/clientes',
        icon: Building2,
        phase: 1,
        keywords: 'agencias estudios',
      },
      {
        label: 'Juegos',
        to: '/trabajo/juegos',
        icon: Gamepad2,
        phase: 1,
        keywords: 'videojuegos títulos',
      },
      {
        label: 'Tiempo',
        to: '/trabajo/tiempo',
        icon: Timer,
        phase: 1,
        keywords: 'cronómetro horas',
      },
      {
        label: 'Consultas',
        to: '/trabajo/consultas',
        icon: MessageCircleQuestion,
        phase: 1,
        keywords: 'queries dudas',
      },
      {
        label: 'Calendario',
        to: '/calendario',
        icon: CalendarDays,
        phase: 1,
        keywords: 'agenda entregas',
      },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        label: 'Facturación',
        to: '/finanzas/facturas',
        icon: Receipt,
        phase: 2,
        keywords: 'facturas cobros',
      },
      { label: 'Gastos', to: '/finanzas/gastos', icon: Wallet, phase: 2 },
      {
        label: 'Informes',
        to: '/finanzas/informes',
        icon: ChartColumn,
        phase: 2,
        keywords: 'ingresos iva irpf',
      },
    ],
  },
  {
    label: 'Conocimiento',
    items: [
      { label: 'Páginas', to: '/paginas', icon: FileText, phase: 3, keywords: 'notas wiki notion' },
      { label: 'Tablas', to: '/tablas', icon: Table2, phase: 3, keywords: 'hojas sheets' },
    ],
  },
  {
    label: 'Investigación',
    items: [
      { label: 'Corpus', to: '/corpus', icon: Library, phase: 4, keywords: 'textos catálogo' },
      {
        label: 'Concordancias',
        to: '/corpus/concordancias',
        icon: Search,
        phase: 4,
        keywords: 'kwic buscar corpus',
      },
      {
        label: 'Publicaciones',
        to: '/academico/publicaciones',
        icon: GraduationCap,
        phase: 5,
        keywords: 'artículos revistas',
      },
      {
        label: 'Biblioteca',
        to: '/academico/biblioteca',
        icon: BookOpen,
        phase: 5,
        keywords: 'referencias zotero bibliografía',
      },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { label: 'Papelera', to: '/papelera', icon: Trash2, keywords: 'eliminados restaurar' },
  {
    label: 'Ajustes',
    to: '/ajustes',
    icon: Settings,
    keywords: 'configuración copias seguridad etiquetas',
  },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER];

/** Fases ya disponibles en esta versión. */
export const AVAILABLE_PHASE = 2;
