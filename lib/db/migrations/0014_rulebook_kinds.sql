-- The rulebook's pieces (6 Nov 2026): taps, bath mixers, tumble dryers, towel shelves, stools, coat racks
-- and door mats get categories of their 3D kinds (lib/catalog/defaultTree.ts), and the studio rooms that
-- place them list them. The library filed these products under the nearest kind (a tap under sinks, a
-- dryer under washing machines); the studio reads them by name (refinedKind, lib/design/productRoles.ts)
-- until the team moves them. Insert-only: no product is moved, nothing the team has is changed.
-- taps under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ონკანები', 'Taps', 'Смесители', 'taps', 'sink', 'per_unit', true, false, false, 'tap', 60, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- bath-mixers under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('აბაზანის შემრევები', 'Bath mixers', 'Смесители для ванны', 'bath-mixers', 'bath', 'per_unit', true, false, false, 'bath_mixer', 70, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- tumble-dryers under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საშრობი მანქანები', 'Tumble dryers', 'Сушильные машины', 'tumble-dryers', 'washing-machine', 'per_unit', true, false, false, 'dryer', 80, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- towel-racks under sanitary
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('პირსახოცის თაროები', 'Towel shelves', 'Полки для полотенец', 'towel-racks', 'rows-3', 'per_unit', true, false, false, 'towel_rack', 90, (SELECT "id" FROM "categories" WHERE "slug" = 'sanitary')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- stools under chairs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ტაბურეტები', 'Stools', 'Табуреты', 'stools', 'dining-chair', 'per_unit', true, true, false, 'stool', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'chairs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- coat-racks under storage
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('საკიდები', 'Coat racks', 'Вешалки', 'coat-racks', 'footprints', 'per_unit', true, true, false, 'coat_rack', 80, (SELECT "id" FROM "categories" WHERE "slug" = 'storage')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- door-mats under rugs
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ფეხსაწმენდები', 'Door mats', 'Придверные коврики', 'door-mats', 'rug', 'per_unit', true, true, false, 'door_mat', 30, (SELECT "id" FROM "categories" WHERE "slug" = 'rugs')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 95 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'towel-racks' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 105 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'stools' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 115 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'taps' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 125 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'bath-mixers' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 135 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'tumble-dryers' WHERE r."slug" = 'bathroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 45 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'taps' WHERE r."slug" = 'toilet' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 15 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'door-mats' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 25 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'coat-racks' WHERE r."slug" = 'hallway' ON CONFLICT DO NOTHING;
