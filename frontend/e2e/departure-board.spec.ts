import { test, expect } from '@playwright/test';

test.describe('Departure Board', () => {
  test('navigates to boards view and shows search', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /boards/i }).click();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('can search for a station', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /boards/i }).click();
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('Park');
    // Should show dropdown results
    await expect(page.getByText(/Park Street/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('selecting a station shows departures', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /boards/i }).click();
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('Park');
    // Click the first result
    await page.getByText(/Park Street/i).first().click();
    // Should show the station name in the header
    await expect(page.locator('.board-station-name')).toBeVisible();
  });
});
