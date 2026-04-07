import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('can switch between map and boards views', async ({ page }) => {
    await page.goto('/');
    // Start on map
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });

    // Switch to boards
    await page.getByRole('button', { name: /boards/i }).click();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    // Switch back to map
    await page.getByRole('button', { name: /map/i }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  });

  test('accessibility toggle exists and is clickable', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /accessibility/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Toggle should now be pressed
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
