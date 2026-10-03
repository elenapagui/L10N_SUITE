CREATE TABLE `segment_morph_done` (
	`segment_id` integer PRIMARY KEY NOT NULL,
	`analyzed_at` text NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `segment_morphs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`segment_id` integer NOT NULL,
	`lemma` text NOT NULL,
	`tag` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `segment_morphs_lemma_idx` ON `segment_morphs` (`lemma`);--> statement-breakpoint
CREATE INDEX `segment_morphs_segment_idx` ON `segment_morphs` (`segment_id`);--> statement-breakpoint
CREATE TRIGGER `segment_texts_morph_au` AFTER UPDATE OF `text` ON `segment_texts` WHEN old.lang = 'ko' BEGIN
  DELETE FROM `segment_morphs` WHERE `segment_id` = old.segment_id;
  DELETE FROM `segment_morph_done` WHERE `segment_id` = old.segment_id;
END;
--> statement-breakpoint
CREATE TRIGGER `segment_texts_morph_ad` AFTER DELETE ON `segment_texts` WHEN old.lang = 'ko' BEGIN
  DELETE FROM `segment_morphs` WHERE `segment_id` = old.segment_id;
  DELETE FROM `segment_morph_done` WHERE `segment_id` = old.segment_id;
END;
