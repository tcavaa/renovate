-- The categories the starting tree gained after 0018 (lib/catalog/defaultTree.ts, which
-- tests/unit/catalog/defaultTree.test.ts keeps in step with 0018 and this file): the TV and
-- data sockets, the technical points' equipment under "Building services" (a panel, a boiler,
-- an air conditioner, a cooker hood, an extractor fan, a floor drain — lib/design/equipment.ts)
-- and the kitchen maker's materials for made-to-measure kitchens, priced per m² of façade
-- (lib/design/kitchen.ts). Idempotent, as 0018 is: a category that exists is placed under its
-- parent only while it has none, one that does not is made, and products of the new kinds move
-- to their category. The products themselves come from `pnpm models:seed`.
-- tv-sockets under sockets-switches
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sockets-switches');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ტელევიზორის როზეტები', 'TV sockets', 'ТВ-розетки', 'tv-sockets', 'tv', 'per_unit', 1, 0, 0, 'socket_tv', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'tv-sockets');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'socket_tv') WHERE `slug` = 'tv-sockets' AND `parent_id` IS NULL;
--> statement-breakpoint
-- data-sockets under sockets-switches
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sockets-switches');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ინტერნეტის როზეტები', 'Data sockets', 'Интернет-розетки', 'data-sockets', 'ethernet-port', 'per_unit', 1, 0, 0, 'socket_data', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'data-sockets');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'socket_data') WHERE `slug` = 'data-sockets' AND `parent_id` IS NULL;
--> statement-breakpoint
-- engineering under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'საინჟინრო სისტემები', 'Building services', 'Инженерные системы', 'engineering', 'wrench', 'per_unit', 1, 0, 0, NULL, 80, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 80 WHERE `slug` = 'engineering' AND `parent_id` IS NULL;
--> statement-breakpoint
-- electrical-panels under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ელექტრო ფარები', 'Electrical panels', 'Электрощиты', 'electrical-panels', 'zap', 'per_unit', 1, 0, 0, 'electrical_panel', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'electrical-panels');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'electrical_panel') WHERE `slug` = 'electrical-panels' AND `parent_id` IS NULL;
--> statement-breakpoint
-- boilers under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ქვაბები და ბოილერები', 'Boilers & water heaters', 'Котлы и водонагреватели', 'boilers', 'flame', 'per_unit', 1, 0, 0, 'boiler', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'boilers');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'boiler') WHERE `slug` = 'boilers' AND `parent_id` IS NULL;
--> statement-breakpoint
-- air-conditioners under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კონდიციონერები', 'Air conditioners', 'Кондиционеры', 'air-conditioners', 'air-vent', 'per_unit', 1, 0, 0, 'ac_unit', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'air-conditioners');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'ac_unit') WHERE `slug` = 'air-conditioners' AND `parent_id` IS NULL;
--> statement-breakpoint
-- cooker-hoods under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამზარეულოს გამწოვები', 'Cooker hoods', 'Кухонные вытяжки', 'cooker-hoods', 'wind', 'per_unit', 1, 0, 0, 'cooker_hood', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'cooker-hoods');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'cooker_hood') WHERE `slug` = 'cooker-hoods' AND `parent_id` IS NULL;
--> statement-breakpoint
-- bathroom-fans under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'გამწოვი ვენტილატორები', 'Extractor fans', 'Вытяжные вентиляторы', 'bathroom-fans', 'fan', 'per_unit', 1, 0, 0, 'bathroom_fan', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'bathroom-fans');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `model_3d_kind` = COALESCE(`model_3d_kind`, 'bathroom_fan') WHERE `slug` = 'bathroom-fans' AND `parent_id` IS NULL;
--> statement-breakpoint
-- floor-drains under engineering
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'engineering');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'იატაკის ტრაპები', 'Floor drains', 'Трапы', 'floor-drains', 'circle-dot', 'per_unit', 1, 0, 0, 'floor_drain', 60, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'floor-drains');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 60, `model_3d_kind` = COALESCE(`model_3d_kind`, 'floor_drain') WHERE `slug` = 'floor-drains' AND `parent_id` IS NULL;
--> statement-breakpoint
-- kitchen-custom under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამზარეულოს ავეჯი — ინდივიდუალური დამზადება', 'Made-to-measure kitchens', 'Кухни на заказ', 'kitchen-custom', 'ruler', 'per_unit', 1, 0, 0, NULL, 80, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'kitchen-custom');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 80 WHERE `slug` = 'kitchen-custom' AND `parent_id` IS NULL;
--> statement-breakpoint
-- products of the new kinds to their categories
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'tv-sockets') WHERE `model_3d_kind` = 'socket_tv';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'data-sockets') WHERE `model_3d_kind` = 'socket_data';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'electrical-panels') WHERE `model_3d_kind` = 'electrical_panel';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'boilers') WHERE `model_3d_kind` = 'boiler';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'air-conditioners') WHERE `model_3d_kind` = 'ac_unit';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'cooker-hoods') WHERE `model_3d_kind` = 'cooker_hood';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'bathroom-fans') WHERE `model_3d_kind` = 'bathroom_fan';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'floor-drains') WHERE `model_3d_kind` = 'floor_drain';
