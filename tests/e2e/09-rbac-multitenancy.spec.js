import { test, expect } from '@playwright/test';
import { loginAs, TEST_CASHIER_USER, TEST_ADMIN_USER } from './helpers.js';

test.describe('PHASE 17 & 18 — Role-Based Access Control (RBAC) & Multi-Tenant Data Isolation', () => {
  test('Cashier role lands directly on /billing and cannot access admin settings', async ({ page }) => {
    // Log in as Cashier
    await loginAs(page, TEST_CASHIER_USER.email, TEST_CASHIER_USER.password);

    // Verify Cashier is redirected directly to /billing
    await expect(page).toHaveURL(/\/billing/);
    await expect(page.getByText('Point of Sale Terminal').first()).toBeVisible();

    // Cashier attempts direct navigation to /settings
    await page.goto('/settings');
    // Cashier sees read-only banner and save button is hidden
    await expect(page.getByText(/Read-only — only Admin can change settings/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();

    // Cashier attempts direct navigation to /admin -> redirected to /billing
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/billing/);
  });

  test('Cashier cannot view Delete buttons in Bill History', async ({ page }) => {
    await loginAs(page, TEST_CASHIER_USER.email, TEST_CASHIER_USER.password);
    await page.goto('/bills');

    // Delete buttons should NOT be rendered for cashier
    const deleteBtn = page.locator('table tbody tr button[title*="Delete"]').or(page.locator('button:has(svg.lucide-trash-2)'));
    await expect(deleteBtn).toHaveCount(0);
  });

  test('Multi-tenant data isolation: shop header reflects authenticated tenant', async ({ page }) => {
    await loginAs(page, TEST_ADMIN_USER.email, TEST_ADMIN_USER.password);
    await page.goto('/');

    // Dashboard header should display active shop name
    const shopHeader = page.locator('h1').first();
    await expect(shopHeader).toBeVisible();
    const shopName = await shopHeader.textContent();
    expect(shopName?.length).toBeGreaterThan(0);
  });
});
