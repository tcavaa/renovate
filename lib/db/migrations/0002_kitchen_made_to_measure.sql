-- The kitchen made to measure ("ავეჯის დამზადება") on the kitchen's shelf, first: the kitchen
-- maker's materials, each placed as a run stretched to its wall and bought by the m² of façade
-- (`isMadeToMeasureKitchen`, `asPlacedKitchen` in lib/design). The shops' kitchen units stay
-- beside it as furniture at their own size and price. Named as the studio calls it.
UPDATE "categories" SET "name_ka" = 'სამზარეულო — ავეჯის დამზადება', "name_en" = 'Kitchen — made to measure', "name_ru" = 'Кухня — изготовление на заказ' WHERE "slug" = 'kitchen-custom';
--> statement-breakpoint
INSERT INTO "shelf_room_categories" ("shelf_room_id", "category_id", "sort_order") SELECT r."id", c."id", 5 FROM "shelf_rooms" r JOIN "categories" c ON c."slug" = 'kitchen-custom' WHERE r."slug" = 'kitchen' ON CONFLICT DO NOTHING;
