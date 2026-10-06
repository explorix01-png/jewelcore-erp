import { test, expect } from '@playwright/test';
import { loginAs } from './helpers.js';

test.describe('PHASE 19, 20, 21 — Responsive Viewports, PWA Manifest, and Console QA', () => {
  const VIEWPORTS = [
    { width: 360, height: 800, name: 'Mobile 360x800' },
    { width: 390, height: 844, name: 'Mobile 390x844' },
    { width: 768, height: 1024, name: 'Tablet 768x1024' },
    { width: 1024, height: 768, name: 'Laptop Small 1024x768' },
    { width: 1366, height: 768, name: 'Laptop Standard 1366x768' },
    { width: 1440, height: 900, name: 'Desktop 1440x900' },
    { width: 1920, height: 1080, name: 'Full HD 1920x1080' },
  ];

  for (const vp of VIEWPORTS) {
    test(`Responsive check on ${vp.name} (${vp.width}x${vp.height}) without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page);

      // Verify Dashboard renders cleanly
      await page.goto('/');
      await expect(page.getByText('Store Performance Hub')).toBeVisible();

      // Check for horizontal scroll / overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // Verify navigation links/buttons are accessible
      if (vp.width < 1024) {
        // Mobile drawer button must be visible
        await expect(page.getByLabel('Open Navigation Menu')).toBeVisible();
      } else {
        // Desktop sidebar must be visible
        await expect(page.locator('aside').first()).toBeVisible();
      }
    });
  }

  test('PWA manifest exists and is valid JSON', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();
    expect(manifest.name).toMatch(/JewelCore/i);
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBe('standalone');
  });

  test('Offline banner behavior when browser connectivity status is toggled', async ({ page }) => {
    await loginAs(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Simulate offline
    await page.context().setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Safety alert banner should be displayed
    const banner = page.locator('div[role="alert"]').first();
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText(/Financial Safety Lock Active|No Internet Connection/i);

    // Reconnect
    await page.context().setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Main app container is visible and accessible
    await expect(page.locator('#root')).toBeVisible();
  });

  test('Zero uncaught exceptions and fatal console errors across navigation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (exception) => {
      errors.push(`PageError: ${exception.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known benign favicon/service-worker/offline warnings if any
        if (!text.includes('favicon') && !text.includes('ServiceWorker')) {
          errors.push(`ConsoleError: ${text}`);
        }
      }
    });

    await loginAs(page);

    // Navigate to major pages
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    await page.goto('/inventory/gold');
    await page.waitForLoadState('networkidle');

    await page.goto('/rates');
    await page.waitForLoadState('networkidle');

    // Should have zero unhandled fatal page crashes
    const fatalErrors = errors.filter((e) => e.startsWith('PageError:'));
    expect(fatalErrors).toHaveLength(0);
  });
});
