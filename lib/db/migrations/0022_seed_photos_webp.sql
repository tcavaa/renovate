-- The seed pictures in public/uploads/products and /furniture are WebP (`pnpm photos:webp`,
-- lib/uploads/imageOptimize.ts): every `/uploads/<folder>/<name>.png|jpg` became
-- `/uploads/<folder>/<name>.webp`, the same name. This rewrites the URLs stored with them — the
-- products' `image_url` and `images`, and the product snapshots in saved designs and the
-- calculator's picks. A saved project it changes moves both halves' revisions on, so a browser's
-- cached copy at the old revision does not win over the row (lib/flow/projectSync).
-- Only a seed picture's name is rewritten: a runtime upload (`<13-digit ms>-<hex>.png`, or
-- `own-<user>-….png` — lib/storage/uploadKeys.ts) starts with a digit or `own-<digit>` and has no
-- WebP twin; the path must start at `/uploads/` and the extension end the name. Idempotent.
--
-- Written for MySQL 8 and MariaDB alike, the way 0021 is: a single URL rewritten whole, JSON
-- rewritten reversed with lookaheads and a constant replacement (`"gnp.`, `"gpj.` or `"gepj.` →
-- `"pbew.`) — reversed, the name's first letter and the `own-<digit>` it must not start with come
-- right before the folder.
UPDATE `products` SET `image_url` = CONCAT(LEFT(`image_url`, CHAR_LENGTH(`image_url`) - CHAR_LENGTH(SUBSTRING_INDEX(`image_url`, '.', -1)) - 1), '.webp')
WHERE `image_url` REGEXP '^/uploads/(products|furniture)/[A-Za-z][A-Za-z0-9_.-]*[.](png|jpg|jpeg)$'
  AND `image_url` NOT REGEXP '^/uploads/(products|furniture)/own-[0-9]';
--> statement-breakpoint
UPDATE `products` SET `images` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`images` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.'))
WHERE REVERSE(CAST(`images` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")';
--> statement-breakpoint
UPDATE `projects` SET
  `rooms` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`rooms` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `selected_products` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`selected_products` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `selected_furniture` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`selected_furniture` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `calculator_board` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`calculator_board` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `plan` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`plan` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `scene` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`scene` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `versions` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`versions` AS CHAR CHARACTER SET utf8mb4)), '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")', '"pbew.')),
  `design_rev` = `design_rev` + 1,
  `calculator_rev` = `calculator_rev` + 1
WHERE REVERSE(CAST(`rooms` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`selected_products` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`selected_furniture` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`calculator_board` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`plan` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`scene` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")'
   OR REVERSE(CAST(`versions` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"(gnp|gpj|gepj)[.](?=[A-Za-z0-9_.-]*[A-Za-z]/(stcudorp|erutinruf)/sdaolpu/")(?![A-Za-z0-9_.-]*[0-9]-nwo/(stcudorp|erutinruf)/sdaolpu/")';
