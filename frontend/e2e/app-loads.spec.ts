import { test, expect } from '@playwright/test';

test.describe('App Loading', () => {
  test('renders the navigation bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('BOSTON SUBWAY')).toBeVisible();
    await expect(page.getByText('LIVE')).toBeVisible();
  });

  test('shows Map and Boards tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /map/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /boards/i })).toBeVisible();
  });

  test('map container renders', async ({ page }) => {
    await page.goto('/');
    // MapLibre creates a canvas element inside the map container
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  });
});
