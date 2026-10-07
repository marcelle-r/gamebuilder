CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_games_updated_at` ON `games` (`updated_at`);