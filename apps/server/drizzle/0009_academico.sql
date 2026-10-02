CREATE TABLE `journals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`issn` text,
	`eissn` text,
	`publisher` text,
	`url` text,
	`guidelines_url` text,
	`indexing` text DEFAULT '[]' NOT NULL,
	`quartile` text,
	`open_access` text DEFAULT 'unknown' NOT NULL,
	`apc_cents` integer,
	`apc_currency` text DEFAULT 'EUR' NOT NULL,
	`citation_style` text,
	`languages` text,
	`word_limit` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `publication_games` (
	`publication_id` text NOT NULL,
	`game_id` text NOT NULL,
	PRIMARY KEY(`publication_id`, `game_id`),
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `publication_references` (
	`publication_id` text NOT NULL,
	`reference_id` text NOT NULL,
	PRIMARY KEY(`publication_id`, `reference_id`),
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `bib_references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publication_references_ref_idx` ON `publication_references` (`reference_id`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'article' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`abstract` text,
	`keywords` text DEFAULT '[]' NOT NULL,
	`language` text,
	`journal_id` text,
	`doi` text,
	`url` text,
	`citation` text,
	`corpus_version_id` text,
	`deadline` text,
	`word_count` integer,
	`notes` text,
	`authors` text DEFAULT '[]' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`status_changed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`corpus_version_id`) REFERENCES `corpus_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `publications_status_idx` ON `publications` (`status`);--> statement-breakpoint
CREATE TABLE `reference_collection_items` (
	`collection_id` text NOT NULL,
	`reference_id` text NOT NULL,
	PRIMARY KEY(`collection_id`, `reference_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `reference_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `bib_references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reference_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reference_games` (
	`reference_id` text NOT NULL,
	`game_id` text NOT NULL,
	PRIMARY KEY(`reference_id`, `game_id`),
	FOREIGN KEY (`reference_id`) REFERENCES `bib_references`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reference_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_id` text NOT NULL,
	`text` text NOT NULL,
	`page` text,
	`comment` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `bib_references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reference_quotes_ref_idx` ON `reference_quotes` (`reference_id`);--> statement-breakpoint
CREATE TABLE `bib_references` (
	`id` text PRIMARY KEY NOT NULL,
	`csl` text NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`creators` text DEFAULT '' NOT NULL,
	`year` integer,
	`container` text,
	`doi` text,
	`citation_key` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`read_status` text DEFAULT 'unread' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`pdf_attachment_id` text,
	`full_text` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`pdf_attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`journal_id` text,
	`venue` text,
	`manuscript_id` text,
	`submitted_at` text NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`decision_at` text,
	`revision_due` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_publication_idx` ON `submissions` (`publication_id`);--> statement-breakpoint
CREATE INDEX `submissions_journal_idx` ON `submissions` (`journal_id`);