#!/usr/bin/env bash
#
# Pulls the web-usable parts out of the partner 3D asset drop.
#
#   source: "3D OBJECTS WITH STYLES_DRAFT_03.03.2026"  (1.6 GB of .rar/.zip 3ds Max scenes)
#   output: public/uploads/furniture/  product renders   (catalog + hover cards)
#           public/textures/           PBR maps          (Three.js floor/wall materials)
#
# The .max/.fbx/.obj files inside those archives are offline-render assets (high-poly,
# V-Ray/Corona) and are deliberately NOT shipped — the 3D studio renders furniture from the
# procedural library in lib/design3d/furniture instead. Only images come out of here.
#
# macOS `tar` is bsdtar/libarchive, which reads RAR as well as ZIP, so no unrar is needed.
# `sips` (built into macOS) does the downscaling.
#
# Usage:  bash scripts/extract-assets.sh [source-dir]
#
set -uo pipefail

SRC="${1:-$HOME/Downloads/3D OBJECTS WITH STYLES_DRAFT_03.03.2026}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FURN="$ROOT/public/uploads/furniture"
TEX="$ROOT/public/textures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -d "$SRC" ]; then
  echo "✗ source folder not found: $SRC" >&2
  echo "  pass it as the first argument" >&2
  exit 1
fi

mkdir -p "$FURN" "$TEX"
ok=0; miss=0

# pull <archive> <member-path-inside> <dest> <max-px>
pull() {
  local arc="$SRC/$1" mem="$2" dest="$3" px="$4"
  if [ ! -f "$arc" ]; then echo "  ‑ missing archive: $1"; miss=$((miss+1)); return; fi
  ( cd "$TMP" && tar -xf "$arc" "$mem" ) 2>/dev/null
  if [ ! -f "$TMP/$mem" ]; then echo "  ‑ missing member:  $1 → $mem"; miss=$((miss+1)); return; fi
  cp "$TMP/$mem" "$dest"
  sips -Z "$px" "$dest" >/dev/null 2>&1
  echo "  ✓ $(basename "$dest")  ($(du -h "$dest" | cut -f1))"
  ok=$((ok+1))
}

# copy <relative-source-file> <dest> <max-px>
copy() {
  local from="$SRC/$1"
  if [ ! -f "$from" ]; then echo "  ‑ missing file:    $1"; miss=$((miss+1)); return; fi
  cp "$from" "$2"; sips -Z "$3" "$2" >/dev/null 2>&1
  echo "  ✓ $(basename "$2")  ($(du -h "$2" | cut -f1))"
  ok=$((ok+1))
}

echo "→ product renders"
pull "INDUSTRIAL/bed/bed-woody-cgmood.zip"                          "bed woody/preview.jpg"                                          "$FURN/ind-bed-woody.jpg"        900
pull "INDUSTRIAL/chair/2957103.5f1aa603f1171.rar"                   "Narbutas Tango Lounge Chair/Preview1.jpg"                        "$FURN/ind-tango-chair.jpg"      900
pull "INDUSTRIAL/table/barcelona-table-by-mies-van-der-rohe-cgmood.rar" "preview.jpg"                                                "$FURN/ind-barcelona-table.jpg"  900
pull "SCANDINAVIAN/bed/2433103.5ccc48e5db0da.rar"                   "web1.jpg"                                                       "$FURN/sca-bed.jpg"              900
pull "SCANDINAVIAN/light/2736460.5e60a822be935.rar"                 "Render.jpg"                                                     "$FURN/sca-pendant.jpg"          900
pull "SCANDINAVIAN/table/4696375.6387c6103a038.zip"                 "CAYDEN-CAMPAIGN-RECTANGULAR-EXTENSION-DINING-TABLE-2013.jpg"    "$FURN/sca-dining-table.jpg"     900
pull "SCANDINAVIAN/table/4696375.6387c6103a038.zip"                 "preview/picture3.jpg"                                           "$FURN/sca-dining-table-2.jpg"   900
pull "VINTAGE/chair/3188253.5fe4b9858ed60.rar"                      "Rattan Chair-Previwe 02.jpg"                                    "$FURN/vin-rattan-chair.jpg"     900
pull "VINTAGE/chair/prunius-chair-cgmood.zip"                       "preview.jpg"                                                    "$FURN/vin-prunius-chair.jpg"    900
pull "VINTAGE/light/1098963.5921b3cf0a751.rar"                      "lampa retro/3.jpg"                                              "$FURN/vin-retro-lamp.jpg"       900
pull "VINTAGE/bed/fgqbdk2mha-Bed.zip"                               "Bed/BED.png"                                                    "$FURN/vin-bed.png"              900

