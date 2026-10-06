import { test, expect } from '@playwright/test';

test.describe('PHASE 2 — Authentication, Session & Route Protection', () => {
  test('Login page loads with branding, inputs, and validation', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/JewelCore/i);
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('Rejects invalid credentials with error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('fake_user@example.com');
    await page.getByLabel('Password').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Should display invalid credentials error banner
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test('Valid credentials log in successfully and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@jewelcore.local');
    await page.getByLabel('Password').fill('Admin@JewelCore2026');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Verify redirection to Dashboard
    await expect(page).toHaveURL(/\/(#.*)?$/);
    await expect(page.getByText('Store Performance Hub')).toBeVisible();
  });

  test('Refresh preserves valid session', async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@jewelcore.local');
    await page.getByLabel('Password').fill('Admin@JewelCore2026');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Store Performance Hub')).toBeVisible();

    // Reload page
    await page.reload();
    await expect(page.getByText('Store Performance Hub')).toBeVisible();
  });

  test('Unauthenticated access to protected routes redirects to /login', async ({ page }) => {
    // Clear storage to ensure logged out state
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    // Attempt direct navigation to billing
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Attempt direct navigation to customers
    await page.goto('/customers');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Logout cleanly clears session and prevents back-navigation', async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@jewelcore.local');
    await page.getByLabel('Password').fill('Admin@JewelCore2026');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Store Performance Hub')).toBeVisible();

    // Locate user menu / logout button in sidebar or header
    let logoutBtn = page.locator('button[title="Logout"]').filter({ visible: true }).first();
    if (!await logoutBtn.isVisible()) {
      // Mobile drawer needs to be opened
      const mobileMenuBtn = page.getByLabel('Open Navigation Menu');
      if (await mobileMenuBtn.isVisible()) {
        await mobileMenuBtn.click();
        await page.waitForTimeout(400);
      }
    }
    
    logoutBtn = page.locator('button[title="Logout"]').filter({ visible: true }).first();
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/);

    // Navigating back should not show protected data
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
