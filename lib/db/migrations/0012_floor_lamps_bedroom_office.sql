-- More floor lamps (the owner's lighting notes of 29 Oct 2026): a bedroom of 12 m² and an office of
-- 9 m² have one in their room program (lib/design/catalog.ts), so their studio rooms list the floor
-- lamps too, after what they had. Insert-only: a link the team already made, or took away and
-- re-made, is left as it is.
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 120 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'floor-lamps' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 110 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'floor-lamps' WHERE r."slug" = 'office' ON CONFLICT DO NOTHING;
