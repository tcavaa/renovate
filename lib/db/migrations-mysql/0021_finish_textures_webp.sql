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
--
-- It runs on MySQL 8 and on MariaDB, the cPanel host's (docs/data-model.md, "Migrations run on
-- MySQL and MariaDB"): no `CAST(… AS JSON)`, which MariaDB cannot parse — a JSON column takes the
-- text as it is — and no back-reference in REGEXP_REPLACE's replacement, which MySQL writes `$1`
-- and MariaDB `\1`, each taking the other's for plain text. A single URL is rewritten whole
-- (anchored, `.jpg` cut off and `.webp` put on). JSON is rewritten reversed: there the
-- `/textures/<name>` that has to come before `.jpg` comes after it, where a lookahead — both
-- engines have one — can require it, and the replacement is a constant: `"gpj.` → `"pbew.`,
-- which is `.jpg"` → `.webp"` read the right way round. Only a URL that starts a JSON string is
-- rewritten there, which is how every one is stored.
--
-- The first version of this file used `$1$2.webp` and, on the MariaDB host, its first statement
-- wrote that text literally into 35 finish products' `texture_url` before its third failed on
-- `CAST(… AS JSON)` (deploy/migrate.cjs had no transaction then). The first statement here puts
-- those textures back, by the slugs and textures the host had.
UPDATE `products` SET `texture_url` = CASE `slug`
  WHEN 'porcelain-tile-60x60-beige'     THEN '/textures/ph-floor_tiles_08-diffuse.webp'
  WHEN 'ceramic-tile-60x120-anthracite' THEN '/textures/acg-Tiles052-diffuse.webp'
  WHEN 'marble-effect-tile-80x80'       THEN '/textures/ph-marble_01-diffuse.webp'
  WHEN 'small-tile-30x30-grey'          THEN '/textures/ph-interior_tiles-diffuse.webp'
  WHEN 'wall-tile-glossy-white-25x40'   THEN '/textures/acg-Tiles036-diffuse.webp'
  WHEN 'wall-tile-marble-30x60'         THEN '/textures/acg-Tiles074-diffuse.webp'
  WHEN 'wall-tile-mosaic-blue'          THEN '/textures/acg-Tiles132A-diffuse.webp'
  WHEN 'wall-tile-textured-grey'        THEN '/textures/acg-Tiles133A-diffuse.webp'
  WHEN 'laminate-oak-classic-8mm'       THEN '/textures/wood-floor-warm-diffuse.webp'
  WHEN 'laminate-walnut-12mm'           THEN '/textures/wood-floor-dark-diffuse.webp'
  WHEN 'laminate-grey-10mm'             THEN '/textures/wood-floor-grey-diffuse.webp'
  WHEN 'laminate-light-oak-budget'      THEN '/textures/wood-floor-light-diffuse.webp'
  WHEN 'paint-tikkurila-white-9l'       THEN '/textures/acg-PaintedPlaster017-diffuse.webp'
  WHEN 'paint-dulux-color-3l'           THEN '/textures/ph-beige_wall_001-diffuse.webp'
  WHEN 'paint-marshall-eco-5l'          THEN '/textures/plaster-warm.webp'
  WHEN 'paint-budget-white-10l'         THEN '/textures/acg-Plaster002-diffuse.webp'
  WHEN 'parquet-oak-herringbone'        THEN '/textures/ph-herringbone_parquet-diffuse.webp'
  WHEN 'parquet-oak-rectangular'        THEN '/textures/ph-rectangular_parquet-diffuse.webp'
  WHEN 'laminate-brown-wide-plank'      THEN '/textures/ph-laminate_floor_02-diffuse.webp'
  WHEN 'floor-slate-polished'           THEN '/textures/ph-slate_floor-diffuse.webp'
  WHEN 'floor-microcement-grey'         THEN '/textures/acg-Concrete034-diffuse.webp'
  WHEN 'floor-tile-terrazzo'            THEN '/textures/ph-terrazzo_tiles-diffuse.webp'
  WHEN 'floor-tile-checkerboard-marble' THEN '/textures/ph-floor_tiles_06-diffuse.webp'
  WHEN 'floor-tile-terracotta'          THEN '/textures/ph-terracotta_floor_tiles-diffuse.webp'
  WHEN 'floor-tile-large-grey'          THEN '/textures/ph-tiled_floor_001-diffuse.webp'
  WHEN 'plaster-decorative-vintage'     THEN '/textures/plaster-vintage.webp'
  WHEN 'plaster-grey-concrete-look'     THEN '/textures/ph-plaster_grey_04-diffuse.webp'
  WHEN 'wall-brick-red-exposed'         THEN '/textures/brick-01-diffuse.webp'
  WHEN 'wall-brick-variant-2'           THEN '/textures/brick-03-diffuse.webp'
  WHEN 'wall-brick-variant-3'           THEN '/textures/brick-05-diffuse.webp'
  WHEN 'wall-concrete-panel'            THEN '/textures/concrete.webp'
  WHEN 'wallpaper-vintage-floral'       THEN '/textures/wallpaper-vintage.webp'
  WHEN 'wall-tile-hexagon-white'        THEN '/textures/acg-Tiles071-diffuse.webp'
  WHEN 'wall-tile-subway-green'         THEN '/textures/acg-Tiles032-diffuse.webp'
  WHEN 'wall-tile-penny-round'          THEN '/textures/acg-Tiles129B-diffuse.webp'
  ELSE `texture_url`
END
WHERE `texture_url` = '$1$2.webp';
--> statement-breakpoint
UPDATE `products` SET `texture_url` = CONCAT(LEFT(`texture_url`, CHAR_LENGTH(`texture_url`) - 4), '.webp') WHERE `texture_url` REGEXP '^/textures/[A-Za-z0-9_.-]+[.]jpg$';
--> statement-breakpoint
UPDATE `products` SET `image_url` = CONCAT(LEFT(`image_url`, CHAR_LENGTH(`image_url`) - 4), '.webp') WHERE `image_url` REGEXP '^/textures/[A-Za-z0-9_.-]+[.]jpg$';
--> statement-breakpoint
UPDATE `products` SET
  `specs` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`specs` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `images` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`images` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.'))
WHERE REVERSE(CAST(`specs` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`images` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")';
--> statement-breakpoint
UPDATE `projects` SET
  `rooms` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`rooms` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `selected_products` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`selected_products` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `selected_furniture` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`selected_furniture` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `calculator_board` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`calculator_board` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `plan` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`plan` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `scene` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`scene` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `versions` = REVERSE(REGEXP_REPLACE(REVERSE(CAST(`versions` AS CHAR CHARACTER SET utf8mb4)), '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")', '"pbew.')),
  `design_rev` = `design_rev` + 1,
  `calculator_rev` = `calculator_rev` + 1
WHERE REVERSE(CAST(`rooms` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`selected_products` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`selected_furniture` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`calculator_board` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`plan` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`scene` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")'
   OR REVERSE(CAST(`versions` AS CHAR CHARACTER SET utf8mb4)) REGEXP '"gpj[.](?=[A-Za-z0-9_.-]+/serutxet/")';
--> statement-breakpoint
UPDATE `worker_works` SET `image_url` = CONCAT(LEFT(`image_url`, CHAR_LENGTH(`image_url`) - 4), '.webp') WHERE `image_url` REGEXP '^/textures/[A-Za-z0-9_.-]+[.]jpg$';
