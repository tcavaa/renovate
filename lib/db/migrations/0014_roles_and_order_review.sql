CREATE TABLE `order_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`user_id` int,
	`actor_role` varchar(20),
	`actor_name` varchar(255),
	`kind` enum('created','confirmed','status','edited','message','comment') NOT NULL,
	`body` text,
	`meta` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `original_qty` decimal(10,2);--> statement-breakpoint
ALTER TABLE `order_items` ADD `original_unit_price` decimal(12,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `sent_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `confirmed_at` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `confirmed_by` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `original_delivery_fee` decimal(10,2);--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `materials_store_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `is_active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` timestamp;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_events_order_idx` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_confirmed_by_users_id_fk` FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_materials_store_id_stores_id_fk` FOREIGN KEY (`materials_store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;