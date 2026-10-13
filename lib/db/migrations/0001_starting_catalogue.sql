-- The catalogue a new database starts with, as the MySQL history left one (migrations 0015, 0018, 0020 and
-- 0023 there, lib/db/migrations-mysql): the category tree and the studio's rooms of lib/catalog/defaultTree.ts
-- (tests/unit/catalog/defaultTree.test.ts keeps this file in step with it), the store that supplies the rate
-- book's construction materials and the platform settings that name it, and the twelve interior paints the
-- styles colour their rooms in (scripts/stock-textures.ts writes the same products with their textures).
-- Idempotent: a category, room, store or product that exists is left as it is. A database copied from MySQL
-- (scripts/copy-mysql-to-postgres.ts) has its own rows instead: the copy empties the tables first.
-- materials (top)
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('მასალები', 'Materials', 'Материалы', 'materials', 'brick-wall', 'per_unit', true, false, false, NULL, 10, NULL) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- tiles under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ფილები', 'Tiles', 'Плитка', 'tiles', 'grid-3x3', 'per_unit', true, false, false, NULL, 10, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- floor-tiles under tiles
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('იატაკის ფილა', 'Floor Tiles', 'Напольная плитка', 'floor-tiles', 'grid-2x2', 'per_m2_floor', true, false, true, NULL, 10, (SELECT "id" FROM "categories" WHERE "slug" = 'tiles')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- wall-tiles under tiles
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კედლის ფილა', 'Wall Tiles', 'Настенная плитка', 'wall-tiles', 'layout-grid', 'per_m2_wall', true, false, true, NULL, 20, (SELECT "id" FROM "categories" WHERE "slug" = 'tiles')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- flooring under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('იატაკი', 'Flooring', 'Напольные покрытия', 'flooring', 'layers', 'per_unit', true, false, false, NULL, 20, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- laminate under flooring
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ლამინატი', 'Laminate Flooring', 'Ламинат', 'laminate', 'rows-3', 'per_m2_floor', true, false, true, NULL, 10, (SELECT "id" FROM "categories" WHERE "slug" = 'flooring')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- skirting under flooring
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('იატაკის პლინტუსი', 'Skirting boards', 'Напольные плинтусы', 'skirting', 'minus', 'per_linear_m', true, false, true, NULL, 20, (SELECT "id" FROM "categories" WHERE "slug" = 'flooring')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- walls-ceilings under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კედლები და ჭერი', 'Walls and ceilings', 'Стены и потолки', 'walls-ceilings', 'paint-roller', 'per_unit', true, false, false, NULL, 30, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- paint under walls-ceilings
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საღებავი', 'Paint', 'Краска', 'paint', 'paint-bucket', 'per_m2_wall', true, false, true, NULL, 10, (SELECT "id" FROM "categories" WHERE "slug" = 'walls-ceilings')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- cornice under walls-ceilings
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ჭერის პლინტუსი', 'Cornices', 'Потолочные плинтусы', 'cornice', 'frame', 'per_linear_m', true, false, true, NULL, 20, (SELECT "id" FROM "categories" WHERE "slug" = 'walls-ceilings')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- doors under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კარები', 'Doors', 'Двери', 'doors', 'door-closed', 'per_unit', true, false, true, NULL, 40, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- interior-doors under doors
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('შიდა კარები', 'Interior doors', 'Межкомнатные двери', 'interior-doors', 'door-open', 'per_unit', true, false, false, 'door', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'doors')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- entrance-doors under doors
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('შესასვლელი კარები', 'Entrance doors', 'Входные двери', 'entrance-doors', 'door-closed', 'per_unit', true, false, false, 'entrance_door', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'doors')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- windows under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ფანჯრები', 'Windows', 'Окна', 'windows', 'app-window', 'per_unit', true, false, true, 'window', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sockets-switches under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('როზეტები/ამომრთველები', 'Sockets & Switches', 'Розетки и выключатели', 'sockets-switches', 'plug-zap', 'per_unit', true, false, true, NULL, 60, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sockets under sockets-switches
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('როზეტები', 'Sockets', 'Розетки', 'sockets', 'plug', 'per_unit', true, false, false, 'socket', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'sockets-switches')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- switches under sockets-switches
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ამომრთველები', 'Switches', 'Выключатели', 'switches', 'toggle-left', 'per_unit', true, false, false, 'switch', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'sockets-switches')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- tv-sockets under sockets-switches
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ტელევიზორის როზეტები', 'TV sockets', 'ТВ-розетки', 'tv-sockets', 'tv', 'per_unit', true, false, false, 'socket_tv', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'sockets-switches')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- data-sockets under sockets-switches
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ინტერნეტის როზეტები', 'Data sockets', 'Интернет-розетки', 'data-sockets', 'ethernet-port', 'per_unit', true, false, false, 'socket_data', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'sockets-switches')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- radiators under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('რადიატორები', 'Radiators', 'Радиаторы', 'radiators', 'heater', 'per_unit', true, false, true, 'radiator', 70, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- engineering under materials
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საინჟინრო სისტემები', 'Building services', 'Инженерные системы', 'engineering', 'wrench', 'per_unit', true, false, false, NULL, 80, (SELECT "id" FROM "categories" WHERE "slug" = 'materials')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- electrical-panels under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ელექტრო ფარები', 'Electrical panels', 'Электрощиты', 'electrical-panels', 'zap', 'per_unit', true, false, false, 'electrical_panel', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- boilers under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ქვაბები და ბოილერები', 'Boilers & water heaters', 'Котлы и водонагреватели', 'boilers', 'flame', 'per_unit', true, false, false, 'boiler', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- air-conditioners under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კონდიციონერები', 'Air conditioners', 'Кондиционеры', 'air-conditioners', 'air-vent', 'per_unit', true, false, false, 'ac_unit', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- cooker-hoods under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს გამწოვები', 'Cooker hoods', 'Кухонные вытяжки', 'cooker-hoods', 'wind', 'per_unit', true, false, false, 'cooker_hood', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- bathroom-fans under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('გამწოვი ვენტილატორები', 'Extractor fans', 'Вытяжные вентиляторы', 'bathroom-fans', 'fan', 'per_unit', true, false, false, 'bathroom_fan', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- floor-drains under engineering
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('იატაკის ტრაპები', 'Floor drains', 'Трапы', 'floor-drains', 'circle-dot', 'per_unit', true, false, false, 'floor_drain', 60, (SELECT "id" FROM "categories" WHERE "slug" = 'engineering')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- lighting (top)
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('განათება', 'Lighting', 'Освещение', 'lighting', 'lightbulb', 'per_unit', true, false, true, NULL, 20, NULL) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- pendant-lights under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ჭაღები', 'Pendant lights', 'Подвесные светильники', 'pendant-lights', 'lamp-ceiling', 'per_unit', true, false, false, 'pendant', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- ceiling-lights under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ჭერის სანათები', 'Ceiling lights', 'Потолочные светильники', 'ceiling-lights', 'lightbulb', 'per_unit', true, false, false, 'light_ceiling', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- wall-lights under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კედლის სანათები', 'Wall lights', 'Настенные светильники', 'wall-lights', 'lamp-wall-up', 'per_unit', true, false, false, 'light_wall', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- spotlights under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('წერტილოვანი სანათები', 'Spotlights', 'Точечные светильники', 'spotlights', 'circle-dot', 'per_unit', true, false, false, 'light_spot', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- led-strips under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('LED ლენტები', 'LED strips', 'LED-ленты', 'led-strips', 'rows-2', 'per_unit', true, false, false, 'light_strip', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- furniture-lights under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ავეჯის განათება', 'Furniture lights', 'Мебельная подсветка', 'furniture-lights', 'lamp-desk', 'per_unit', true, false, false, 'light_furniture', 60, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- floor-lamps under lighting
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('იატაკის სანათები', 'Floor lamps', 'Торшеры', 'floor-lamps', 'lamp-floor', 'per_unit', true, false, false, 'floor_lamp', 70, (SELECT "id" FROM "categories" WHERE "slug" = 'lighting')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sanitary (top)
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სანიტარია', 'Sanitary', 'Сантехника', 'sanitary', 'bath', 'per_unit', true, false, true, NULL, 30, NULL) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- toilets under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('უნიტაზები', 'Toilets', 'Унитазы', 'toilets', 'toilet', 'per_unit', true, false, false, 'toilet', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sinks under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ნიჟარები', 'Sinks', 'Раковины', 'sinks', 'sink', 'per_unit', true, false, false, 'sink', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- showers under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('შხაპები', 'Showers', 'Душевые', 'showers', 'shower-head', 'per_unit', true, false, false, 'shower', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- bathtubs under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('აბაზანები', 'Bathtubs', 'Ванны', 'bathtubs', 'bath', 'per_unit', true, false, false, 'bathtub', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- washing-machines under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სარეცხი მანქანები', 'Washing machines', 'Стиральные машины', 'washing-machines', 'washing-machine', 'per_unit', true, false, false, 'washer', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- furniture (top)
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ავეჯი', 'Furniture', 'Мебель', 'furniture', 'sofa', 'per_unit', true, true, false, NULL, 40, NULL) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sofas under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სავარძლები/დივნები', 'Sofas & Armchairs', 'Диваны и кресла', 'sofas', 'sofa', 'per_unit', true, true, true, NULL, 10, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sofas-three-seat under sofas
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამადგილიანი დივნები', 'Three-seat sofas', 'Трёхместные диваны', 'sofas-three-seat', 'sofa', 'per_unit', true, true, false, 'sofa_3seat', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'sofas')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- sofas-corner under sofas
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კუთხის დივნები', 'Corner sofas', 'Угловые диваны', 'sofas-corner', 'sofa-corner', 'per_unit', true, true, false, 'sofa_corner', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'sofas')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- armchairs under sofas
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სავარძლები', 'Armchairs', 'Кресла', 'armchairs', 'armchair', 'per_unit', true, true, false, 'armchair', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'sofas')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- beds under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საწოლები', 'Beds', 'Кровати', 'beds', 'bed-double', 'per_unit', true, true, true, NULL, 20, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- beds-double under beds
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ორადგილიანი საწოლები', 'Double beds', 'Двуспальные кровати', 'beds-double', 'bed-double', 'per_unit', true, true, false, 'bed_double', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'beds')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- beds-single under beds
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ერთადგილიანი საწოლები', 'Single beds', 'Односпальные кровати', 'beds-single', 'bed-single', 'per_unit', true, true, false, 'bed_single', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'beds')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- tables under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('მაგიდები', 'Tables', 'Столы', 'tables', 'coffee-table', 'per_unit', true, true, true, NULL, 30, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- coffee-tables under tables
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ჟურნალის მაგიდები', 'Coffee tables', 'Журнальные столики', 'coffee-tables', 'coffee-table', 'per_unit', true, true, false, 'coffee_table', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'tables')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- dining-tables under tables
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სასადილო მაგიდები', 'Dining tables', 'Обеденные столы', 'dining-tables', 'utensils-crossed', 'per_unit', true, true, false, 'dining_table', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'tables')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- desks under tables
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამუშაო მაგიდები', 'Desks', 'Письменные столы', 'desks', 'desk', 'per_unit', true, true, false, 'desk', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'tables')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- chairs under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სკამები', 'Chairs', 'Стулья', 'chairs', 'dining-chair', 'per_unit', true, true, true, NULL, 40, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- dining-chairs under chairs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სასადილო სკამები', 'Dining chairs', 'Обеденные стулья', 'dining-chairs', 'dining-chair', 'per_unit', true, true, false, 'dining_chair', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'chairs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- office-chairs under chairs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საოფისე სკამები', 'Office chairs', 'Офисные кресла', 'office-chairs', 'office-chair', 'per_unit', true, true, false, 'office_chair', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'chairs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- wardrobes under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კარადები', 'Wardrobes', 'Шкафы', 'wardrobes', 'wardrobe', 'per_unit', true, true, true, 'wardrobe', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- storage under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('შენახვა/თარო', 'Storage & Shelving', 'Хранение и полки', 'storage', 'dresser', 'per_unit', true, true, true, NULL, 60, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- nightstands under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ღამის მაგიდები', 'Nightstands', 'Прикроватные тумбы', 'nightstands', 'nightstand', 'per_unit', true, true, false, 'nightstand', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- dressers under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კომოდები', 'Dressers', 'Комоды', 'dressers', 'dresser', 'per_unit', true, true, false, 'dresser', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- tv-units under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ტელევიზორის თაროები', 'TV units', 'ТВ-тумбы', 'tv-units', 'tv', 'per_unit', true, true, false, 'tv_unit', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- bookshelves under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('წიგნების თაროები', 'Bookshelves', 'Книжные шкафы', 'bookshelves', 'library-big', 'per_unit', true, true, false, 'bookshelf', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- open-shelving under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ღია სტელაჟები', 'Open shelving', 'Открытые стеллажи', 'open-shelving', 'rows-3', 'per_unit', true, true, false, 'storage_shelf', 50, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- console-tables under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კონსოლები', 'Console tables', 'Консоли', 'console-tables', 'console-table', 'per_unit', true, true, false, 'console_table', 60, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- shoe-cabinets under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ფეხსაცმლის კარადები', 'Shoe cabinets', 'Обувницы', 'shoe-cabinets', 'footprints', 'per_unit', true, true, false, 'shoe_cabinet', 70, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- kitchen-furniture under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს ავეჯი', 'Kitchen Furniture', 'Кухонная мебель', 'kitchen-furniture', 'kitchen-run', 'per_unit', true, true, true, NULL, 70, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- kitchen-units under kitchen-furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს კარადები', 'Kitchen units', 'Кухонные гарнитуры', 'kitchen-units', 'kitchen-run', 'per_unit', true, true, false, 'kitchen_run', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'kitchen-furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- kitchen-islands under kitchen-furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს კუნძულები', 'Kitchen islands', 'Кухонные острова', 'kitchen-islands', 'kitchen-island', 'per_unit', true, true, false, 'kitchen_island', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'kitchen-furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- fridges under kitchen-furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('მაცივრები', 'Fridges', 'Холодильники', 'fridges', 'refrigerator', 'per_unit', true, true, false, 'fridge', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'kitchen-furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- kitchen-custom under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს ავეჯი — ინდივიდუალური დამზადება', 'Made-to-measure kitchens', 'Кухни на заказ', 'kitchen-custom', 'ruler', 'per_unit', true, false, false, NULL, 80, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- decor (top)
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('დეკორი', 'Decor', 'Декор', 'decor', 'flower-2', 'per_unit', true, true, true, NULL, 50, NULL) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- artwork under decor
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ნახატები', 'Artwork', 'Картины', 'artwork', 'image', 'per_unit', true, true, false, 'artwork', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'decor')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- plants under decor
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('მცენარეები', 'Plants', 'Растения', 'plants', 'flower-2', 'per_unit', true, true, false, 'plant', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'decor')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- mirrors under decor
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სარკეები', 'Mirrors', 'Зеркала', 'mirrors', 'mirror', 'per_unit', true, true, false, 'mirror', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'decor')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- curtains under decor
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ფარდები', 'Curtains', 'Шторы', 'curtains', 'blinds', 'per_unit', true, true, false, 'curtain', 40, (SELECT "id" FROM "categories" WHERE "slug" = 'decor')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- rugs under decor
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ხალიჩები', 'Rugs', 'Ковры', 'rugs', 'rug', 'per_unit', true, true, true, NULL, 50, (SELECT "id" FROM "categories" WHERE "slug" = 'decor')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- area-rugs under rugs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ოთახის ხალიჩები', 'Area rugs', 'Ковры для комнаты', 'area-rugs', 'rug', 'per_unit', true, true, false, 'rug', 10, (SELECT "id" FROM "categories" WHERE "slug" = 'rugs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- bedside-rugs under rugs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საწოლის ხალიჩები', 'Bedside rugs', 'Прикроватные коврики', 'bedside-rugs', 'rug-bedside', 'per_unit', true, true, false, 'rug_bed', 20, (SELECT "id" FROM "categories" WHERE "slug" = 'rugs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- studio room living-room
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('living-room', 'მისაღები ოთახი', 'Living room', 'Гостиная', 'sofa', '["living_room"]', true, 10) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'sofas-three-seat' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'sofas-corner' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'coffee-tables' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'tv-units' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'armchairs' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 60 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bookshelves' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 70 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'open-shelving' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 80 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'area-rugs' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 90 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bedside-rugs' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 100 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'floor-lamps' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 110 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 120 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'artwork' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 130 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'plants' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 140 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'curtains' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 150 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'dining-tables' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 160 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'dining-chairs' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room bedroom
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('bedroom', 'საძინებელი', 'Bedroom', 'Спальня', 'bed-double', '["bedroom"]', true, 20) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'beds-double' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'beds-single' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'nightstands' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'wardrobes' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'dressers' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 60 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bedside-rugs' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 70 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'area-rugs' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 80 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 90 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'artwork' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 100 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'curtains' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 110 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'plants' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room kitchen
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('kitchen', 'სამზარეულო', 'Kitchen', 'Кухня', 'cooking-pot', '["kitchen"]', true, 30) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'kitchen-units' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'fridges' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'kitchen-islands' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'dining-tables' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'dining-chairs' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 60 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 70 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'curtains' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room bathroom
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('bathroom', 'სველი წერტილი', 'Bathroom', 'Санузел', 'bath', '["bathroom"]', true, 40) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'toilets' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'sinks' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'showers' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bathtubs' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'washing-machines' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 60 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'mirrors' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room toilet
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('toilet', 'ტუალეტი', 'Toilet', 'Туалет', 'toilet', '["toilet"]', true, 50) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'toilets' WHERE r."slug" = 'toilet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'sinks' WHERE r."slug" = 'toilet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'mirrors' WHERE r."slug" = 'toilet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room hallway
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('hallway', 'დერეფანი', 'Hallway', 'Коридор', 'door-open', '["hallway"]', true, 60) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'console-tables' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'shoe-cabinets' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'mirrors' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'plants' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room office
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('office', 'საოფისე ოთახი', 'Office', 'Кабинет', 'briefcase-business', '["office"]', true, 70) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'desks' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'office-chairs' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bookshelves' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 40 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'open-shelving' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 50 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'armchairs' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 60 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'area-rugs' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 70 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bedside-rugs' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 80 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 90 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'artwork' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 100 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'curtains' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room closet
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('closet', 'გარდერობი', 'Closet / wardrobe', 'Гардеробная', 'shirt', '["closet"]', true, 80) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'wardrobes' WHERE r."slug" = 'closet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'mirrors' WHERE r."slug" = 'closet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'closet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room balcony
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('balcony', 'აივანი', 'Balcony', 'Балкон', 'sun', '["balcony"]', true, 90) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'armchairs' WHERE r."slug" = 'balcony' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'plants' WHERE r."slug" = 'balcony' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- studio room storage-room
INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('storage-room', 'საწყობი', 'Storage', 'Кладовая', 'warehouse', '["storage"]', true, 100) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 10 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'open-shelving' WHERE r."slug" = 'storage-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 20 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bookshelves' WHERE r."slug" = 'storage-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 30 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'pendant-lights' WHERE r."slug" = 'storage-room' ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- the store that supplies the rate book's construction materials, and the settings row naming it
INSERT INTO "stores" ("name_ka", "name_en", "name_ru", "description_ka", "description_en", "description_ru", "city", "delivery_days", "delivery_fee_gel", "commission_rate", "approval_status", "is_active") VALUES ('სამშენებლო მასალები', 'Building Materials', 'Строительные материалы', 'ცემენტი, ქვიშა, ბლოკი, შპაკლი, თაბაშირ-მუყაო, მილები და სადენი — ყველაფერი, რასაც რემონტის სამუშაოები ითხოვს, ერთი მიწოდებით.', 'Cement, sand, blocks, putty, plasterboard, pipes and cable — everything the renovation works call for, in one delivery.', 'Цемент, песок, блоки, шпаклёвка, гипсокартон, трубы и кабель — всё, что нужно для ремонтных работ, одной доставкой.', 'თბილისი', 2, 50.00, 5.00, 'approved', true) ON CONFLICT ("name_ka") DO NOTHING;
--> statement-breakpoint
INSERT INTO "platform_settings" ("calculator_fee_per_m2") SELECT 2.00 WHERE NOT EXISTS (SELECT 1 FROM "platform_settings");
--> statement-breakpoint
UPDATE "platform_settings" SET "materials_store_id" = (SELECT "id" FROM "stores" WHERE "name_ka" = 'სამშენებლო მასალები' ORDER BY "id" LIMIT 1) WHERE "materials_store_id" IS NULL;
--> statement-breakpoint
-- the interior paints (store: "ქართული ავეჯი" when the seeds have made it, none before)
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — თეთრი', 'Interior paint, matt — white', 'Интерьерная краска, матовая — белая', 'paint-interior-white', 'TX-PAINT-INTERIOR-WHITE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-white.webp', '{"wet": false, "colors": ["#F1F0EC"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["modern", "scandinavian", "industrial", "vintage", "wall"]'::jsonb, '["modern", "scandinavian", "industrial", "vintage"]'::jsonb, '/textures/paint-white-diffuse.webp', '#F1F0EB', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — თბილი თეთრი', 'Interior paint, matt — warm white', 'Интерьерная краска, матовая — тёплая белая', 'paint-interior-warm-white', 'TX-PAINT-INTERIOR-WARM-WHITE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-warm-white.webp', '{"wet": false, "colors": ["#F0E9DE"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["scandinavian", "vintage", "modern", "wall"]'::jsonb, '["scandinavian", "vintage", "modern"]'::jsonb, '/textures/paint-warm-white-diffuse.webp', '#F0E9DD', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — ნაცრისფერ-ბეჟი', 'Interior paint, matt — greige', 'Интерьерная краска, матовая — серо-бежевая', 'paint-interior-greige', 'TX-PAINT-INTERIOR-GREIGE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-greige.webp', '{"wet": false, "colors": ["#D5CEC3"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["modern", "scandinavian", "wall"]'::jsonb, '["modern", "scandinavian"]'::jsonb, '/textures/paint-greige-diffuse.webp', '#D5CEC3', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — ღია ნაცრისფერი', 'Interior paint, matt — light grey', 'Интерьерная краска, матовая — светло-серая', 'paint-interior-light-grey', 'TX-PAINT-INTERIOR-LIGHT-GREY', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-light-grey.webp', '{"wet": false, "colors": ["#D2D5D4"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["modern", "industrial", "scandinavian", "wall"]'::jsonb, '["modern", "industrial", "scandinavian"]'::jsonb, '/textures/paint-light-grey-diffuse.webp', '#D2D5D5', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — თბილი ნაცრისფერი', 'Interior paint, matt — warm grey', 'Интерьерная краска, матовая — тёплая серая', 'paint-interior-warm-grey', 'TX-PAINT-INTERIOR-WARM-GREY', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-warm-grey.webp', '{"wet": false, "colors": ["#B8B2A9"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["industrial", "modern", "wall"]'::jsonb, '["industrial", "modern"]'::jsonb, '/textures/paint-warm-grey-diffuse.webp', '#B8B2A8', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — ფიქლისფერი', 'Interior paint, matt — slate grey', 'Интерьерная краска, матовая — сланцево-серая', 'paint-interior-slate', 'TX-PAINT-INTERIOR-SLATE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-slate.webp', '{"wet": false, "colors": ["#8B9093"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["industrial", "modern", "wall"]'::jsonb, '["industrial", "modern"]'::jsonb, '/textures/paint-slate-diffuse.webp', '#8B9094', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — მოყავისფრო-ნაცრისფერი', 'Interior paint, matt — taupe', 'Интерьерная краска, матовая — серо-коричневая', 'paint-interior-taupe', 'TX-PAINT-INTERIOR-TAUPE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-taupe.webp', '{"wet": false, "colors": ["#C3B6A8"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["modern", "vintage", "wall"]'::jsonb, '["modern", "vintage"]'::jsonb, '/textures/paint-taupe-diffuse.webp', '#C3B6A7', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — სალბისფერი', 'Interior paint, matt — sage', 'Интерьерная краска, матовая — шалфейная', 'paint-interior-sage', 'TX-PAINT-INTERIOR-SAGE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-sage.webp', '{"wet": false, "colors": ["#C2CCB9"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["scandinavian", "vintage", "wall"]'::jsonb, '["scandinavian", "vintage"]'::jsonb, '/textures/paint-sage-diffuse.webp', '#C2CCB9', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — მკრთალი ცისფერი', 'Interior paint, matt — dusty blue', 'Интерьерная краска, матовая — пыльно-голубая', 'paint-interior-dusty-blue', 'TX-PAINT-INTERIOR-DUSTY-BLUE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-dusty-blue.webp', '{"wet": false, "colors": ["#BCC8CF"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["scandinavian", "modern", "wall"]'::jsonb, '["scandinavian", "modern"]'::jsonb, '/textures/paint-dusty-blue-diffuse.webp', '#BCC8CF', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — მკრთალი ვარდისფერი', 'Interior paint, matt — dusty rose', 'Интерьерная краска, матовая — пыльно-розовая', 'paint-interior-dusty-rose', 'TX-PAINT-INTERIOR-DUSTY-ROSE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-dusty-rose.webp', '{"wet": false, "colors": ["#D7BCB1"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["vintage", "scandinavian", "wall"]'::jsonb, '["vintage", "scandinavian"]'::jsonb, '/textures/paint-dusty-rose-diffuse.webp', '#D7BCB1', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — კრემისფერი', 'Interior paint, matt — cream', 'Интерьерная краска, матовая — кремовая', 'paint-interior-cream', 'TX-PAINT-INTERIOR-CREAM', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-cream.webp', '{"wet": false, "colors": ["#EBE2C8"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["vintage", "scandinavian", "wall"]'::jsonb, '["vintage", "scandinavian"]'::jsonb, '/textures/paint-cream-diffuse.webp', '#ECE1C8', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id", "store_id", "name_ka", "name_en", "name_ru", "slug", "sku", "price_per_unit", "unit", "coverage_per_unit", "brand", "image_url", "specs", "tags", "style_tags", "texture_url", "color_hex", "is_active", "is_featured", "sort_order") SELECT (SELECT "id" FROM "categories" WHERE "slug" = 'paint'), (SELECT "id" FROM "stores" WHERE "name_ka" = 'ქართული ავეჯი' ORDER BY "id" LIMIT 1), 'ინტერიერის საღებავი, მქრქალი — ზეთისხილისფერი', 'Interior paint, matt — olive', 'Интерьерная краска, матовая — оливковая', 'paint-interior-olive', 'TX-PAINT-INTERIOR-OLIVE', '21.0', 'liter'::"product_unit", '8.0', NULL, '/uploads/products/tex-paint-interior-olive.webp', '{"wet": false, "colors": ["#969E86"], "source": "tint", "license": "CC0", "surfaces": ["wall"], "normalUrl": "/textures/acg-Plaster002-normal.webp", "roughnessUrl": "/textures/acg-Plaster002-rough.webp", "textureScaleM": 2}'::jsonb, '["vintage", "industrial", "wall"]'::jsonb, '["vintage", "industrial"]'::jsonb, '/textures/paint-olive-diffuse.webp', '#959E86', true, false, 0 WHERE EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'paint') ON CONFLICT ("slug") DO NOTHING;
