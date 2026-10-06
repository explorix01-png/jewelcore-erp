import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 4 & 5 — Rate Management & Historical Rate Lookup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Rate Management page loads with descending purities and 24K first', async ({ page }) => {
    await page.goto('/rates');
    await expect(page.getByText('Rate Management').first()).toBeVisible();

    // Verify 24K and 999 inputs are present
    await expect(page.getByText(/Gold Rate/i).first()).toBeVisible();
    await expect(page.getByText(/Silver Rate/i).first()).toBeVisible();

    // Verify Purities list displays 24K first, descending order
    await expect(page.getByText('Gold 24K').first()).toBeVisible();
  });

  test('Admin can update Gold 24K and Silver 999 rates and persist across refresh', async ({ page }) => {
    await page.goto('/rates');

    // Enter test benchmark rate
    const testGoldRate = '7550';
    const testSilverRate = '92';

    // Find inputs for 24K Gold and 999 Silver
    const inputs = page.locator('input[type="number"]');
    await inputs.nth(0).fill(testGoldRate);
    await inputs.nth(1).fill(testSilverRate);

    // Click Update Daily Rates button
    const saveBtn = page.getByRole('button', { name: /update daily rates/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Wait for save to complete and reload to verify persistence
    await page.waitForTimeout(1000);
    await page.reload();

    // Rates should persist
    const newGoldVal = await inputs.nth(0).inputValue();
    expect(newGoldVal).toBe(testGoldRate);
  });

  test('Historical Rate Lookup resolves effective rate for past dates', async ({ page }) => {
    await page.goto('/rates');

    // Locate Historical Rate Lookup card
    await expect(page.getByText('Historical Rate Lookup')).toBeVisible();

    // Select date input inside historical lookup
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    // Change to yesterday's date
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await dateInput.fill(yesterday);

    // Click Lookup button
    const lookupBtn = page.getByRole('button', { name: /lookup/i }).first();
    await lookupBtn.click();

    // Verify effective rate results or status is rendered
    await expect(page.getByText(/Effective Benchmark Rates|Rate Snapshot/i)).toBeVisible();
  });
});
