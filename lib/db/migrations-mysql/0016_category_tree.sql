CREATE TABLE `shelf_room_categories` (
	`shelf_room_id` int NOT NULL,
	`category_id` int NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `shelf_room_categories_shelf_room_id_category_id_pk` PRIMARY KEY(`shelf_room_id`,`category_id`)
);
--> statement-breakpoint
CREATE TABLE `shelf_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name_ka` varchar(255) NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`name_ru` varchar(255),
	`icon` varchar(100),
	`room_types` json,
	`is_visible` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shelf_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `shelf_rooms_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `parent_id` int;--> statement-breakpoint
ALTER TABLE `categories` ADD `in_calculator` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `model_3d_kind` varchar(64);--> statement-breakpoint
ALTER TABLE `shelf_room_categories` ADD CONSTRAINT `shelf_room_categories_shelf_room_id_shelf_rooms_id_fk` FOREIGN KEY (`shelf_room_id`) REFERENCES `shelf_rooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shelf_room_categories` ADD CONSTRAINT `shelf_room_categories_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shelf_room_categories_category_idx` ON `shelf_room_categories` (`category_id`);--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);