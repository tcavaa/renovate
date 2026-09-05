import { expect, test } from '@playwright/test';

test.describe('public pages', () => {
  test('landing page renders with the brand title and both calls to action', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/რემონტი\.ge/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /გამომთვლელი/ }).first()).toBeVisible();
  });

  test('health endpoint reports the database', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.db).toBe('ok');
  });

  test('catalogue is server-rendered and filters by category through the URL', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const chips = page.locator('main nav a');
    expect(await chips.count()).toBeGreaterThan(1);

    const second = chips.nth(1);
    const href = await second.getAttribute('href');
    await second.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  });

  test('workers directory filters by specialty', async ({ page }) => {
    await page.goto('/workers?specialty=tiling');
    await expect(page.locator('a[aria-current="page"]')).toHaveAttribute('href', '/workers?specialty=tiling');
  });

  test('unknown routes show the 404 page with a way home', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('link', { name: /მთავარ|home/i }).first()).toBeVisible();
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/');
    const headers = res.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});

test.describe('auth pages', () => {
  test('login links to password reset and both forms render', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/ელ-ფოსტა|email/i)).toBeVisible();
    await page.getByRole('link', { name: /პაროლი დაგავიწყდა|forgot/i }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByRole('button', { name: /ბმულის გაგზავნა|send reset/i })).toBeVisible();
  });

  test('a reset link without a token explains itself', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText(/ბმული არასწორია|invalid/i)).toBeVisible();
  });

  test('rejected callback URLs never leave the site', async ({ page }) => {
    await page.goto('/login?callbackUrl=https://evil.example');
    const register = page.getByRole('link', { name: /რეგისტრაცია|register/i });
    // The register link carries the callback along only when it was accepted.
    await expect(register).toHaveAttribute('href', '/register');
  });
});
