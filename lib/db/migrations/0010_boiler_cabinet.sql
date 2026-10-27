-- The boiler's ventilated cabinet is made to measure by the joiner, priced per m² of façade like a
-- made-to-measure kitchen: its materials are products in this category (`lib/design/boilerCabinet`),
-- beside the kitchen maker's. `pnpm models:seed` writes the materials.
-- boiler-cabinet under furniture
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('ქვაბის კარადა — დამზადება', 'Boiler cabinet — made to measure', 'Шкаф для котла — на заказ', 'boiler-cabinet', 'ruler', 'per_unit', true, false, false, NULL, 90, (SELECT "id" FROM "categories" WHERE "slug" = 'furniture')) ON CONFLICT ("slug") DO NOTHING;
