CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`supplier` text,
	`concept` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`base_cents` integer NOT NULL,
	`vat_pct` real DEFAULT 0 NOT NULL,
	`vat_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`deductible` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`client_id` text,
	`issue_date` text NOT NULL,
	`due_date` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`base_cents` integer DEFAULT 0 NOT NULL,
	`vat_pct` real DEFAULT 0 NOT NULL,
	`vat_cents` integer DEFAULT 0 NOT NULL,
	`irpf_pct` real DEFAULT 0 NOT NULL,
	`irpf_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`paid_at` text,
	`extra_lines` text DEFAULT '[]' NOT NULL,
	`job_snapshot` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_issue_idx` ON `invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);