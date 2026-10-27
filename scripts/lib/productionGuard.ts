/**
 * Keeps a catalogue script off production's products unless it is told so.
 *
 * `.env.local` points at production's Supabase (there is no local database), so a script run on
 * this machine writes there. `pnpm models:seed` makes the products match the model manifests:
 * products the team deleted in admin come back, and names, stores, styles and categories go back
 * to the manifest's. It runs only against a database on this machine, or with `--production`.
 */

/** A database on this machine: localhost, 127.0.0.1 or ::1. No URL counts as local (the default is local). */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Why a script will not run, or null when it may: a database not on this machine needs `--production` among the arguments. */
export function productionRefusal(script: string, url: string | undefined, argv: readonly string[]): string | null {
  if (isLocalDatabase(url) || argv.includes('--production')) return null;
  return [
    `✗ ${script} would rewrite the catalogue of a database that is not on this machine — production's.`,
    '  It makes the products match the model manifests: products the team deleted come back, and names,',
    "  stores, styles and categories go back to the manifest's. The team keeps that catalogue in admin.",
    `  If that is really meant: pnpm ${script} --production`,
  ].join('\n');
}
