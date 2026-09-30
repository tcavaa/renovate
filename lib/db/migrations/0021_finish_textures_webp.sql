-- The finish textures in public/textures are WebP (`pnpm textures:webp`, lib/uploads/textureOptimize.ts):
-- every `/textures/<name>.jpg` became `/textures/<name>.webp`, the same name. This rewrites the
-- URLs stored with them — a finish product's colour map and, in `specs`, its normal and roughness
-- maps; the finishes of saved designs and of the calculator's board, and their kept versions; the
-- brigade portfolio photos the worker seed took from the same folder. A saved project it changes
-- moves both halves' revisions on, so a browser's cached copy at the old revision does not win
-- over the row and write the JPEG URLs back (lib/flow/projectSync). Idempotent: nothing is left
-- to match once it has run. next.config.mjs redirects any `/textures/….jpg` still asked for.
-- Only a path that starts at `/textures/` is rewritten: an uploaded texture
-- (`/uploads/textures/….jpg`, or a bucket URL) has no WebP twin and keeps its name.
UPDATE `products` SET `texture_url` = REGEXP_REPLACE(`texture_url`, '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') WHERE `texture_url` REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
--> statement-breakpoint
UPDATE `products` SET `image_url` = REGEXP_REPLACE(`image_url`, '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') WHERE `image_url` REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
--> statement-breakpoint
UPDATE `products` SET `specs` = CAST(REGEXP_REPLACE(CAST(`specs` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON) WHERE CAST(`specs` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
--> statement-breakpoint
UPDATE `products` SET `images` = CAST(REGEXP_REPLACE(CAST(`images` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON) WHERE CAST(`images` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
--> statement-breakpoint
UPDATE `projects` SET
  `rooms` = CAST(REGEXP_REPLACE(CAST(`rooms` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON),
  `selected_products` = IF(`selected_products` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`selected_products` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `selected_furniture` = IF(`selected_furniture` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`selected_furniture` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `calculator_board` = IF(`calculator_board` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`calculator_board` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `plan` = IF(`plan` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`plan` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `scene` = IF(`scene` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`scene` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `versions` = IF(`versions` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`versions` AS CHAR), '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') AS JSON)),
  `design_rev` = `design_rev` + 1,
  `calculator_rev` = `calculator_rev` + 1
WHERE CAST(`rooms` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`selected_products` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`selected_furniture` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`calculator_board` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`plan` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`scene` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg'
   OR CAST(`versions` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
--> statement-breakpoint
UPDATE `worker_works` SET `image_url` = REGEXP_REPLACE(`image_url`, '(^|[^A-Za-z0-9_./-])(/textures/[A-Za-z0-9_.-]+)\\.jpg', '$1$2.webp') WHERE `image_url` REGEXP '(^|[^A-Za-z0-9_./-])/textures/[A-Za-z0-9_.-]+\\.jpg';
