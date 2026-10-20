-- TVs are a piece of their own (`tv`): over the living room's TV unit — one on its stand stands on
-- the unit's top, a flat one hangs on the wall over it. Their category sits under the furniture
-- beside storage, and the living room's shelf lists it after the TV units.
-- tvs under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ტელევიზორები', 'TVs', 'Телевизоры', 'tvs', 'tv', 'per_unit', true, true, false, 'tv', 70, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 45 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'tvs' WHERE r."slug" = 'living-room' ON CONFLICT DO NOTHING;
