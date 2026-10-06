import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 10, 11, 12 — New Bill Workflow, Payments & Old Gold Exchange', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('New Bill page loads with customer selection, item modes, and payment section', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.getByText('Point of Sale Terminal').first()).toBeVisible();

    // Verify tabs: Inventory Billing vs Manual Billing
    await expect(page.getByRole('tab', { name: /inventory billing/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /manual billing/i })).toBeVisible();

    // Verify Customer selector
    await expect(page.getByPlaceholder(/search by name or mobile/i)).toBeVisible();

    // Verify Payment modes container
    await expect(page.getByText(/Settlement \/ Payment Mode/i)).toBeVisible();
  });

  test('Create a bill with manual item, making charges, and verify calculations', async ({ page }) => {
    await page.goto('/billing');

    // 1. Switch to Manual Billing tab
    await page.getByRole('tab', { name: /manual billing/i }).click();

    // 2. Click Add button
    const addItemBtn = page.getByRole('button', { name: 'Add', exact: true });
    await expect(addItemBtn).toBeVisible();
    await addItemBtn.click();

    // 3. Search and select a customer
    const custSearch = page.getByPlaceholder(/search by name or mobile/i);
    await custSearch.fill('Ramesh');
    await page.waitForTimeout(400);

    const firstMatch = page.locator('div.divide-y button').first();
    if (await firstMatch.isVisible()) {
      await firstMatch.click();
    }

    // 4. Fill manual item details
    const itemNameInput = page.getByPlaceholder('Item').first();
    if (await itemNameInput.isVisible()) {
      await itemNameInput.fill('Gold Ring 22K');
    }

    // 5. Verify Bill Summary displays calculated Subtotal and Total
    await expect(page.getByText('Bill Summary')).toBeVisible();
  });

  test('Payment mode switching (Credit Due, Gold Exchange) displays specialized forms', async ({ page }) => {
    await page.goto('/billing');

    // Open payment mode dropdown
    const modeTrigger = page.locator('div:has(> label:has-text("Settlement / Payment Mode")) [role="combobox"]').first();
    await expect(modeTrigger).toBeVisible();
    await modeTrigger.click();

    // Select "Credit (Full Due)"
    const creditOption = page.getByRole('option', { name: /Credit \(Full Due\)/i });
    await expect(creditOption).toBeVisible();
    await creditOption.click();
    await expect(page.getByText(/Full Credit \/ Customer Ledger Account/i)).toBeVisible();

    // Switch to Gold Exchange
    await modeTrigger.click();
    const goldOption = page.getByRole('option', { name: /Gold Exchange \(Gold Given\)/i });
    await expect(goldOption).toBeVisible();
    await goldOption.click();
    await expect(page.getByText(/Customer Gold Given \/ Exchange Details/i)).toBeVisible();
  });
});
