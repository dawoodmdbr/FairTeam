import { test, expect } from '@playwright/test';

test.describe('Fair Team Matcher Smoke Tests', () => {
  test('FEAT-12: Public "How This Works" page is accessible without authentication', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.locator('h1')).toContainText('How Fair Team Matcher Works');
    await expect(page.getByText('No Randomness')).toBeVisible();
    await expect(page.getByText('Maximin Fairness Objective')).toBeVisible();
  });

  test('FEAT-11: Dark mode toggle switches theme and persists preference', async ({ page }) => {
    await page.goto('/how-it-works');

    const html = page.locator('html');
    const toggleBtn = page.getByRole('button', { name: /toggle theme/i });

    // Initial state check
    const initialIsDark = await html.evaluate((el) => el.classList.contains('dark'));

    // Toggle theme
    await toggleBtn.click();
    const afterFirstToggle = await html.evaluate((el) => el.classList.contains('dark'));
    expect(afterFirstToggle).toBe(!initialIsDark);

    // Reload page to verify persistence in localStorage
    await page.reload();
    const afterReload = await html.evaluate((el) => el.classList.contains('dark'));
    expect(afterReload).toBe(!initialIsDark);
  });

  test('Navigation to Organizer Login and Dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Organizer Login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Organizer Dashboard');
    await expect(page.getByRole('link', { name: /create new session/i })).toBeVisible();
  });
});
