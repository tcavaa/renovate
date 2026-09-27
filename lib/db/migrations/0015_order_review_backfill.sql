-- Orders the partner already has stay theirs: every booking, and every store order the store
-- has opened or answered. A store order still new and unread goes to the orders agent's queue,
-- as every store order does from now on (`orders.sent_at` NULL = still with the platform).
UPDATE `orders` SET `sent_at` = `created_at` WHERE `sent_at` IS NULL AND NOT (`partner_type` = 'store' AND `status` = 'new' AND `viewed_at` IS NULL);
--> statement-breakpoint
UPDATE `orders` SET `original_delivery_fee` = `delivery_fee` WHERE `original_delivery_fee` IS NULL;
--> statement-breakpoint
UPDATE `order_items` SET `original_qty` = `qty`, `original_unit_price` = `unit_price` WHERE `original_qty` IS NULL;
--> statement-breakpoint
-- The store that supplies the rate book's construction materials (one for now; admin can
-- point the setting at another in /admin/settings).
INSERT INTO `stores` (`name_ka`, `name_en`, `name_ru`, `description_ka`, `description_en`, `description_ru`, `city`, `delivery_days`, `delivery_fee_gel`, `commission_rate`, `approval_status`, `is_active`)
SELECT 'სამშენებლო მასალები', 'Building Materials', 'Строительные материалы',
  'ცემენტი, ქვიშა, ბლოკი, შპაკლი, თაბაშირ-მუყაო, მილები და სადენი — ყველაფერი, რასაც რემონტის სამუშაოები ითხოვს, ერთი მიწოდებით.',
  'Cement, sand, blocks, putty, plasterboard, pipes and cable — everything the renovation works call for, in one delivery.',
  'Цемент, песок, блоки, шпаклёвка, гипсокартон, трубы и кабель — всё, что нужно для ремонтных работ, одной доставкой.',
  'თბილისი', 2, 50.00, 5.00, 'approved', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `stores` WHERE `name_ka` = 'სამშენებლო მასალები');
--> statement-breakpoint
INSERT INTO `platform_settings` (`calculator_fee_per_m2`) SELECT 2.00 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `platform_settings`);
--> statement-breakpoint
UPDATE `platform_settings` SET `materials_store_id` = (SELECT `id` FROM `stores` WHERE `name_ka` = 'სამშენებლო მასალები' LIMIT 1) WHERE `materials_store_id` IS NULL;
