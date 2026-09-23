ALTER TABLE `products` ADD `owner_user_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `products_owner_idx` ON `products` (`owner_user_id`);