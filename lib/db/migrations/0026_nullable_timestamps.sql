-- Every nullable timestamp made explicitly `NULL DEFAULT NULL` (docs/data-model.md#migrations-run-on-mysql-and-mariadb).
-- drizzle-kit writes a nullable timestamp as a bare `timestamp`. MySQL 8 and MariaDB 10.10+
-- read that as NULL; a MariaDB older than 10.10 (or with explicit_defaults_for_timestamp=OFF)
-- reads it as NOT NULL DEFAULT '0000-00-00 00:00:00' — the table's first one even as DEFAULT
-- CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP. There "not yet" could never be NULL: a reset
-- token never unused (`used_at IS NULL`), an own item's credit never unclaimed (`consumed_at`),
-- a store order never "still with the platform" (`sent_at`). On a database that was right this
-- changes nothing; on one that was not, the columns are repaired and the zero dates made NULL.
-- An order's zero `sent_at` meant "sent" there, so it becomes its creation time instead.
ALTER TABLE `auth_tokens` MODIFY `used_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `auth_tokens` SET `used_at` = NULL WHERE `used_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `users` MODIFY `email_verified_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = NULL WHERE `email_verified_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `users` MODIFY `last_login_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `users` SET `last_login_at` = NULL WHERE `last_login_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `orders` MODIFY `viewed_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `orders` SET `viewed_at` = NULL WHERE `viewed_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `orders` MODIFY `sent_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `orders` SET `sent_at` = `created_at` WHERE `sent_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `orders` MODIFY `confirmed_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `orders` SET `confirmed_at` = NULL WHERE `confirmed_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `payments` MODIFY `last_event_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `payments` SET `last_event_at` = NULL WHERE `last_event_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `payments` MODIFY `paid_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `payments` SET `paid_at` = NULL WHERE `paid_at` < '1971-01-01';--> statement-breakpoint
ALTER TABLE `payments` MODIFY `consumed_at` timestamp NULL DEFAULT NULL;--> statement-breakpoint
UPDATE `payments` SET `consumed_at` = NULL WHERE `consumed_at` < '1971-01-01';
