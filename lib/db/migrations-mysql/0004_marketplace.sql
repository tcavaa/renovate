CREATE TABLE `checkouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int,
	`user_id` int,
	`kind` enum('calculator','design') NOT NULL,
	`total_m2` decimal(8,2) NOT NULL,
	`fee_per_m2` decimal(8,2) NOT NULL,
	`platform_fee` decimal(12,2) NOT NULL,
	`goods_total` decimal(12,2) NOT NULL,
	`commission_total` decimal(12,2) NOT NULL,
	`customer_name` varchar(255) NOT NULL,
	`customer_phone` varchar(50) NOT NULL,
	`customer_email` varchar(255),
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checkouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`product_id` int,
	`name_ka` varchar(500) NOT NULL,
	`name_en` varchar(500),
	`name_ru` varchar(500),
	`category_slug` varchar(100),
	`room_name` varchar(255),
	`unit` varchar(20) NOT NULL DEFAULT 'piece',
	`qty` decimal(10,2) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`total` decimal(12,2) NOT NULL,
	`removed` boolean NOT NULL DEFAULT false,
	`note` text,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checkout_id` int,
	`project_id` int,
	`user_id` int,
	`partner_type` enum('store','worker') NOT NULL,
	`store_id` int,
	`worker_id` int,
	`status` enum('new','confirmed','in_progress','done','cancelled') NOT NULL DEFAULT 'new',
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0.00',
	`delivery_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
	`commission_pct` decimal(5,2) NOT NULL DEFAULT '5.00',
	`commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`customer_name` varchar(255) NOT NULL,
	`customer_phone` varchar(50) NOT NULL,
	`customer_email` varchar(255),
	`customer_note` text,
	`partner_message` text,
	`viewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calculator_fee_per_m2` decimal(8,2) NOT NULL DEFAULT '2.00',
	`design_fee_per_m2` decimal(8,2) NOT NULL DEFAULT '12.00',
	`store_commission_pct` decimal(5,2) NOT NULL DEFAULT '5.00',
	`worker_commission_pct` decimal(5,2) NOT NULL DEFAULT '5.00',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','store','worker') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `stores` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `store_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `worker_id` int;--> statement-breakpoint
ALTER TABLE `workers` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `workers` ADD `commission_rate` decimal(5,2) DEFAULT '5.00';--> statement-breakpoint
ALTER TABLE `checkouts` ADD CONSTRAINT `checkouts_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkouts` ADD CONSTRAINT `checkouts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_checkout_id_checkouts_id_fk` FOREIGN KEY (`checkout_id`) REFERENCES `checkouts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `checkouts_created_idx` ON `checkouts` (`created_at`);--> statement-breakpoint
CREATE INDEX `checkouts_user_idx` ON `checkouts` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_store_created_idx` ON `orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_worker_created_idx` ON `orders` (`worker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE set null ON UPDATE no action;