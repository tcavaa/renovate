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

/**
 * A deactivated account: the `code` of the password form's refusal, and the `?error=` a social
 * sign-in comes back with. The person did nothing wrong, so they are told rather than shown
 * "wrong e-mail or password".
 */
export const ACCOUNT_DISABLED = 'account_disabled';

/** `?error=` when a social sign-in names the e-mail of a password account it may not join. */
export const SOCIAL_LINK_REFUSED = 'social_link_refused';

/**
 * Whether a social sign-in may become the existing account that has its e-mail address. Being
 * that account is being whoever owns the address, so the provider has to vouch for it:
 * Google says so (`email_verified`), and is believed. Facebook does not say, so it joins only an
 * account with no password — one a social sign-in made — and never a password account, an
 * admin's included: anyone able to put that address on a Facebook profile would otherwise be
 * signed in as its owner.
 */
export function maySocialJoin(provider: string, profile: { email_verified?: unknown } | null | undefined, existing: { passwordHash: string | null }): boolean {
  if (provider === 'google') return profile?.email_verified === true;
  return !existing.passwordHash;
}

