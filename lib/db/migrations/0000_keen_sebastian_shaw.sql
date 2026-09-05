CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name_ka` varchar(255) NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`icon` varchar(100),
	`phase` int NOT NULL,
	`calculation_type` enum('per_m2_floor','per_m2_wall','per_m2_ceiling','per_linear_m','per_unit','per_room','fixed') NOT NULL,
	`is_visible` boolean NOT NULL DEFAULT true,
	`is_furniture` boolean NOT NULL DEFAULT false,
	`sort_order` int DEFAULT 0,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`store_id` int,
	`name_ka` varchar(500) NOT NULL,
	`description_ka` text,
	`slug` varchar(500) NOT NULL,
	`sku` varchar(100),
	`price_per_unit` decimal(10,2) NOT NULL,
	`unit` enum('m2','linear_m','piece','liter','kg','pack','set') NOT NULL,
	`coverage_per_unit` decimal(10,4),
	`brand` varchar(255),
	`image_url` varchar(500),
	`images` json,
	`specs` json,
	`tags` json,
	`style_tags` json,
	`model_3d_kind` varchar(64),
	`model_3d_url` varchar(500),
	`model_3d_status` enum('none','pending','ready','failed') NOT NULL DEFAULT 'none',
	`texture_url` varchar(500),
	`color_hex` varchar(9),
	`width_cm` int,
	`depth_cm` int,
	`height_cm` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`is_featured` boolean NOT NULL DEFAULT false,
	`sort_order` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`session_id` varchar(255),
	`name_ka` varchar(255) DEFAULT 'ჩემი პროექტი',
	`home_state` enum('black_frame','white_frame','green_frame') NOT NULL,
	`total_m2` decimal(8,2) NOT NULL,
	`rooms` json NOT NULL,
	`selected_products` json,
	`selected_furniture` json,
	`total_materials_cost` decimal(12,2),
	`total_furniture_cost` decimal(12,2),
	`total_workers_cost` decimal(12,2),
	`total_cost` decimal(12,2),
	`status` enum('draft','saved','submitted') DEFAULT 'draft',
	`mode` enum('full','design_only') NOT NULL DEFAULT 'full',
	`style_id` varchar(32),
	`budget_gel` decimal(12,2),
	`floor_plan_url` varchar(500),
	`plan` json,
	`scene` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('material','labour') NOT NULL,
	`key` varchar(100) NOT NULL,
	`label_ka` varchar(255) NOT NULL,
	`phase` int NOT NULL,
	`unit` varchar(20) NOT NULL,
	`basis` varchar(20),
	`qty_per_m2` decimal(10,4),
	`waste_factor_pct` decimal(6,2),
	`price_per_unit` decimal(12,2) NOT NULL,
	`linked_category_slug` varchar(100),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `rates_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name_ka` varchar(255) NOT NULL,
	`logo_url` varchar(500),
	`website_url` varchar(500),
	`phone` varchar(50),
	`address` varchar(500),
	`city` varchar(100),
	`rating` decimal(3,2) DEFAULT '4.50',
	`review_count` int DEFAULT 0,
	`delivery_days` int DEFAULT 3,
	`delivery_fee_gel` decimal(8,2) DEFAULT '0.00',
	`description_ka` text,
	`commission_rate` decimal(5,2) DEFAULT '5.00',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_name_ka_unique` UNIQUE(`name_ka`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name_ka` varchar(255) NOT NULL,
	`specialty` varchar(255) NOT NULL,
	`specialty_slug` varchar(100) NOT NULL,
	`phone` varchar(50),
	`price_per_m2` decimal(8,2),
	`price_per_unit` decimal(8,2),
	`price_unit` enum('m2','unit','fixed') NOT NULL,
	`rating` decimal(3,2) DEFAULT '5.00',
	`review_count` int DEFAULT 0,
	`bio` text,
	`avatar_url` varchar(500),
	`is_verified` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `products_active_category_idx` ON `products` (`is_active`,`category_id`,`is_featured`);--> statement-breakpoint
CREATE INDEX `products_model3d_kind_idx` ON `products` (`model_3d_kind`);--> statement-breakpoint
CREATE INDEX `projects_user_created_idx` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workers_active_specialty_idx` ON `workers` (`is_active`,`specialty_slug`);