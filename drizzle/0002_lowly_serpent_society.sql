CREATE TABLE `itineraries` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text,
	`day_count` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_itineraries_owner_created` ON `itineraries` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_itineraries_trip` ON `itineraries` (`trip_id`);--> statement-breakpoint
CREATE TABLE `itinerary_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`itinerary_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_itinerary_shares_user` ON `itinerary_shares` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_itinerary_shares_itinerary_user` ON `itinerary_shares` (`itinerary_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `route_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`place_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `route_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_route_stops_variant_position` ON `route_stops` (`variant_id`,`position`);--> statement-breakpoint
CREATE TABLE `route_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`itinerary_id` text NOT NULL,
	`day` integer NOT NULL,
	`name` text NOT NULL,
	`transport_mode` text DEFAULT 'transit' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`itinerary_id`) REFERENCES `itineraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_route_variants_itinerary_day` ON `route_variants` (`itinerary_id`,`day`);