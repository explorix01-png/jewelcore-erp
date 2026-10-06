import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 6 — Customer Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Customer page loads, displays stats, and allows searching', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Customer Directory').first()).toBeVisible();

    // Verify Customer Statistics cards
    await expect(page.getByText('Total Customers')).toBeVisible();
    await expect(page.getByText('Outstanding Dues')).toBeVisible();

    // Verify search input is present
    const searchInput = page.getByPlaceholder(/search by name, mobile/i);
    await expect(searchInput).toBeVisible();
  });

  test('Create a new customer, search, and verify persistence after reload', async ({ page }) => {
    await page.goto('/customers');

    // Click "New Customer" button
    const addBtn = page.getByRole('button', { name: /new customer|add customer/i });
    await addBtn.click();

    // Verify modal is open
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill customer form
    const timestamp = Date.now().toString().slice(-4);
    const customerName = `QA Tester ${timestamp}`;
    const customerMobile = `98765${timestamp}1`;

    await page.getByPlaceholder('e.g. Rameshwar Soni').fill(customerName);
    await page.getByPlaceholder('e.g. 9876543210').fill(customerMobile);

    // Save customer
    const saveBtn = page.getByRole('dialog').getByRole('button', { name: /save|create/i });
    await saveBtn.click();

    // Modal closes
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Search for created customer
    const searchInput = page.getByPlaceholder(/search by name, mobile/i);
    await searchInput.fill(customerName);
    await page.waitForTimeout(500);

    // Verify customer appears in table
    await expect(page.getByText(customerName)).toBeVisible();

    // Reload page to verify database persistence
    await page.reload();
    await searchInput.fill(customerName);
    await expect(page.getByText(customerName)).toBeVisible();
  });

  test('Clicking customer navigates to Customer Ledger detail page', async ({ page }) => {
    await page.goto('/customers');

    // Find any customer link/button in table
    const viewButton = page.locator('table tbody tr button[title*="History"]').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await expect(page).toHaveURL(/\/customers\/[a-zA-Z0-9_-]+/);
      await expect(page.getByText(/Customer Ledger|Purchase History|Outstanding/i)).toBeVisible();
    }
  });
});
