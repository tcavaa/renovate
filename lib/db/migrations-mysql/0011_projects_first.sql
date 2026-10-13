ALTER TABLE `projects` MODIFY COLUMN `home_state` enum('old_renovation','black_frame','white_frame','green_frame');--> statement-breakpoint
ALTER TABLE `projects` ADD `calculator_board` json;