-- Kitchen wall (hanging) cabinets are a piece of their own (`kitchen_wall`): a shop's, sold as
-- furniture like the shops' kitchen units, or made to measure in the kitchen maker's wall-cabinet
-- materials ("სამზარეულო — ავეჯის დამზადება"). The shops' go here, on the kitchen's shelf after the
-- kitchen units; the library's one wall cabinet, filed as a floor-standing run, moves here.
-- kitchen-wall-units under kitchen-furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('სამზარეულოს ზედა კარადები', 'Kitchen wall cabinets', 'Навесные кухонные шкафы', 'kitchen-wall-units', 'panel-top', 'per_unit', true, true, false, 'kitchen_wall', 15, (SELECT "id" FROM "categories" WHERE "slug" = 'kitchen-furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 12 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'kitchen-wall-units' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "products" SET "model_3d_kind" = 'kitchen_wall', "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'kitchen-wall-units') WHERE "slug" = 'lib-kitchen-run-black-wall-kitchen-cabinet';
