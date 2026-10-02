CREATE TABLE `annotation_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `annotation_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotation_tags_parent_idx` ON `annotation_tags` (`parent_id`);--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`segment_id` integer NOT NULL,
	`tag_id` text NOT NULL,
	`lang` text,
	`start` integer,
	`end` integer,
	`quote` text,
	`comment` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `annotation_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotations_segment_idx` ON `annotations` (`segment_id`);--> statement-breakpoint
CREATE INDEX `annotations_tag_idx` ON `annotations` (`tag_id`);--> statement-breakpoint
CREATE TABLE `corpus_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`title` text NOT NULL,
	`text_type` text DEFAULT 'dialogue' NOT NULL,
	`source_file` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `corpus_documents_game_idx` ON `corpus_documents` (`game_id`);--> statement-breakpoint
CREATE TABLE `corpus_profiles` (
	`game_id` text PRIMARY KEY NOT NULL,
	`phase` text DEFAULT 'identified' NOT NULL,
	`game_version` text,
	`text_date` text,
	`acquisition_method` text,
	`languages` text DEFAULT '["ko","es"]' NOT NULL,
	`translation_direction` text DEFAULT 'unknown' NOT NULL,
	`localization_company` text,
	`rights` text DEFAULT 'unknown' NOT NULL,
	`rights_notes` text,
	`method_notes` text,
	`restricted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `corpus_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`stats` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`attachment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `segment_texts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`segment_id` integer NOT NULL,
	`lang` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `segment_texts_segment_lang_idx` ON `segment_texts` (`segment_id`,`lang`);--> statement-breakpoint
CREATE INDEX `segment_texts_lang_idx` ON `segment_texts` (`lang`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`position` integer NOT NULL,
	`string_id` text,
	`speaker` text,
	`context` text,
	`text_type` text,
	`notes` text,
	FOREIGN KEY (`document_id`) REFERENCES `corpus_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `segments_document_idx` ON `segments` (`document_id`,`position`);--> statement-breakpoint
CREATE INDEX `segments_speaker_idx` ON `segments` (`speaker`);