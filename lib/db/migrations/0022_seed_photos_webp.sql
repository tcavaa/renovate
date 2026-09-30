-- The seed pictures in public/uploads/products and /furniture are WebP (`pnpm photos:webp`,
-- lib/uploads/imageOptimize.ts): every `/uploads/<folder>/<name>.png|jpg` became
-- `/uploads/<folder>/<name>.webp`, the same name. This rewrites the URLs stored with them — the
-- products' `image_url` and `images`, and the product snapshots in saved designs and the
-- calculator's picks. A saved project it changes moves both halves' revisions on, so a browser's
-- cached copy at the old revision does not win over the row (lib/flow/projectSync).
-- Only a seed picture's name is rewritten: a runtime upload (`<13-digit ms>-<hex>.png`, or
-- `own-<user>-….png` — lib/storage/uploadKeys.ts) starts with a digit or `own-<digit>` and has no
-- WebP twin; the path must start at `/uploads/` and the extension end the name. Idempotent.
UPDATE `products` SET `image_url` = REGEXP_REPLACE(`image_url`, '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') WHERE `image_url` REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])';
--> statement-breakpoint
UPDATE `products` SET `images` = CAST(REGEXP_REPLACE(CAST(`images` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON) WHERE CAST(`images` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])';
--> statement-breakpoint
UPDATE `projects` SET
  `rooms` = CAST(REGEXP_REPLACE(CAST(`rooms` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON),
  `selected_products` = IF(`selected_products` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`selected_products` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `selected_furniture` = IF(`selected_furniture` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`selected_furniture` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `calculator_board` = IF(`calculator_board` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`calculator_board` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `plan` = IF(`plan` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`plan` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `scene` = IF(`scene` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`scene` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `versions` = IF(`versions` IS NULL, NULL, CAST(REGEXP_REPLACE(CAST(`versions` AS CHAR), '(^|[^A-Za-z0-9_./-])(/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*)\\.(png|jpe?g)(?![A-Za-z0-9_.-])', '$1$2.webp') AS JSON)),
  `design_rev` = `design_rev` + 1,
  `calculator_rev` = `calculator_rev` + 1
WHERE CAST(`rooms` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`selected_products` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`selected_furniture` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`calculator_board` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`plan` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`scene` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])'
   OR CAST(`versions` AS CHAR) REGEXP '(^|[^A-Za-z0-9_./-])/uploads/(products|furniture)/(?!own-[0-9])[A-Za-z][A-Za-z0-9_.-]*\\.(png|jpe?g)(?![A-Za-z0-9_.-])';
