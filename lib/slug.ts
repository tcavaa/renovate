/**
 * Latin slugs from names typed in Georgian (or Russian), and a free one when a slug is taken.
 *
 * `slugify` in `lib/utils.ts` keeps Georgian letters as they are; a product's slug is its
 * public URL (`/catalog/<slug>`), so the product form writes it in Latin letters instead:
 * "ჟურნალის მაგიდა" → "zhurnalis-magida". Pure, for the form and the routes alike.
 */

/**
 * Georgian (Mkhedruli) in Latin by the national romanization (2002): the aspirated and the
 * ejective pairs fall together (თ/ტ t, ქ/კ k, ფ/პ p, ჩ/ჭ ch, ც/წ ts), as in Georgian place
 * names written in Latin. The archaic letters last.
 */
const GEORGIAN: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l',
  მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k',
  ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j',
  ჰ: 'h', ჱ: 'e', ჲ: 'y', ჳ: 'w', ჴ: 'q', ჵ: 'o', ჶ: 'f', ჷ: 'e', ჸ: '',
};

/** Russian in Latin, as passports write it (ж zh, х kh, ц ts, щ shch, ю yu, я ya). */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const LATIN: Record<string, string> = { ...GEORGIAN, ...CYRILLIC };

/** The longest slug made from a name; a numeric suffix may follow it. */
export const SLUG_MAX = 100;

/**
 * The text in lower case with its Georgian and Russian letters written in Latin; everything
 * else is left as it is. Upper-case Georgian (Mtavruli) is lowered to Mkhedruli first.
 */
export function transliterate(text: string): string {
  return text.toLowerCase().replace(/[\u10D0-\u10FF\u0400-\u04FF]/g, (ch) => LATIN[ch] ?? ch);
}

/**
 * A URL slug in Latin letters, digits and single hyphens: Georgian and Russian transliterated,
 * accents dropped (é → e), anything else a hyphen. "ჟურნალის მაგიდა Oslo 120" →
 * "zhurnalis-magida-oslo-120"; empty when nothing Latin is left.
 */
export function latinSlug(text: string): string {
  return transliterate(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/**
 * `slug` itself when nothing has it, otherwise the first of `slug-2`, `slug-3`, … that is
 * free. `taken` holds the slugs in use (any superset of the ones starting with `slug` will do).
 */
export function freeSlug(slug: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const next = `${slug}-${n}`;
    if (!used.has(next)) return next;
  }
}

/** A `LIKE` pattern for everything that starts with `text`, its `%`, `_` and backslashes escaped. */
export function likePrefix(text: string): string {
  return `${text.replace(/[\\%_]/g, '\\$&')}%`;
}
