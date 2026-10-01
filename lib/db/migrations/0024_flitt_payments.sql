CREATE TABLE `payment_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int,
	`order_id` varchar(64) NOT NULL,
	`source` enum('callback','status') NOT NULL,
	`signature_valid` boolean NOT NULL,
	`order_status` varchar(20),
	`payload` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` varchar(64) NOT NULL,
	`user_id` int,
	`purpose` enum('calculator','design','own_item') NOT NULL,
	`project_id` int,
	`product_id` int,
	`total_m2` decimal(8,2),
	`fee_per_m2` decimal(8,2),
	`amount` decimal(12,2) NOT NULL,
	`bank_fee_pct` decimal(5,2) NOT NULL DEFAULT '0.00',
	`bank_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'GEL',
	`status` enum('created','processing','approved','declined','expired','reversed') NOT NULL DEFAULT 'created',
	`provider` varchar(20) NOT NULL DEFAULT 'flitt',
	`test_mode` boolean NOT NULL DEFAULT true,
	`provider_payment_id` varchar(32),
	`masked_card` varchar(19),
	`card_type` varchar(20),
	`card_bin` varchar(8),
	`payment_system` varchar(30),
	`actual_amount` decimal(12,2),
	`actual_currency` varchar(3),
	`reversal_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`rrn` varchar(50),
	`approval_code` varchar(16),
	`order_time` varchar(19),
	`response_code` varchar(16),
	`response_description` varchar(255),
	`last_event_at` timestamp,
	`paid_at` timestamp,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `own_item_price` decimal(8,2) DEFAULT '10.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `bank_fee_pct` decimal(5,2) DEFAULT '2.20' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_events_payment_idx` ON `payment_events` (`payment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_user_purpose_idx` ON `payments` (`user_id`,`purpose`,`status`);--> statement-breakpoint
CREATE INDEX `payments_project_idx` ON `payments` (`project_id`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created_at`);