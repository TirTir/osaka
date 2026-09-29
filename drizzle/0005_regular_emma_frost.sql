ALTER TABLE `users` ADD `chatgpt_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_chatgpt_user_id` ON `users` (`chatgpt_user_id`);