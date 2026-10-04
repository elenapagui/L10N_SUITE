CREATE TABLE `job_application_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`due_date` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `job_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_application_events_app_idx` ON `job_application_events` (`application_id`);--> statement-breakpoint
CREATE INDEX `job_application_events_due_idx` ON `job_application_events` (`due_date`);--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`kind` text DEFAULT 'freelance' NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`client_id` text,
	`source` text,
	`url` text,
	`location` text,
	`work_mode` text,
	`source_lang` text,
	`target_lang` text,
	`contact_name` text,
	`contact_email` text,
	`salary_min_cents` integer,
	`salary_max_cents` integer,
	`salary_period` text,
	`rate_micros` integer,
	`rate_unit` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`deadline` text,
	`applied_at` text,
	`follow_up_at` text,
	`notes` text,
	`position` real DEFAULT 0 NOT NULL,
	`status_changed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_applications_status_idx` ON `job_applications` (`status`);--> statement-breakpoint
CREATE INDEX `job_applications_follow_up_idx` ON `job_applications` (`follow_up_at`);