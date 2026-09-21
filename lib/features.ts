/**
 * Parts of the site that exist and are switched off.
 *
 * One flag per part, read where the part is linked to and where it is served, so switching
 * one back on is one word and not a hunt through the header, the footer and the 404 page.
 */

/**
 * The directory of individual workers (`/workers`, `/workers/[id]`).
 *
 * Off since September 2026: a renovation is hired as a brigade, so the site sends people to
 * `/teams` and nowhere else. The workers themselves are still here — a brigade is made of
 * them, admin manages them, they register and keep their own card — only the public list of
 * them, and the profile pages hanging off it, are hidden: the routes send visitors on to the
 * brigades and nothing links to them.
 */
export const WORKERS_DIRECTORY = false;
