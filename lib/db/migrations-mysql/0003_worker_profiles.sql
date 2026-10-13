CREATE TABLE `worker_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`author_name` varchar(255) NOT NULL,
	`rating` int NOT NULL,
	`text_ka` text,
	`text_en` text,
	`text_ru` text,
	`job_ka` varchar(255),
	`job_en` varchar(255),
	`job_ru` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worker_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_works` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worker_id` int NOT NULL,
	`title_ka` varchar(255) NOT NULL,
	`title_en` varchar(255),
	`title_ru` varchar(255),
	`description_ka` text,
	`description_en` text,
	`description_ru` text,
	`image_url` varchar(500),
	`area_m2` decimal(8,2),
	`city` varchar(100),
	`year` int,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `worker_works_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workers` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `workers` ADD `experience_years` int;--> statement-breakpoint
ALTER TABLE `workers` ADD `completed_jobs` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `worker_reviews` ADD CONSTRAINT `worker_reviews_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worker_works` ADD CONSTRAINT `worker_works_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `worker_reviews_worker_idx` ON `worker_reviews` (`worker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `worker_works_worker_idx` ON `worker_works` (`worker_id`,`sort_order`);