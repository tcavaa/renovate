CREATE TABLE `team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team_id` int NOT NULL,
	`worker_id` int NOT NULL,
	`is_lead` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name_ka` varchar(255) NOT NULL,
	`name_en` varchar(255),
	`name_ru` varchar(255),
	`slug` varchar(255) NOT NULL,
	`description_ka` text,
	`description_en` text,
	`description_ru` text,
	`lead_name` varchar(255),
	`phone` varchar(50),
	`email` varchar(255),
	`logo_url` varchar(500),
	`city` varchar(100),
	`rating` decimal(3,2) DEFAULT '5.00',
	`review_count` int DEFAULT 0,
	`completed_jobs` int DEFAULT 0,
	`experience_years` int,
	`markup_pct` decimal(5,2),
	`commission_rate` decimal(5,2) DEFAULT '5.00',
	`capacity_jobs` int DEFAULT 1,
	`is_verified` boolean NOT NULL DEFAULT false,
	`approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `partner_type` enum('store','worker','team') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','agent_orders','agent_catalog','store','worker','team') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `orders` ADD `team_id` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `staff_note` text;--> statement-breakpoint
ALTER TABLE `users` ADD `team_id` int;--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `team_members_team_idx` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_members_worker_idx` ON `team_members` (`worker_id`);--> statement-breakpoint
CREATE INDEX `teams_active_city_idx` ON `teams` (`is_active`,`city`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `orders_team_created_idx` ON `orders` (`team_id`,`created_at`);