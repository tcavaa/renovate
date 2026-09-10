import { expect, test } from '@playwright/test';

/**
 * The studio journey end to end on the bundled sample plan: upload → what kind of project →
 * rooms → style → a furnished 3D scene with a price. Without ANTHROPIC_API_KEY the parse
 * falls back to the CV parser and asks for the total area (pre-filled for the sample), and
 * the plan is handed over as soon as that is valid — the one continue button at the bottom
 * of the page does the rest, and refuses to go on until the mode has been chosen.
 */
test('sample plan reaches a furnished studio with a cost bar', async ({ page }) => {
  await page.goto('/design');

  await page.getByRole('button', { name: /სანიმუშო გეგმის მოსინჯვა/ }).click();

  // The plan is ready once the CV fallback has its area (pre-filled) or Claude read it.
  await expect(page.getByText(/გეგმა მზადაა/)).toBeVisible({ timeout: 30_000 });

  // Neither mode is pre-selected; continuing without one is refused with a message.
  const nav = page.locator('.sticky.bottom-0');
  await nav.getByRole('button', { name: /^გაგრძელება$/ }).click();
  await expect(page.getByRole('alert')).toContainText(/რა გჭირდება/);
  await page.getByRole('button', { name: /მხოლოდ დიზაინი/ }).click();
  await nav.getByRole('button', { name: /^გაგრძელება$/ }).click();

  await expect(page).toHaveURL(/\/design\/plan/);
  await expect(page.getByText(/მ²/).first()).toBeVisible();
  // The review step lists doors and windows once a room is picked on the plan.
  await expect(page.getByText(/კარები და ფანჯრები/).first()).toBeVisible();

  await page.goto('/design/style');
  await page.getByRole('button', { name: /დიზაინის გენერაცია/ }).click();

  await expect(page).toHaveURL(/\/design\/studio/);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\d[\d ]*\s?₾/).first()).toBeVisible();
  // The top bar carries the time of day and the camera.
  await expect(page.getByRole('radiogroup', { name: /დღე-ღამე/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ფოტო$/ })).toBeVisible();

  // Furniture actually loaded: the models are fetched from /models. React Three Fiber 9
  // configures the renderer asynchronously, so the first fetches land a beat after the canvas.
  await expect
    .poll(
      () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('.glb')).length),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);
});
