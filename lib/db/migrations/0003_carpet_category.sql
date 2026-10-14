-- Carpet is a floor of its own, not a laminate: the library's 141 carpet tiles and its sisal were
-- filed under laminate, where they outnumbered the laminates four to one — and a generated flat,
-- which draws a floor from the category of the style's own (`generatedFinish`), was carpeted in
-- most rooms. They stay finishes of the studio's floors (`SURFACE_CATEGORY_SLUGS`).
-- carpet under flooring
INSERT INTO "categories" ("name_ka", "name_en", "name_ru", "slug", "icon", "calculation_type", "is_visible", "is_furniture", "in_calculator", "model_3d_kind", "sort_order", "parent_id") VALUES ('კოვროლინი', 'Carpet', 'Ковролин', 'carpet', 'layers', 'per_m2_floor', true, false, false, NULL, 15, (SELECT "id" FROM "categories" WHERE "slug" = 'flooring')) ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "products" SET "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'carpet') WHERE "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'laminate') AND ("slug" LIKE 'lib-tex-carpet-%' OR "name_en" ILIKE 'sisal %');
