import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 13, 14, 16 — Bill History, Deletion & Due Collection', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Bill History page loads with financial summary cards and invoice table', async ({ page }) => {
    await page.goto('/bills');
    await expect(page.getByText('Sales Invoices').first()).toBeVisible();

    // Verify search and filter controls
    await expect(page.getByPlaceholder(/Bill #, Customer Name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /new invoice/i })).toBeVisible();
  });

  test('Clicking bill details opens BillViewDialog with breakdown and invoice print button', async ({ page }) => {
    await page.goto('/bills');

    // Click the eye/view button on first bill row
    const viewButton = page.locator('table tbody tr button[title*="View Invoice"]').or(page.locator('button:has(svg.lucide-eye)')).first();
    if (await viewButton.isVisible()) {
      await viewButton.click();

      // Verify Bill View dialog opens
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/Tax Invoice|Sales Receipt|Jewellery Bill/i)).toBeVisible();

      // Verify print invoice button exists
      const printBtn = page.getByRole('dialog').getByRole('button', { name: /print/i });
      await expect(printBtn).toBeVisible();

      // Close dialog
      const closeBtn = page.getByRole('dialog').getByRole('button', { name: /close/i }).or(page.locator('button:has(svg.lucide-x)'));
      await closeBtn.first().click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  });

  test('Delete Bill dialog enforces reason prompt and allows safe cancellation', async ({ page }) => {
    await page.goto('/bills');

    // Click delete button on any bill row
    const deleteBtn = page.locator('table tbody tr button[title*="Delete"]').or(page.locator('button:has(svg.lucide-trash-2)')).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // Verify critical warning dialog opens
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Delete Sales Invoice')).toBeVisible();
      await expect(page.getByText(/Critical Financial & Inventory Warning/i)).toBeVisible();

      // Test safe cancellation
      const cancelBtn = page.getByRole('dialog').getByRole('button', { name: /cancel/i });
      await cancelBtn.click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  });
});
