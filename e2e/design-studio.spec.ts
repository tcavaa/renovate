import { expect, test } from '@playwright/test';

/**
 * The studio journey end to end on the bundled sample plan: an account → a named project from
 * the design hub → upload → what kind of project → the existing house on the drawing board →
 * technical setup → style test → a furnished 3D scene with the build bar and a price — and the
 * project reopening where it was left. Without ANTHROPIC_API_KEY the parse falls back to the CV
 * parser and asks for the total area (pre-filled for the sample), and the plan is handed over as
 * soon as that is valid — the one continue button at the bottom of the page does the rest, and
 * refuses to go on until the mode has been chosen.
 *
 * The steps live inside a project and need an account, so the test registers a fresh one; it
 * leaves that account and its project in the database.
 */
test('sample plan reaches a furnished studio with a build bar and a cost', async ({ page }) => {
  // A fresh account, signed in on registering.
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/register?callbackUrl=/design');
  await page.locator('#name').fill('E2E');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('e2e-password-2026');
  await page.getByRole('button', { name: /^რეგისტრაცია$/ }).click();

  // The design hub: a new project from the "upload a plan" tile, named.
  await expect(page).toHaveURL(/\/design$/, { timeout: 30_000 });
  await page.getByRole('button', { name: /ატვირთე გეგმა/ }).first().click();
  await page.getByLabel(/პროექტის სახელი/).fill('E2E ბინა');
  await page.getByRole('button', { name: /შექმნა და დაწყება/ }).click();
  await expect(page).toHaveURL(/\/design\/\d+\/start/, { timeout: 30_000 });
  const projectUrl = page.url().replace(/\/start.*$/, '');

  await page.getByRole('button', { name: /სანიმუშო გეგმის მოსინჯვა/ }).click();

  // The plan is ready once the CV fallback has its area (pre-filled) or Claude read it.
  await expect(page.getByText(/გეგმა მზადაა/)).toBeVisible({ timeout: 30_000 });

  // Neither mode is pre-selected; continuing without one is refused with a message.
  const nav = page.locator('.sticky.bottom-0');
  await nav.getByRole('button', { name: /^გაგრძელება$/ }).click();
  await expect(page.getByRole('alert')).toContainText(/რა გჭირდება/);
  await page.getByRole('button', { name: /მხოლოდ დიზაინი/ }).click();
  await nav.getByRole('button', { name: /^გაგრძელება$/ }).click();

  // Step 2: the existing house on the drawing board, with the build tools and the rooms. On a
  // desktop the board steps are the whole window: the way on is in the bar over the sheet, and
  // the page's bottom bar (and its narrow-screen head) are hidden.
  await expect(page).toHaveURL(/\/design\/\d+\/plan/);
  await expect(page.getByRole('toolbar')).toBeVisible();
  await expect(page.getByRole('button', { name: /^კედელი$/ })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText(/მ²/).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /ტექნიკური პირობები/ }).click();

  // Step 3: the technical setup, with the works checklist.
  await expect(page).toHaveURL(/\/design\/\d+\/technical/);
  await expect(page.getByText(/რა სამუშაოებია საჭირო/)).toBeVisible();
  await page.getByRole('button', { name: /სტილის ტესტი/ }).click();

  // Step 4: the style test; five answers give a style, then generate.
  await expect(page).toHaveURL(/\/design\/\d+\/style/);
  for (let i = 0; i < 5; i++) {
    await page.getByRole('radio').nth(1).click();
  }
  await expect(page.getByText(/შენი სტილი/)).toBeVisible();
  await page.getByRole('button', { name: /დიზაინის გენერაცია/ }).click();

  // Step 5: the studio, with the build bar and a price.
  await expect(page).toHaveURL(/\/design\/\d+\/studio/, { timeout: 15_000 });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  // The tour opens on the first visit; skip it.
  const skip = page.getByRole('button', { name: /გამოტოვება/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.getByRole('navigation', { name: /3D სტუდია/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ავეჯი/ })).toBeVisible();
  await expect(page.getByText(/\d[\d ]*\s?₾/).first()).toBeVisible();
  // The top bar carries the time of day, the structure lock and the camera.
  await expect(page.getByRole('radiogroup', { name: /დღე-ღამე/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /კედლების განბლოკვა/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ფოტო$/ })).toBeVisible();

  // Furniture actually loaded: the models are fetched from /models. React Three Fiber 9
  // configures the renderer asynchronously, so the first fetches land a beat after the canvas.
  await expect
    .poll(
      () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('.glb')).length),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);

  // Step 7: the budget reads materials + products + labour.
  await page.goto(`${projectUrl}/summary`);
  await expect(page.getByText(/სავარაუდო ღირებულება/).first()).toBeVisible();

  // The project is in the design hub, and opening it goes back to the page it was left on.
  await page.goto('/design');
  await expect(page.getByText('E2E ბინა').first()).toBeVisible();
  await page.goto(projectUrl);
  await expect(page).toHaveURL(/\/design\/\d+\/summary/, { timeout: 30_000 });
});
