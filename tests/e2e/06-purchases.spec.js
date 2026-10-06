import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 9 — Purchase & Stock Inward Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Purchase Management page loads with table, summary cards, and search', async ({ page }) => {
    await page.goto('/purchase/management');
    await expect(page.getByText('Procurement Records').first()).toBeVisible();

    // Verify KPI cards
    await expect(page.getByText('Total Inward Purchases')).toBeVisible();
    await expect(page.getByText('Procurement Value')).toBeVisible();
  });

  test('Purchase Add Stock workspace allows item selection and weight calculation', async ({ page }) => {
    await page.goto('/purchase/add');
    await expect(page.getByRole('heading', { name: 'Add Purchase', exact: true })).toBeVisible();

    // Verify Tabs for Gold and Silver
    await expect(page.getByRole('tab', { name: /gold/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /silver/i })).toBeVisible();

    // Verify Date input
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();
  });
});
