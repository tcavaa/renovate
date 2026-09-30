/**
 * Links into the profile's lists that other pages hand out — built here, never by hand, like the
 * step URLs (`lib/calculator/steps.ts`, `lib/design/steps.ts`). Pure: the studio's client code and
 * the profile's server components both use it.
 */

/** The id of a project's group in the profile's renders (`HubRenders`), the fragment a link scrolls to. */
export function rendersAnchor(projectId: number): string {
  return `renders-project-${projectId}`;
}

/** The profile's renders, scrolled to one project's when given (the studio's "see the render"). */
export function profileRendersHref(projectId?: number | null): string {
  return projectId != null ? `/profile?view=renders#${rendersAnchor(projectId)}` : '/profile?view=renders';
}
