CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name_ko` text,
	`name_es` text NOT NULL,
	`name_en` text,
	`gender` text DEFAULT 'unknown' NOT NULL,
	`address_form` text,
	`ko_speech_level` text,
	`speech_style` text,
	`description` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `characters_game_idx` ON `characters` (`game_id`);--> statement-breakpoint
CREATE TABLE `custom_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`width` integer,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `custom_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_columns_table_idx` ON `custom_columns` (`table_id`,`position`);--> statement-breakpoint
CREATE TABLE `custom_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`values` text DEFAULT '{}' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`table_id`) REFERENCES `custom_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_rows_table_idx` ON `custom_rows` (`table_id`,`position`);--> statement-breakpoint
CREATE TABLE `custom_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`description` text,
	`game_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `custom_views` (
	`id` text PRIMARY KEY NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'grid' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `custom_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_views_table_idx` ON `custom_views` (`table_id`,`position`);--> statement-breakpoint
CREATE TABLE `glossary_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`term_ko` text,
	`term_es` text,
	`term_en` text,
	`category` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`context` text,
	`source` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `glossary_terms_game_idx` ON `glossary_terms` (`game_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`source_type`, `source_id`, `target_type`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `links_target_idx` ON `links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `page_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_format` text DEFAULT 'blocks' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_revisions_page_idx` ON `page_revisions` (`page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`game_id` text,
	`content` text DEFAULT '[]' NOT NULL,
	`content_format` text DEFAULT 'blocks' NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`last_opened_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`parent_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pages_parent_idx` ON `pages` (`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `pages_game_idx` ON `pages` (`game_id`);