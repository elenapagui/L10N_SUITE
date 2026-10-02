-- Datos iniciales de la Fase 1: estados de tarea, áreas y plantillas.
INSERT OR IGNORE INTO `task_statuses` (`id`, `name`, `color`, `category`, `sort_order`) VALUES ('status-todo', 'Por hacer', '#6b7280', 'todo', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `task_statuses` (`id`, `name`, `color`, `category`, `sort_order`) VALUES ('status-doing', 'En curso', '#3b82f6', 'doing', 2);
--> statement-breakpoint
INSERT OR IGNORE INTO `task_statuses` (`id`, `name`, `color`, `category`, `sort_order`) VALUES ('status-review', 'En revisión', '#a855f7', 'doing', 3);
--> statement-breakpoint
INSERT OR IGNORE INTO `task_statuses` (`id`, `name`, `color`, `category`, `sort_order`) VALUES ('status-blocked', 'Bloqueada', '#f97316', 'todo', 4);
--> statement-breakpoint
INSERT OR IGNORE INTO `task_statuses` (`id`, `name`, `color`, `category`, `sort_order`) VALUES ('status-done', 'Hecha', '#22c55e', 'done', 5);
--> statement-breakpoint
INSERT OR IGNORE INTO `areas` (`id`, `name`, `color`, `sort_order`) VALUES ('area-work', 'Trabajo', '#6366f1', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `areas` (`id`, `name`, `color`, `sort_order`) VALUES ('area-academic', 'Académico', '#0ea5e9', 2);
--> statement-breakpoint
INSERT OR IGNORE INTO `areas` (`id`, `name`, `color`, `sort_order`) VALUES ('area-corpus', 'Corpus', '#14b8a6', 3);
--> statement-breakpoint
INSERT OR IGNORE INTO `areas` (`id`, `name`, `color`, `sort_order`) VALUES ('area-admin', 'Administración', '#f59e0b', 4);
--> statement-breakpoint
INSERT OR IGNORE INTO `areas` (`id`, `name`, `color`, `sort_order`) VALUES ('area-personal', 'Personal', '#ec4899', 5);
--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `name`, `kind`, `tasks`, `created_at`, `updated_at`) VALUES ('template-job-standard', 'Encargo estándar', 'job', '[{"title": "Traducir", "offsetDays": -2, "priority": 3, "checklist": []}, {"title": "Resolver consultas con el cliente", "offsetDays": -1, "priority": 3, "checklist": []}, {"title": "Control de calidad (QA)", "offsetDays": -1, "priority": 2, "checklist": ["Etiquetas, variables y saltos de línea intactos", "Límites de caracteres respetados", "Coherencia con el glosario y la guía de estilo", "Ortotipografía y concordancias de género y número", "Consultas pendientes resueltas o anotadas"]}, {"title": "Entregar", "offsetDays": 0, "priority": 1, "checklist": []}, {"title": "Registrar para facturar", "offsetDays": 1, "priority": 3, "checklist": []}]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `name`, `kind`, `tasks`, `created_at`, `updated_at`) VALUES ('template-project-localization', 'Proyecto de localización', 'project', '[{"title": "Leer los materiales de referencia (glosario, guía de estilo, contexto)", "offsetDays": 0, "priority": 2, "checklist": []}, {"title": "Preparar la ficha del juego: personajes, tratamiento y terminología", "offsetDays": 1, "priority": 3, "checklist": []}, {"title": "Configurar el proyecto en el CAT (memorias y glosarios)", "offsetDays": 1, "priority": 3, "checklist": []}]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
