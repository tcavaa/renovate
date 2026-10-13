CREATE TABLE `project_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int,
	`user_id` int,
	`kind` enum('calculator','design') NOT NULL,
	`total_m2` decimal(8,2) NOT NULL,
	`fee_per_m2` decimal(8,2) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`method` varchar(20) NOT NULL DEFAULT 'test',
	`card_last4` varchar(4),
	`reference` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_payments_project_kind_idx` UNIQUE(`project_id`,`kind`)
);
--> statement-breakpoint
ALTER TABLE `checkouts` ADD `delivery_city` varchar(120);--> statement-breakpoint
ALTER TABLE `checkouts` ADD `delivery_address` varchar(255);--> statement-breakpoint
ALTER TABLE `checkouts` ADD `delivery_postal_code` varchar(20);--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_city` varchar(120);--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_address` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_postal_code` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `address_city` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `address_line` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `address_postal_code` varchar(20);--> statement-breakpoint
ALTER TABLE `project_payments` ADD CONSTRAINT `project_payments_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_payments` ADD CONSTRAINT `project_payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_payments_created_idx` ON `project_payments` (`created_at`);