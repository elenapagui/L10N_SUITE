CREATE TABLE `client_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`tool` text DEFAULT 'memoq' NOT NULL,
	`label` text,
	`server_url` text,
	`username` text,
	`password` text,
	`notes` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_accounts_client_idx` ON `client_accounts` (`client_id`);--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bank_name` text,
	`account_number` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`balance_date` text,
	`is_default` integer DEFAULT false NOT NULL,
	`color` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `bank_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`expense_id` text,
	`note` text,
	`balance_after` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bank_movements_account_idx` ON `bank_movements` (`account_id`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`concept` text NOT NULL,
	`supplier` text,
	`category` text DEFAULT 'other' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`base_cents` integer NOT NULL,
	`vat_pct` real DEFAULT 0 NOT NULL,
	`deductible` integer DEFAULT true NOT NULL,
	`bank_account_id` text,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`next_date` text NOT NULL,
	`end_date` text,
	`day_of_month` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_expenses_next_idx` ON `recurring_expenses` (`next_date`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `bank_account_id` text REFERENCES bank_accounts(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `expenses` ADD `charged_at` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `recurring_id` text REFERENCES recurring_expenses(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `expenses_bank_idx` ON `expenses` (`bank_account_id`);