echo "→ brick (industrial walls)"
for t in 01 03 05; do
  pull "INDUSTRIAL/wall/5111809.642c65f418a64.rar" "Maps/002_Brick_Diffuse_type$t.jpg"   "$TEX/brick-$t-diffuse.jpg" 1024
  pull "INDUSTRIAL/wall/5111809.642c65f418a64.rar" "Maps/002_Brick_Normal_type$t.jpg"    "$TEX/brick-$t-normal.jpg"  1024
done

echo "→ wood floors"
pull "VINTAGE/floor/6679708.667286fd7c974.zip" "Wooden_Floor_1_v14/Textures/Wooden_Floor_1-L_Diffuse.png" "$TEX/wood-floor-warm-diffuse.png"   1024
pull "VINTAGE/floor/6679708.667286fd7c974.zip" "Wooden_Floor_1_v14/Textures/Wooden_Floor_1-L_Normal.png"  "$TEX/wood-floor-warm-normal.png"   1024
pull "VINTAGE/floor/6679708.667286fd7c974.zip" "Wooden_Floor_3_v14/Textures/Wooden_Floor_3-L_Diffuse.png" "$TEX/wood-floor-dark-diffuse.png"  1024
pull "VINTAGE/floor/7846966.686fb33d9cfe8.zip" "wood1_340_Base_Color.png"                                 "$TEX/wood-floor-light-diffuse.png" 1024
pull "VINTAGE/floor/7846966.686fb33d9cfe8.zip" "wood1_340_Normal.png"                                     "$TEX/wood-floor-light-normal.png"  1024
pull "VINTAGE/floor/7846966.686fb33d9cfe8.zip" "wood1_340_Roughness.png"                                  "$TEX/wood-floor-light-rough.png"   1024
pull "VINTAGE/floor/7846966.686fb33d9cfe8.zip" "wood3_340_Base_Color.png"                                 "$TEX/wood-floor-grey-diffuse.png"  1024

echo "→ wall finishes"
copy "SCANDINAVIAN/wall/3482d5f6c27096a219b81ae1f479cf22.jpg" "$TEX/plaster-warm.jpg"   1024
copy "VINTAGE/wall/684c7865220a7766ac95cfa9948823cc.jpg"      "$TEX/plaster-vintage.jpg" 1024
copy "VINTAGE/wall/da9c60b810baae5940642f5f0b9d140d.jpg"      "$TEX/wallpaper-vintage.jpg" 1024
copy "INDUSTRIAL/wall/feb78b1b8c945875d738921dcceaab8d.jpg"   "$TEX/concrete.jpg"        1024

echo "→ upholstery"
pull "INDUSTRIAL/sofa/2959323.5f1c854e9d637.rar" "leathe G _d.jpg"  "$TEX/leather-cognac.jpg" 1024
pull "VINTAGE/sofa/921641.58b8596142c38.rar"     "farlov fabric.jpg" "$TEX/fabric-linen.jpg"  1024
pull "SCANDINAVIAN/sofa/1061592.590c0daf26ba3.rar" "fabric_gen_1.jpg" "$TEX/fabric-wool.jpg"  1024

# Some renders carry the render engine's watermark badge in a corner. A centred crop is
# enough to remove it — `sips --cropOffset` is a no-op on this build, so don't reach for it.
crop() {
  local file="$1" h="$2" w="$3"
  [ -f "$file" ] || return
  sips -c "$h" "$w" "$file" --out "$TMP/crop.jpg" >/dev/null 2>&1 && mv "$TMP/crop.jpg" "$file"
}
crop "$FURN/ind-tango-chair.jpg"  680 880
crop "$FURN/vin-rattan-chair.jpg" 670 880

# PNG source maps are 1–2 MB each; JPEG at q78 keeps them under 350 KB with no visible loss
# on a tiling floor material.
for f in "$TEX"/*.png; do
  [ -f "$f" ] || continue
  sips -s format jpeg -s formatOptions 78 "$f" --out "${f%.png}.jpg" >/dev/null 2>&1 && rm "$f"
done

echo
echo "done — $ok extracted, $miss skipped"
echo "  furniture: $FURN"
echo "  textures:  $TEX"
