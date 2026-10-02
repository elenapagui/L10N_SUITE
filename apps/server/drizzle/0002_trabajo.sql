CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklist_entity_idx` ON `checklist_items` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `client_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text,
	`string_id` text,
	`source_text` text,
	`context` text,
	`question` text NOT NULL,
	`answer` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`asked_at` text,
	`answered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `queries_project_idx` ON `client_queries` (`project_id`);--> statement-breakpoint
CREATE INDEX `queries_job_idx` ON `client_queries` (`job_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'agency' NOT NULL,
	`legal_name` text,
	`tax_id` text,
	`country` text,
	`address` text,
	`email` text,
	`website` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`payment_terms_days` integer,
	`vat_pct` real,
	`irpf_pct` real,
	`platform` text,
	`nda_signed_at` text,
	`cat_grid` text,
	`rating` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`name`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `comments_entity_idx` ON `comments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`email` text,
	`phone` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_client_idx` ON `contacts` (`client_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`title_es` text,
	`title_en` text,
	`developer` text,
	`publisher` text,
	`release_year` integer,
	`genres` text DEFAULT '[]' NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`business_model` text,
	`pegi` text,
	`status` text DEFAULT 'released' NOT NULL,
	`website` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `games_title_idx` ON `games` (`title`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`po_number` text,
	`service` text DEFAULT 'translation' NOT NULL,
	`content_type` text,
	`status` text DEFAULT 'received' NOT NULL,
	`received_at` text,
	`due_date` text,
	`due_time` text,
	`delivered_at` text,
	`unit` text DEFAULT 'word' NOT NULL,
	`volume` real,
	`cat_analysis` text,
	`weighted_volume` real,
	`rate_micros` integer,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`amount_cents` integer,
	`amount_manual` integer DEFAULT false NOT NULL,
	`billing_status` text DEFAULT 'pending' NOT NULL,
	`invoice_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`);--> statement-breakpoint
CREATE INDEX `jobs_due_idx` ON `jobs` (`due_date`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_billing_idx` ON `jobs` (`billing_status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`client_id` text,
	`game_id` text,
	`contact_id` text,
	`source_lang` text,
	`target_lang` text,
	`status` text DEFAULT 'active' NOT NULL,
	`cat_tool` text,
	`start_date` text,
	`end_date` text,
	`local_folder` text,
	`color` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_client_idx` ON `projects` (`client_id`);--> statement-breakpoint
CREATE INDEX `projects_game_idx` ON `projects` (`game_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `rates` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`service` text NOT NULL,
	`source_lang` text,
	`target_lang` text,
	`unit` text NOT NULL,
	`rate_micros` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`minimum_cents` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rates_client_idx` ON `rates` (`client_id`);--> statement-breakpoint
CREATE TABLE `task_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_lists_area_idx` ON `task_lists` (`area_id`);--> statement-breakpoint
CREATE TABLE `task_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status_id` text NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`area_id` text,
	`list_id` text,
	`project_id` text,
	`job_id` text,
	`game_id` text,
	`parent_id` text,
	`related_type` text,
	`related_id` text,
	`start_date` text,
	`due_date` text,
	`due_time` text,
	`estimate_minutes` integer,
	`recurrence` text,
	`completed_at` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`status_id`) REFERENCES `task_statuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`list_id`) REFERENCES `task_lists`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_job_idx` ON `tasks` (`job_id`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_area_idx` ON `tasks` (`area_id`);--> statement-breakpoint
CREATE INDEX `tasks_related_idx` ON `tasks` (`related_type`,`related_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`tasks` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`job_id` text,
	`project_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`note` text,
	`billable` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `time_started_idx` ON `time_entries` (`started_at`);--> statement-breakpoint
CREATE INDEX `time_task_idx` ON `time_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `time_job_idx` ON `time_entries` (`job_id`);--> statement-breakpoint
CREATE INDEX `time_project_idx` ON `time_entries` (`project_id`);