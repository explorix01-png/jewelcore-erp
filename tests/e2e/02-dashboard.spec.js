import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 3 — Dashboard UI & Interactive Cards', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Dashboard loads without errors and displays all KPI cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Store Performance Hub')).toBeVisible();

    // Verify Financial & Sales Overview cards exist
    await expect(page.getByText("Today's Sales")).toBeVisible();
    await expect(page.getByText('Weekly Sales')).toBeVisible();
    await expect(page.getByText('Monthly Sales')).toBeVisible();
    await expect(page.getByText('Total Bills')).toBeVisible();

    // Verify Metal Quantity Sold Section
    await expect(page.getByText('Metal Quantity Sold (Grams)')).toBeVisible();
    await expect(page.getByText(/Gold Sold/i)).toBeVisible();
    await expect(page.getByText(/Silver Sold/i)).toBeVisible();

    // Verify Breakdown section
    await expect(page.getByText('Sales Channels & Collections Breakdown')).toBeVisible();
    await expect(page.getByText('Inventory Sales')).toBeVisible();
  });

  test('Period toggle filters (Daily, Weekly, Monthly) update metal sales cards', async ({ page }) => {
    await page.goto('/');

    // Locate weight period switcher
    const weeklyBtn = page.getByRole('button', { name: 'Weekly', exact: true }).first();
    await weeklyBtn.click();
    await expect(page.getByText('Gold Sold (Weekly)')).toBeVisible();
    await expect(page.getByText('Silver Sold (Weekly)')).toBeVisible();

    const monthlyBtn = page.getByRole('button', { name: 'Monthly', exact: true }).first();
    await monthlyBtn.click();
    await expect(page.getByText('Gold Sold (Monthly)')).toBeVisible();
    await expect(page.getByText('Silver Sold (Monthly)')).toBeVisible();

    const dailyBtn = page.getByRole('button', { name: 'Daily', exact: true }).first();
    await dailyBtn.click();
    await expect(page.getByText('Gold Sold (Daily)')).toBeVisible();
  });

  test('Clicking dashboard cards opens drill-down transaction modal', async ({ page }) => {
    await page.goto('/');

    // Click Today's Sales card
    await page.getByText("Today's Sales").first().click();

    // Verify drill-down modal appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Total Revenue|Breakdown/i).first()).toBeVisible();

    // Close modal
    const closeBtn = page.getByRole('dialog').getByRole('button', { name: /close/i });
    await closeBtn.first().click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Quick navigation buttons from dashboard work', async ({ page }) => {
    await page.goto('/');

    // Click "+ New Bill" button
    await page.getByRole('button', { name: /new bill/i }).first().click();
    await expect(page).toHaveURL(/\/billing/);

    // Return to dashboard
    await page.goto('/');

    // Click "Metal Rates" button
    await page.getByRole('button', { name: /metal rates/i }).click();
    await expect(page).toHaveURL(/\/rates/);
  });
});
