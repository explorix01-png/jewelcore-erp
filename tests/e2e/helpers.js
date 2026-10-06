import { expect } from '@playwright/test';

export const TEST_ADMIN_USER = {
  email: 'admin@jewelcore.local',
  password: 'Admin@JewelCore2026',
  name: 'Admin User',
  role: 'admin',
};

export const TEST_CASHIER_USER = {
  email: 'cashier@jewelcore.local',
  password: 'Cashier@JewelCore2026',
  name: 'Cashier User',
  role: 'cashier',
};

/**
 * Perform real login through the UI
 */
export async function loginAs(page, email = TEST_ADMIN_USER.email, password = TEST_ADMIN_USER.password) {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  // Wait for post-login dashboard or billing to appear
  await expect(page).toHaveURL(/\/(#.*)?$|\/billing/);
  await page.waitForLoadState('networkidle');
}

/**
 * Open mobile drawer if currently on a mobile viewport
 */
export async function openMobileMenuIfNeeded(page) {
  const mobileMenuBtn = page.getByLabel('Open Navigation Menu');
  if (await mobileMenuBtn.isVisible()) {
    await mobileMenuBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Navigate to a section via sidebar navigation
 */
export async function navigateTo(page, linkName, targetUrlPattern) {
  await openMobileMenuIfNeeded(page);
  const link = page.getByRole('link', { name: new RegExp(linkName, 'i') }).filter({ visible: true }).first();
  if (await link.isVisible()) {
    await link.click();
  } else {
    // Direct navigate fallback
    const urlMap = {
      dashboard: '/',
      billing: '/billing',
      bills: '/bills',
      customers: '/customers',
      gold: '/inventory/gold',
      silver: '/inventory/silver',
      rates: '/rates',
      purchase: '/purchase/management',
      settings: '/settings',
    };
    const key = Object.keys(urlMap).find((k) => linkName.toLowerCase().includes(k));
    if (key) await page.goto(urlMap[key]);
  }
  if (targetUrlPattern) {
    await expect(page).toHaveURL(targetUrlPattern);
  }
  await page.waitForLoadState('networkidle');
}
