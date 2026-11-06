-- The rulebook's stage 4 (6 Nov 2026): the bedroom places a stool where there is floor (B-8), so its studio
-- room lists the stools. Insert-only.
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 145 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'stools' WHERE r."slug" = 'bedroom' ON CONFLICT DO NOTHING;
