CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`source_id` text,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'place' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`opening_hours` text DEFAULT '' NOT NULL,
	`menu_url` text DEFAULT '' NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`day` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_places_trip_day_position` ON `places` (`trip_id`,`day`,`position`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_token_hash_unique` ON `trips` (`token_hash`);