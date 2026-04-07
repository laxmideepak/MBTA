import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('works at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    // Nav should still be visible
    await expect(page.getByText('BOSTON SUBWAY')).toBeVisible();
    // No horizontal overflow
    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for rounding
  });

  test('departure board is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.getByRole('button', { name: /boards/i }).click();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });
});
