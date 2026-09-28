CREATE TABLE `trip_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'view' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_trip_shares_user` ON `trip_shares` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_shares_trip_user` ON `trip_shares` (`trip_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `place_collections` ADD `is_default` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
  t.id, '기본', '#6f7f85', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '기본');--> statement-breakpoint
UPDATE place_collections AS c SET is_default = 1
WHERE c.name = '기본' AND c.id = (SELECT c2.id FROM place_collections c2 WHERE c2.trip_id = c.trip_id AND c2.name = '기본' ORDER BY c2.position, c2.created_at LIMIT 1);--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), t.id, '카페', '#c58a28', 0, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '카페');--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), t.id, '음식점', '#d9553c', 0, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '음식점');--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), t.id, '관광지', '#3478a5', 0, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '관광지');--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), t.id, '쇼핑', '#b35478', 0, 5, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '쇼핑');--> statement-breakpoint
INSERT INTO `place_collections` (`id`, `trip_id`, `name`, `color`, `is_default`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), t.id, '숙소', '#6d65a8', 0, 6, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips t WHERE t.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_collections c WHERE c.trip_id = t.id AND c.name = '숙소');--> statement-breakpoint
UPDATE places SET collection_id = (SELECT c.id FROM place_collections c WHERE c.trip_id = places.trip_id AND c.is_default = 1 LIMIT 1) WHERE collection_id IS NULL;
