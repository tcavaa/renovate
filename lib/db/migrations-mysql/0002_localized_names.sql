ALTER TABLE `categories` ADD `name_ru` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `name_en` varchar(500);--> statement-breakpoint
ALTER TABLE `products` ADD `name_ru` varchar(500);--> statement-breakpoint
ALTER TABLE `products` ADD `description_en` text;--> statement-breakpoint
ALTER TABLE `products` ADD `description_ru` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `name_en` varchar(255);--> statement-breakpoint
ALTER TABLE `stores` ADD `name_ru` varchar(255);--> statement-breakpoint
ALTER TABLE `stores` ADD `description_en` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `description_ru` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `name_en` varchar(255);--> statement-breakpoint
ALTER TABLE `workers` ADD `name_ru` varchar(255);--> statement-breakpoint
ALTER TABLE `workers` ADD `bio_en` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `bio_ru` text;