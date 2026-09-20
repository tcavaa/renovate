/**
 * The social logins, as both halves of the app see them.
 *
 * The server decides whether a provider exists at all — `auth.ts` adds Google or Facebook
 * to the provider list only when both halves of its key pair are set — and the login page
 * has to draw the matching button without importing `auth.ts`, which would drag the
 * database and bcrypt into the browser bundle. So the two sides meet here: a public flag
 * per provider, and the one error code the sign-in callback can hand back.
 *
 * Next inlines `NEXT_PUBLIC_*` only where the whole expression is written out in the
 * source, which is why these are two constants rather than a loop over provider names.
 */

export const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
export const FACEBOOK_ENABLED = process.env.NEXT_PUBLIC_FACEBOOK_ENABLED === 'true';

/** `?error=` on the login page when a provider signed someone in but gave no e-mail address. */
export const SOCIAL_NO_EMAIL = 'SocialNoEmail';
