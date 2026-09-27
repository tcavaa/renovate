-- The category tree and the studio's rooms the platform starts with (lib/catalog/defaultTree.ts,
-- which tests/unit/catalog/defaultTree.test.ts keeps in step with this file). Idempotent: a
-- category that exists is placed under its parent only while it has none, one that does not
-- is made; products move to the subcategory of their 3D kind; the rooms are made once.
-- Session variables carry a parent's id from one statement to the next (both migration
-- runners use one connection).
-- materials (top)
SET @parent := NULL;
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'მასალები', 'Materials', 'Материалы', 'materials', 'brick-wall', 'per_unit', 1, 0, 0, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'brick-wall' ELSE `icon` END WHERE `slug` = 'materials' AND `parent_id` IS NULL;
--> statement-breakpoint
-- tiles under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ფილები', 'Tiles', 'Плитка', 'tiles', 'grid-3x3', 'per_unit', 1, 0, 0, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'tiles');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'grid-3x3' ELSE `icon` END WHERE `slug` = 'tiles' AND `parent_id` IS NULL;
--> statement-breakpoint
-- floor-tiles under tiles
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'tiles');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'იატაკის ფილა', 'Floor Tiles', 'Напольная плитка', 'floor-tiles', 'grid-2x2', 'per_m2_floor', 1, 0, 1, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'floor-tiles');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'grid-2x2' ELSE `icon` END WHERE `slug` = 'floor-tiles' AND `parent_id` IS NULL;
--> statement-breakpoint
-- wall-tiles under tiles
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'tiles');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კედლის ფილა', 'Wall Tiles', 'Настенная плитка', 'wall-tiles', 'layout-grid', 'per_m2_wall', 1, 0, 1, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'wall-tiles');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'layout-grid' ELSE `icon` END WHERE `slug` = 'wall-tiles' AND `parent_id` IS NULL;
--> statement-breakpoint
-- flooring under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'იატაკი', 'Flooring', 'Напольные покрытия', 'flooring', 'layers', 'per_unit', 1, 0, 0, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'flooring');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'layers' ELSE `icon` END WHERE `slug` = 'flooring' AND `parent_id` IS NULL;
--> statement-breakpoint
-- laminate under flooring
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'flooring');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ლამინატი', 'Laminate Flooring', 'Ламинат', 'laminate', 'rows-3', 'per_m2_floor', 1, 0, 1, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'laminate');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rows-3' ELSE `icon` END WHERE `slug` = 'laminate' AND `parent_id` IS NULL;
--> statement-breakpoint
-- skirting under flooring
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'flooring');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'იატაკის პლინტუსი', 'Skirting boards', 'Напольные плинтусы', 'skirting', 'minus', 'per_linear_m', 1, 0, 1, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'skirting');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'minus' ELSE `icon` END WHERE `slug` = 'skirting' AND `parent_id` IS NULL;
--> statement-breakpoint
-- walls-ceilings under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კედლები და ჭერი', 'Walls and ceilings', 'Стены и потолки', 'walls-ceilings', 'paint-roller', 'per_unit', 1, 0, 0, NULL, 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'walls-ceilings');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'paint-roller' ELSE `icon` END WHERE `slug` = 'walls-ceilings' AND `parent_id` IS NULL;
--> statement-breakpoint
-- paint under walls-ceilings
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'walls-ceilings');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'საღებავი', 'Paint', 'Краска', 'paint', 'paint-bucket', 'per_m2_wall', 1, 0, 1, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'paint');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'paint-bucket' ELSE `icon` END WHERE `slug` = 'paint' AND `parent_id` IS NULL;
--> statement-breakpoint
-- cornice under walls-ceilings
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'walls-ceilings');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ჭერის პლინტუსი', 'Cornices', 'Потолочные плинтусы', 'cornice', 'frame', 'per_linear_m', 1, 0, 1, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'cornice');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'frame' ELSE `icon` END WHERE `slug` = 'cornice' AND `parent_id` IS NULL;
--> statement-breakpoint
-- doors under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კარები', 'Doors', 'Двери', 'doors', 'door-closed', 'per_unit', 1, 0, 1, NULL, 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'doors');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'door-closed' ELSE `icon` END WHERE `slug` = 'doors' AND `parent_id` IS NULL;
--> statement-breakpoint
-- interior-doors under doors
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'doors');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'შიდა კარები', 'Interior doors', 'Межкомнатные двери', 'interior-doors', 'door-open', 'per_unit', 1, 0, 0, 'door', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'interior-doors');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'door'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'door-open' ELSE `icon` END WHERE `slug` = 'interior-doors' AND `parent_id` IS NULL;
--> statement-breakpoint
-- entrance-doors under doors
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'doors');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'შესასვლელი კარები', 'Entrance doors', 'Входные двери', 'entrance-doors', 'door-closed', 'per_unit', 1, 0, 0, 'entrance_door', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'entrance-doors');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'entrance_door'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'door-closed' ELSE `icon` END WHERE `slug` = 'entrance-doors' AND `parent_id` IS NULL;
--> statement-breakpoint
-- windows under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ფანჯრები', 'Windows', 'Окна', 'windows', 'app-window', 'per_unit', 1, 0, 1, 'window', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'windows');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `in_calculator` = 1, `model_3d_kind` = COALESCE(`model_3d_kind`, 'window'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'app-window' ELSE `icon` END WHERE `slug` = 'windows' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sockets-switches under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'როზეტები/ამომრთველები', 'Sockets & Switches', 'Розетки и выключатели', 'sockets-switches', 'plug-zap', 'per_unit', 1, 0, 1, NULL, 60, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sockets-switches');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 60, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'plug-zap' ELSE `icon` END WHERE `slug` = 'sockets-switches' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sockets under sockets-switches
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sockets-switches');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'როზეტები', 'Sockets', 'Розетки', 'sockets', 'plug', 'per_unit', 1, 0, 0, 'socket', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sockets');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'socket'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'plug' ELSE `icon` END WHERE `slug` = 'sockets' AND `parent_id` IS NULL;
--> statement-breakpoint
-- switches under sockets-switches
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sockets-switches');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ამომრთველები', 'Switches', 'Выключатели', 'switches', 'toggle-left', 'per_unit', 1, 0, 0, 'switch', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'switches');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'switch'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'toggle-left' ELSE `icon` END WHERE `slug` = 'switches' AND `parent_id` IS NULL;
--> statement-breakpoint
-- radiators under materials
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'materials');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'რადიატორები', 'Radiators', 'Радиаторы', 'radiators', 'heater', 'per_unit', 1, 0, 1, 'radiator', 70, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'radiators');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 70, `in_calculator` = 1, `model_3d_kind` = COALESCE(`model_3d_kind`, 'radiator'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'heater' ELSE `icon` END WHERE `slug` = 'radiators' AND `parent_id` IS NULL;
--> statement-breakpoint
-- lighting (top)
SET @parent := NULL;
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'განათება', 'Lighting', 'Освещение', 'lighting', 'lightbulb', 'per_unit', 1, 0, 1, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lightbulb' ELSE `icon` END WHERE `slug` = 'lighting' AND `parent_id` IS NULL;
--> statement-breakpoint
-- pendant-lights under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ჭაღები', 'Pendant lights', 'Подвесные светильники', 'pendant-lights', 'lamp-ceiling', 'per_unit', 1, 0, 0, 'pendant', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'pendant-lights');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'pendant'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lamp-ceiling' ELSE `icon` END WHERE `slug` = 'pendant-lights' AND `parent_id` IS NULL;
--> statement-breakpoint
-- ceiling-lights under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ჭერის სანათები', 'Ceiling lights', 'Потолочные светильники', 'ceiling-lights', 'lightbulb', 'per_unit', 1, 0, 0, 'light_ceiling', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'ceiling-lights');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'light_ceiling'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lightbulb' ELSE `icon` END WHERE `slug` = 'ceiling-lights' AND `parent_id` IS NULL;
--> statement-breakpoint
-- wall-lights under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კედლის სანათები', 'Wall lights', 'Настенные светильники', 'wall-lights', 'lamp-wall-up', 'per_unit', 1, 0, 0, 'light_wall', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'wall-lights');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'light_wall'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lamp-wall-up' ELSE `icon` END WHERE `slug` = 'wall-lights' AND `parent_id` IS NULL;
--> statement-breakpoint
-- spotlights under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'წერტილოვანი სანათები', 'Spotlights', 'Точечные светильники', 'spotlights', 'circle-dot', 'per_unit', 1, 0, 0, 'light_spot', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'spotlights');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'light_spot'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'circle-dot' ELSE `icon` END WHERE `slug` = 'spotlights' AND `parent_id` IS NULL;
--> statement-breakpoint
-- led-strips under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'LED ლენტები', 'LED strips', 'LED-ленты', 'led-strips', 'rows-2', 'per_unit', 1, 0, 0, 'light_strip', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'led-strips');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `model_3d_kind` = COALESCE(`model_3d_kind`, 'light_strip'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rows-2' ELSE `icon` END WHERE `slug` = 'led-strips' AND `parent_id` IS NULL;
--> statement-breakpoint
-- furniture-lights under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ავეჯის განათება', 'Furniture lights', 'Мебельная подсветка', 'furniture-lights', 'lamp-desk', 'per_unit', 1, 0, 0, 'light_furniture', 60, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'furniture-lights');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 60, `model_3d_kind` = COALESCE(`model_3d_kind`, 'light_furniture'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lamp-desk' ELSE `icon` END WHERE `slug` = 'furniture-lights' AND `parent_id` IS NULL;
--> statement-breakpoint
-- floor-lamps under lighting
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'lighting');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'იატაკის სანათები', 'Floor lamps', 'Торшеры', 'floor-lamps', 'lamp-floor', 'per_unit', 1, 0, 0, 'floor_lamp', 70, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'floor-lamps');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 70, `model_3d_kind` = COALESCE(`model_3d_kind`, 'floor_lamp'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'lamp-floor' ELSE `icon` END WHERE `slug` = 'floor-lamps' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sanitary (top)
SET @parent := NULL;
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სანიტარია', 'Sanitary', 'Сантехника', 'sanitary', 'bath', 'per_unit', 1, 0, 1, NULL, 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'bath' ELSE `icon` END WHERE `slug` = 'sanitary' AND `parent_id` IS NULL;
--> statement-breakpoint
-- toilets under sanitary
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'უნიტაზები', 'Toilets', 'Унитазы', 'toilets', 'toilet', 'per_unit', 1, 0, 0, 'toilet', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'toilets');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'toilet'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'toilet' ELSE `icon` END WHERE `slug` = 'toilets' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sinks under sanitary
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ნიჟარები', 'Sinks', 'Раковины', 'sinks', 'sink', 'per_unit', 1, 0, 0, 'sink', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sinks');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'sink'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'sink' ELSE `icon` END WHERE `slug` = 'sinks' AND `parent_id` IS NULL;
--> statement-breakpoint
-- showers under sanitary
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'შხაპები', 'Showers', 'Душевые', 'showers', 'shower-head', 'per_unit', 1, 0, 0, 'shower', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'showers');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'shower'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'shower-head' ELSE `icon` END WHERE `slug` = 'showers' AND `parent_id` IS NULL;
--> statement-breakpoint
-- bathtubs under sanitary
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'აბაზანები', 'Bathtubs', 'Ванны', 'bathtubs', 'bath', 'per_unit', 1, 0, 0, 'bathtub', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'bathtubs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'bathtub'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'bath' ELSE `icon` END WHERE `slug` = 'bathtubs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- washing-machines under sanitary
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sanitary');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სარეცხი მანქანები', 'Washing machines', 'Стиральные машины', 'washing-machines', 'washing-machine', 'per_unit', 1, 0, 0, 'washer', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'washing-machines');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `model_3d_kind` = COALESCE(`model_3d_kind`, 'washer'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'washing-machine' ELSE `icon` END WHERE `slug` = 'washing-machines' AND `parent_id` IS NULL;
--> statement-breakpoint
-- furniture (top)
SET @parent := NULL;
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ავეჯი', 'Furniture', 'Мебель', 'furniture', 'sofa', 'per_unit', 1, 1, 0, NULL, 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'sofa' ELSE `icon` END WHERE `slug` = 'furniture' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sofas under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სავარძლები/დივნები', 'Sofas & Armchairs', 'Диваны и кресла', 'sofas', 'sofa', 'per_unit', 1, 1, 1, NULL, 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sofas');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'sofa' ELSE `icon` END WHERE `slug` = 'sofas' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sofas-three-seat under sofas
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sofas');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამადგილიანი დივნები', 'Three-seat sofas', 'Трёхместные диваны', 'sofas-three-seat', 'sofa', 'per_unit', 1, 1, 0, 'sofa_3seat', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sofas-three-seat');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'sofa_3seat'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'sofa' ELSE `icon` END WHERE `slug` = 'sofas-three-seat' AND `parent_id` IS NULL;
--> statement-breakpoint
-- sofas-corner under sofas
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sofas');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კუთხის დივნები', 'Corner sofas', 'Угловые диваны', 'sofas-corner', 'sofa-corner', 'per_unit', 1, 1, 0, 'sofa_corner', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'sofas-corner');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'sofa_corner'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'sofa-corner' ELSE `icon` END WHERE `slug` = 'sofas-corner' AND `parent_id` IS NULL;
--> statement-breakpoint
-- armchairs under sofas
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'sofas');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სავარძლები', 'Armchairs', 'Кресла', 'armchairs', 'armchair', 'per_unit', 1, 1, 0, 'armchair', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'armchairs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'armchair'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'armchair' ELSE `icon` END WHERE `slug` = 'armchairs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- beds under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'საწოლები', 'Beds', 'Кровати', 'beds', 'bed-double', 'per_unit', 1, 1, 1, NULL, 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'beds');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'bed-double' ELSE `icon` END WHERE `slug` = 'beds' AND `parent_id` IS NULL;
--> statement-breakpoint
-- beds-double under beds
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'beds');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ორადგილიანი საწოლები', 'Double beds', 'Двуспальные кровати', 'beds-double', 'bed-double', 'per_unit', 1, 1, 0, 'bed_double', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'beds-double');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'bed_double'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'bed-double' ELSE `icon` END WHERE `slug` = 'beds-double' AND `parent_id` IS NULL;
--> statement-breakpoint
-- beds-single under beds
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'beds');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ერთადგილიანი საწოლები', 'Single beds', 'Односпальные кровати', 'beds-single', 'bed-single', 'per_unit', 1, 1, 0, 'bed_single', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'beds-single');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'bed_single'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'bed-single' ELSE `icon` END WHERE `slug` = 'beds-single' AND `parent_id` IS NULL;
--> statement-breakpoint
-- tables under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'მაგიდები', 'Tables', 'Столы', 'tables', 'coffee-table', 'per_unit', 1, 1, 1, NULL, 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'tables');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'coffee-table' ELSE `icon` END WHERE `slug` = 'tables' AND `parent_id` IS NULL;
--> statement-breakpoint
-- coffee-tables under tables
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'tables');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ჟურნალის მაგიდები', 'Coffee tables', 'Журнальные столики', 'coffee-tables', 'coffee-table', 'per_unit', 1, 1, 0, 'coffee_table', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'coffee-tables');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'coffee_table'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'coffee-table' ELSE `icon` END WHERE `slug` = 'coffee-tables' AND `parent_id` IS NULL;
--> statement-breakpoint
-- dining-tables under tables
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'tables');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სასადილო მაგიდები', 'Dining tables', 'Обеденные столы', 'dining-tables', 'utensils-crossed', 'per_unit', 1, 1, 0, 'dining_table', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'dining-tables');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'dining_table'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'utensils-crossed' ELSE `icon` END WHERE `slug` = 'dining-tables' AND `parent_id` IS NULL;
--> statement-breakpoint
-- desks under tables
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'tables');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამუშაო მაგიდები', 'Desks', 'Письменные столы', 'desks', 'desk', 'per_unit', 1, 1, 0, 'desk', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'desks');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'desk'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'desk' ELSE `icon` END WHERE `slug` = 'desks' AND `parent_id` IS NULL;
--> statement-breakpoint
-- chairs under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სკამები', 'Chairs', 'Стулья', 'chairs', 'dining-chair', 'per_unit', 1, 1, 1, NULL, 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'chairs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'dining-chair' ELSE `icon` END WHERE `slug` = 'chairs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- dining-chairs under chairs
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'chairs');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სასადილო სკამები', 'Dining chairs', 'Обеденные стулья', 'dining-chairs', 'dining-chair', 'per_unit', 1, 1, 0, 'dining_chair', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'dining-chairs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'dining_chair'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'dining-chair' ELSE `icon` END WHERE `slug` = 'dining-chairs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- office-chairs under chairs
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'chairs');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'საოფისე სკამები', 'Office chairs', 'Офисные кресла', 'office-chairs', 'office-chair', 'per_unit', 1, 1, 0, 'office_chair', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'office-chairs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'office_chair'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'office-chair' ELSE `icon` END WHERE `slug` = 'office-chairs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- wardrobes under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კარადები', 'Wardrobes', 'Шкафы', 'wardrobes', 'wardrobe', 'per_unit', 1, 1, 1, 'wardrobe', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'wardrobes');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `in_calculator` = 1, `model_3d_kind` = COALESCE(`model_3d_kind`, 'wardrobe'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'wardrobe' ELSE `icon` END WHERE `slug` = 'wardrobes' AND `parent_id` IS NULL;
--> statement-breakpoint
-- storage under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'შენახვა/თარო', 'Storage & Shelving', 'Хранение и полки', 'storage', 'dresser', 'per_unit', 1, 1, 1, NULL, 60, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 60, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'dresser' ELSE `icon` END WHERE `slug` = 'storage' AND `parent_id` IS NULL;
--> statement-breakpoint
-- nightstands under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ღამის მაგიდები', 'Nightstands', 'Прикроватные тумбы', 'nightstands', 'nightstand', 'per_unit', 1, 1, 0, 'nightstand', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'nightstands');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'nightstand'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'nightstand' ELSE `icon` END WHERE `slug` = 'nightstands' AND `parent_id` IS NULL;
--> statement-breakpoint
-- dressers under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კომოდები', 'Dressers', 'Комоды', 'dressers', 'dresser', 'per_unit', 1, 1, 0, 'dresser', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'dressers');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'dresser'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'dresser' ELSE `icon` END WHERE `slug` = 'dressers' AND `parent_id` IS NULL;
--> statement-breakpoint
-- tv-units under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ტელევიზორის თაროები', 'TV units', 'ТВ-тумбы', 'tv-units', 'tv', 'per_unit', 1, 1, 0, 'tv_unit', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'tv-units');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'tv_unit'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'tv' ELSE `icon` END WHERE `slug` = 'tv-units' AND `parent_id` IS NULL;
--> statement-breakpoint
-- bookshelves under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'წიგნების თაროები', 'Bookshelves', 'Книжные шкафы', 'bookshelves', 'library-big', 'per_unit', 1, 1, 0, 'bookshelf', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'bookshelves');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'bookshelf'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'library-big' ELSE `icon` END WHERE `slug` = 'bookshelves' AND `parent_id` IS NULL;
--> statement-breakpoint
-- open-shelving under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ღია სტელაჟები', 'Open shelving', 'Открытые стеллажи', 'open-shelving', 'rows-3', 'per_unit', 1, 1, 0, 'storage_shelf', 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'open-shelving');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `model_3d_kind` = COALESCE(`model_3d_kind`, 'storage_shelf'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rows-3' ELSE `icon` END WHERE `slug` = 'open-shelving' AND `parent_id` IS NULL;
--> statement-breakpoint
-- console-tables under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'კონსოლები', 'Console tables', 'Консоли', 'console-tables', 'console-table', 'per_unit', 1, 1, 0, 'console_table', 60, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'console-tables');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 60, `model_3d_kind` = COALESCE(`model_3d_kind`, 'console_table'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'console-table' ELSE `icon` END WHERE `slug` = 'console-tables' AND `parent_id` IS NULL;
--> statement-breakpoint
-- shoe-cabinets under storage
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'storage');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ფეხსაცმლის კარადები', 'Shoe cabinets', 'Обувницы', 'shoe-cabinets', 'footprints', 'per_unit', 1, 1, 0, 'shoe_cabinet', 70, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'shoe-cabinets');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 70, `model_3d_kind` = COALESCE(`model_3d_kind`, 'shoe_cabinet'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'footprints' ELSE `icon` END WHERE `slug` = 'shoe-cabinets' AND `parent_id` IS NULL;
--> statement-breakpoint
-- kitchen-furniture under furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამზარეულოს ავეჯი', 'Kitchen Furniture', 'Кухонная мебель', 'kitchen-furniture', 'kitchen-run', 'per_unit', 1, 1, 1, NULL, 70, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'kitchen-furniture');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 70, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'kitchen-run' ELSE `icon` END WHERE `slug` = 'kitchen-furniture' AND `parent_id` IS NULL;
--> statement-breakpoint
-- kitchen-units under kitchen-furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'kitchen-furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამზარეულოს კარადები', 'Kitchen units', 'Кухонные гарнитуры', 'kitchen-units', 'kitchen-run', 'per_unit', 1, 1, 0, 'kitchen_run', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'kitchen-units');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'kitchen_run'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'kitchen-run' ELSE `icon` END WHERE `slug` = 'kitchen-units' AND `parent_id` IS NULL;
--> statement-breakpoint
-- kitchen-islands under kitchen-furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'kitchen-furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სამზარეულოს კუნძულები', 'Kitchen islands', 'Кухонные острова', 'kitchen-islands', 'kitchen-island', 'per_unit', 1, 1, 0, 'kitchen_island', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'kitchen-islands');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'kitchen_island'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'kitchen-island' ELSE `icon` END WHERE `slug` = 'kitchen-islands' AND `parent_id` IS NULL;
--> statement-breakpoint
-- fridges under kitchen-furniture
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'kitchen-furniture');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'მაცივრები', 'Fridges', 'Холодильники', 'fridges', 'refrigerator', 'per_unit', 1, 1, 0, 'fridge', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'fridges');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'fridge'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'refrigerator' ELSE `icon` END WHERE `slug` = 'fridges' AND `parent_id` IS NULL;
--> statement-breakpoint
-- decor (top)
SET @parent := NULL;
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'დეკორი', 'Decor', 'Декор', 'decor', 'flower-2', 'per_unit', 1, 1, 1, NULL, 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'flower-2' ELSE `icon` END WHERE `slug` = 'decor' AND `parent_id` IS NULL;
--> statement-breakpoint
-- artwork under decor
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ნახატები', 'Artwork', 'Картины', 'artwork', 'image', 'per_unit', 1, 1, 0, 'artwork', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'artwork');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'artwork'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'image' ELSE `icon` END WHERE `slug` = 'artwork' AND `parent_id` IS NULL;
--> statement-breakpoint
-- plants under decor
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'მცენარეები', 'Plants', 'Растения', 'plants', 'flower-2', 'per_unit', 1, 1, 0, 'plant', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'plants');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'plant'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'flower-2' ELSE `icon` END WHERE `slug` = 'plants' AND `parent_id` IS NULL;
--> statement-breakpoint
-- mirrors under decor
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'სარკეები', 'Mirrors', 'Зеркала', 'mirrors', 'mirror', 'per_unit', 1, 1, 0, 'mirror', 30, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'mirrors');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 30, `model_3d_kind` = COALESCE(`model_3d_kind`, 'mirror'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'mirror' ELSE `icon` END WHERE `slug` = 'mirrors' AND `parent_id` IS NULL;
--> statement-breakpoint
-- curtains under decor
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ფარდები', 'Curtains', 'Шторы', 'curtains', 'blinds', 'per_unit', 1, 1, 0, 'curtain', 40, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'curtains');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 40, `model_3d_kind` = COALESCE(`model_3d_kind`, 'curtain'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'blinds' ELSE `icon` END WHERE `slug` = 'curtains' AND `parent_id` IS NULL;
--> statement-breakpoint
-- rugs under decor
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'decor');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ხალიჩები', 'Rugs', 'Ковры', 'rugs', 'rug', 'per_unit', 1, 1, 1, NULL, 50, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'rugs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 50, `in_calculator` = 1, `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rug' ELSE `icon` END WHERE `slug` = 'rugs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- area-rugs under rugs
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'rugs');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'ოთახის ხალიჩები', 'Area rugs', 'Ковры для комнаты', 'area-rugs', 'rug', 'per_unit', 1, 1, 0, 'rug', 10, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'area-rugs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 10, `model_3d_kind` = COALESCE(`model_3d_kind`, 'rug'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rug' ELSE `icon` END WHERE `slug` = 'area-rugs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- bedside-rugs under rugs
SET @parent := (SELECT `id` FROM `categories` WHERE `slug` = 'rugs');
--> statement-breakpoint
INSERT INTO `categories` (`name_ka`, `name_en`, `name_ru`, `slug`, `icon`, `calculation_type`, `is_visible`, `is_furniture`, `in_calculator`, `model_3d_kind`, `sort_order`, `parent_id`) SELECT 'საწოლის ხალიჩები', 'Bedside rugs', 'Прикроватные коврики', 'bedside-rugs', 'rug-bedside', 'per_unit', 1, 1, 0, 'rug_bed', 20, @parent FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `slug` = 'bedside-rugs');
--> statement-breakpoint
UPDATE `categories` SET `parent_id` = @parent, `sort_order` = 20, `model_3d_kind` = COALESCE(`model_3d_kind`, 'rug_bed'), `icon` = CASE WHEN `icon` IS NULL OR `icon` = '' OR `icon` IN ('minus', 'flame', 'square', 'frame') THEN 'rug-bedside' ELSE `icon` END WHERE `slug` = 'bedside-rugs' AND `parent_id` IS NULL;
--> statement-breakpoint
-- Every product with a 3D kind goes to its kind's category.
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'interior-doors') WHERE `model_3d_kind` = 'door';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'entrance-doors') WHERE `model_3d_kind` = 'entrance_door';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'windows') WHERE `model_3d_kind` = 'window';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'sockets') WHERE `model_3d_kind` = 'socket';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'switches') WHERE `model_3d_kind` = 'switch';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'radiators') WHERE `model_3d_kind` = 'radiator';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'pendant-lights') WHERE `model_3d_kind` = 'pendant';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'ceiling-lights') WHERE `model_3d_kind` = 'light_ceiling';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'wall-lights') WHERE `model_3d_kind` = 'light_wall';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'spotlights') WHERE `model_3d_kind` = 'light_spot';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'led-strips') WHERE `model_3d_kind` = 'light_strip';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'furniture-lights') WHERE `model_3d_kind` = 'light_furniture';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'floor-lamps') WHERE `model_3d_kind` = 'floor_lamp';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'toilets') WHERE `model_3d_kind` = 'toilet';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'sinks') WHERE `model_3d_kind` = 'sink';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'showers') WHERE `model_3d_kind` = 'shower';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'bathtubs') WHERE `model_3d_kind` = 'bathtub';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'washing-machines') WHERE `model_3d_kind` = 'washer';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'sofas-three-seat') WHERE `model_3d_kind` = 'sofa_3seat';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'sofas-corner') WHERE `model_3d_kind` = 'sofa_corner';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'armchairs') WHERE `model_3d_kind` = 'armchair';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'beds-double') WHERE `model_3d_kind` = 'bed_double';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'beds-single') WHERE `model_3d_kind` = 'bed_single';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'coffee-tables') WHERE `model_3d_kind` = 'coffee_table';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'dining-tables') WHERE `model_3d_kind` = 'dining_table';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'desks') WHERE `model_3d_kind` = 'desk';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'dining-chairs') WHERE `model_3d_kind` = 'dining_chair';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'office-chairs') WHERE `model_3d_kind` = 'office_chair';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'wardrobes') WHERE `model_3d_kind` = 'wardrobe';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'nightstands') WHERE `model_3d_kind` = 'nightstand';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'dressers') WHERE `model_3d_kind` = 'dresser';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'tv-units') WHERE `model_3d_kind` = 'tv_unit';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'bookshelves') WHERE `model_3d_kind` = 'bookshelf';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'open-shelving') WHERE `model_3d_kind` = 'storage_shelf';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'console-tables') WHERE `model_3d_kind` = 'console_table';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'shoe-cabinets') WHERE `model_3d_kind` = 'shoe_cabinet';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'kitchen-units') WHERE `model_3d_kind` = 'kitchen_run';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'kitchen-islands') WHERE `model_3d_kind` = 'kitchen_island';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'fridges') WHERE `model_3d_kind` = 'fridge';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'artwork') WHERE `model_3d_kind` = 'artwork';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'plants') WHERE `model_3d_kind` = 'plant';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'mirrors') WHERE `model_3d_kind` = 'mirror';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'curtains') WHERE `model_3d_kind` = 'curtain';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'area-rugs') WHERE `model_3d_kind` = 'rug';
--> statement-breakpoint
UPDATE `products` SET `category_id` = (SELECT `id` FROM `categories` WHERE `slug` = 'bedside-rugs') WHERE `model_3d_kind` = 'rug_bed';
--> statement-breakpoint
-- The studio's rooms, as the shelf had them in code.
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'living-room', 'მისაღები ოთახი', 'Living room', 'Гостиная', 'sofa', '["living_room"]', 1, 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'living-room');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'sofas-three-seat' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'sofas-corner' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'coffee-tables' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'tv-units' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'armchairs' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 60 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bookshelves' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 70 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'open-shelving' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 80 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'area-rugs' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 90 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bedside-rugs' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 100 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'floor-lamps' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 110 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 120 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'artwork' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 130 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'plants' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 140 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'curtains' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 150 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'dining-tables' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 160 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'dining-chairs' WHERE r.`slug` = 'living-room';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'bedroom', 'საძინებელი', 'Bedroom', 'Спальня', 'bed-double', '["bedroom"]', 1, 20 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'bedroom');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'beds-double' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'beds-single' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'nightstands' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'wardrobes' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'dressers' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 60 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bedside-rugs' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 70 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'area-rugs' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 80 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 90 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'artwork' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 100 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'curtains' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 110 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'plants' WHERE r.`slug` = 'bedroom';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'kitchen', 'სამზარეულო', 'Kitchen', 'Кухня', 'cooking-pot', '["kitchen"]', 1, 30 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'kitchen');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'kitchen-units' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'fridges' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'kitchen-islands' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'dining-tables' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'dining-chairs' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 60 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 70 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'curtains' WHERE r.`slug` = 'kitchen';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'bathroom', 'სველი წერტილი', 'Bathroom', 'Санузел', 'bath', '["bathroom"]', 1, 40 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'bathroom');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'toilets' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'sinks' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'showers' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bathtubs' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'washing-machines' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 60 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'mirrors' WHERE r.`slug` = 'bathroom';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'toilet', 'ტუალეტი', 'Toilet', 'Туалет', 'toilet', '["toilet"]', 1, 50 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'toilet');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'toilets' WHERE r.`slug` = 'toilet';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'sinks' WHERE r.`slug` = 'toilet';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'mirrors' WHERE r.`slug` = 'toilet';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'hallway', 'დერეფანი', 'Hallway', 'Коридор', 'door-open', '["hallway"]', 1, 60 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'hallway');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'console-tables' WHERE r.`slug` = 'hallway';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'shoe-cabinets' WHERE r.`slug` = 'hallway';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'mirrors' WHERE r.`slug` = 'hallway';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'hallway';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'plants' WHERE r.`slug` = 'hallway';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'office', 'საოფისე ოთახი', 'Office', 'Кабинет', 'briefcase-business', '["office"]', 1, 70 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'office');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'desks' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'office-chairs' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bookshelves' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 40 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'open-shelving' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 50 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'armchairs' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 60 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'area-rugs' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 70 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bedside-rugs' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 80 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 90 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'artwork' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 100 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'curtains' WHERE r.`slug` = 'office';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'closet', 'გარდერობი', 'Closet / wardrobe', 'Гардеробная', 'shirt', '["closet"]', 1, 80 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'closet');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'wardrobes' WHERE r.`slug` = 'closet';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'mirrors' WHERE r.`slug` = 'closet';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'closet';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'balcony', 'აივანი', 'Balcony', 'Балкон', 'sun', '["balcony"]', 1, 90 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'balcony');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'armchairs' WHERE r.`slug` = 'balcony';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'plants' WHERE r.`slug` = 'balcony';
--> statement-breakpoint
INSERT INTO `shelf_rooms` (`slug`, `name_ka`, `name_en`, `name_ru`, `icon`, `room_types`, `is_visible`, `sort_order`) SELECT 'storage-room', 'საწყობი', 'Storage', 'Кладовая', 'warehouse', '["storage"]', 1, 100 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `shelf_rooms` WHERE `slug` = 'storage-room');
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 10 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'open-shelving' WHERE r.`slug` = 'storage-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 20 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'bookshelves' WHERE r.`slug` = 'storage-room';
--> statement-breakpoint
INSERT IGNORE INTO `shelf_room_categories` (`shelf_room_id`, `category_id`, `sort_order`) SELECT r.`id`, c.`id`, 30 FROM `shelf_rooms` r JOIN `categories` c ON c.`slug` = 'pendant-lights' WHERE r.`slug` = 'storage-room';
