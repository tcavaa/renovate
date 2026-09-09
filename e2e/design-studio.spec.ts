import { expect, test } from '@playwright/test';

/**
 * The studio journey end to end on the bundled sample plan: upload → rooms → style →
 * a furnished 3D scene with a price. Without ANTHROPIC_API_KEY the parse falls back to the
 * CV parser and asks for the total area, which is what this exercises.
 */
test('sample plan reaches a furnished studio with a cost bar', async ({ page }) => {
  await page.goto('/design');

  await page.getByRole('button', { name: /სანიმუშო გეგმის მოსინჯვა/ }).click();

  // CV fallback: confirm the total area the sample pre-fills.
  const area = page.locator('#plan-total-area');
  await expect(area).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /გაგრძელება/ }).click();

  await expect(page).toHaveURL(/\/design\/plan/);
  await expect(page.getByText(/მ²/).first()).toBeVisible();

  await page.goto('/design/style');
  await page.getByRole('button', { name: /დიზაინის გენერაცია/ }).click();

  await expect(page).toHaveURL(/\/design\/studio/);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\d[\d\u202F]*\s?₾/).first()).toBeVisible();

  // Furniture actually loaded: the models are fetched from /models. React Three Fiber 9
  // configures the renderer asynchronously, so the first fetches land a beat after the canvas.
  await expect
    .poll(
      () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('.glb')).length),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);
});
