CREATE TABLE `place_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#d9553c' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_place_collections_trip_position` ON `place_collections` (`trip_id`,`position`);--> statement-breakpoint
ALTER TABLE `places` ADD `collection_id` text REFERENCES place_collections(id);--> statement-breakpoint
CREATE INDEX `idx_places_collection` ON `places` (`collection_id`);--> statement-breakpoint
ALTER TABLE `route_stops` ADD `transport_mode` text DEFAULT 'walk' NOT NULL;--> statement-breakpoint
ALTER TABLE `route_stops` ADD `fare_yen` integer DEFAULT 0 NOT NULL;