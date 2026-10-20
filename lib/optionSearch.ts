import { transliterate } from '@/lib/slug';

/**
 * The search behind a searchable select (`components/ui/combobox.tsx`). Pure.
 *
 * An option is found by its label and by the words it was given (its name in the other
 * languages, a key, a slug) anywhere in them, and by its label written in Latin letters from
 * the start of a word, so "magida" finds "მაგიდა" on an English keyboard while "tv" does not
 * find "ჩამრთველი" (chamrtveli). Every word typed has to be found. Options may form a
 * tree (`depth`): a match is shown with the options above it, so it stays clear where it sits.
 */

export interface SearchOption {
  value: string;
  label: string;
  /** Other words that find the option: its name in the other languages, a key, a slug. */
  keywords?: ReadonlyArray<string | null | undefined>;
  /**
   * Its level in a tree, 0 at the top. An option sits under the nearest one before it in the
   * list with a smaller depth (the list is in reading order, each parent before its children).
   */
  depth?: number;
}

export interface OptionHit<T extends SearchOption> {
  option: T;
  /** False for an option shown only because something under it matched. */
  match: boolean;
}

/** Lower case, accents off (é → e, ё → е), single spaces. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What an option is found by, normalized: its own words, and its label in Latin letters. */
export interface OptionHaystack {
  text: string;
  /** The label transliterated, with a space before every word (a word is found from its start). */
  latin: string;
}

export function optionHaystack(option: SearchOption): OptionHaystack {
  const words = [option.label, ...(option.keywords ?? [])].filter(Boolean);
  const latin = normalizeSearch(transliterate(option.label).replace(/[^a-z0-9]+/g, ' '));
  return { text: normalizeSearch(words.join(' \u0000 ')), latin: ` ${latin}` };
}

function found(hay: OptionHaystack, word: string): boolean {
  return hay.text.includes(word) || hay.latin.includes(` ${word}`);
}

/**
 * The options to show for what was typed, in their order: every option when nothing was,
 * otherwise each one that has all the words, with its parents (`match: false` when a parent
 * does not match itself).
 */
export function searchOptions<T extends SearchOption>(options: readonly T[], query: string, haystacks: readonly OptionHaystack[] = options.map(optionHaystack)): Array<OptionHit<T>> {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return options.map((option) => ({ option, match: true }));
  const matched = haystacks.map((hay) => words.every((word) => found(hay, word)));
  const shown = new Set<number>();
  options.forEach((option, i) => {
    if (!matched[i]) return;
    shown.add(i);
    // Up the tree: the nearest option before this one that sits a level higher, and so on.
    let depth = option.depth ?? 0;
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      const above = options[j].depth ?? 0;
      if (above < depth) {
        shown.add(j);
        depth = above;
      }
    }
  });
  return options.flatMap((option, i) => (shown.has(i) ? [{ option, match: matched[i] }] : []));
}
