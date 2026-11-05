/**
 * What a catalogue product is to the studio, beyond the kind admin filed it under.
 *
 * The 3D library was filed by the nearest kind it had: basin taps, bath mixers and kitchen sinks
 * under `sink`, a tumble dryer under `washer`, doormats under `rug`, coat racks under
 * `shoe_cabinet`, stools and a towel rack under `dining_chair`. The rulebook (6 Nov 2026) places
 * each of these on its own — a tap on every basin, the bath's mixer at its head, a dryer over the
 * washer, a mat at the front door, coats by it — so the studio reads the product's role from its
 * name (`refinedKind`) when the catalogue is loaded, and the team's products stay as they filed
 * them. A product filed under one of the new kinds by hand keeps it.
 *
 * Pure: no React, no database.
 */

interface Named {
  nameKa?: string | null;
  nameEn?: string | null;
  model3dKind?: string | null;
}

const nameOf = (p: Named) => `${p.nameEn ?? ''} ${p.nameKa ?? ''}`.toLowerCase();

/** A basin, vanity or sink sold with its own tap ("…basin with wall-mounted tap", "…vanity with vessel basin and brass tap"). */
const WITH_TAP = /\b(with|and)\b[^|]*\b(tap|mixer|faucet)\b/;
/** A bath's mixer: freestanding by the bath, on the wall at its head, or a pair of spouts. */
const BATH_MIXER = /\bbath\b[^|]*\b(mixer|tap|spout|faucet)\b/;
const TAP = /\b(mixer|tap|faucet|spout)s?\b|ონკან|შემრევ/;
const KITCHEN_SINK = /\bkitchen\b[^|]*\b(sink|faucet)\b|\bkitchen faucet\b/;

/** The kind the studio places a product as (see the module's note). */
export function refinedKind(product: Named): string | null {
  const kind = product.model3dKind ?? null;
  const name = nameOf(product);
  switch (kind) {
    case 'sink':
      if (KITCHEN_SINK.test(name)) return 'kitchen_sink';
      if (BATH_MIXER.test(name)) return 'bath_mixer';
      if (TAP.test(name) && !/\b(basin|washbasin|vanity|sink)\b/.test(name.replace(/\bbasin (mixer|tap|spout)/g, ''))) return 'tap';
      return kind;
    case 'washer':
      return /\bdryer\b|საშრობ/.test(name) ? 'dryer' : kind;
    case 'rug':
      return /\bdoor ?mat\b|ფეხსაწმენდ/.test(name) ? 'door_mat' : kind;
    case 'shoe_cabinet':
      return /\bcoat\b|\bhanger\b|საკიდ/.test(name) ? 'coat_rack' : kind;
    case 'dining_chair':
      if (/\btowel\b/.test(name)) return 'towel_rack';
      return /\bstool\b|ტაბურეტ/.test(name) && !/\bbar stool\b/.test(name) ? 'stool' : kind;
    default:
      return kind;
  }
}

/** A basin that comes with its own tap: no tap is added to it (the rulebook, BA-8). */
export function includesTap(product: Named | null | undefined): boolean {
  return !!product && WITH_TAP.test(nameOf(product));
}

/** A tap or mixer fixed to the wall rather than on the basin's deck. */
export function isWallTap(product: Named | null | undefined): boolean {
  return !!product && /\bwall\b|კედლ/.test(nameOf(product));
}

/** A tap that stands on the floor beside the basin or the bath (a floor-standing mixer). */
export function isFloorTap(product: Named | null | undefined): boolean {
  return !!product && /\b(floor|freestanding)\b/.test(nameOf(product));
}

/** A bath built in (boxed) rather than standing free. */
export function isBuiltInBath(product: Named | null | undefined): boolean {
  return !!product && /\bbuilt-?in\b|ჩასაშენ/.test(nameOf(product));
}

/** A rectangular bath (the built-in and the Vintage enclosure take one). */
export function isRectangularBath(product: Named | null | undefined): boolean {
  return !!product && /\b(rectangular|square)\b|მართკუთხ/.test(nameOf(product));
}

/** A glass shower door or screen sold as a product: showers are built instead (the rulebook, BA-24). */
export function isShowerDoor(product: Named | null | undefined): boolean {
  return !!product && /\bshower (door|screen|enclosure)\b|\bglass\b[^|]*\bdoor\b/.test(nameOf(product));
}

/** A cooker hood that is round — a cylinder — which the rulebook prefers (K-7). */
export function isRoundHood(product: Named | null | undefined): boolean {
  return !!product && /\b(cylind|round|tube)/.test(nameOf(product));
}
