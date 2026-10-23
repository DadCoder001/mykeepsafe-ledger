import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

async function loadCore(page) {
  await page.goto(`${BASE}/load-core.html`);
  await page.waitForSelector('.status.success', { timeout: 5000 });
  await page.goto(`${BASE}/index.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 10000 });
  await page.evaluate(() => {
    const m = document.getElementById('file-setup-modal');
    if (m) m.style.display = 'none';
  });
}

test.describe('Core: UI Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loadCore(page);
  });

  test('all main tab buttons exist in sidebar', async ({ page }) => {
    await expect(page.locator('#tab-month')).toBeVisible();
    await expect(page.locator('#tab-overview')).toBeVisible();
    await expect(page.locator('#tab-fixed')).toBeVisible();
    await expect(page.locator('#tab-networth')).toBeVisible();
    await expect(page.locator('#tab-accounts')).toBeVisible();
  });

  test('sidebar contains app name KeepSafe', async ({ page }) => {
    const logo = page.locator('.sb-logo');
    await expect(logo).toContainText('KeepSafe');
  });

  test('month tab activates month view', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('month-view')).display);
    expect(display).not.toBe('none');
    await expect(page.locator('#tab-month')).toHaveClass(/active/);
  });

  test('overview tab renders summary cards', async ({ page }) => {
    await page.click('#tab-overview');
    await page.waitForTimeout(300);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('overview-view')).display);
    expect(display).not.toBe('none');
    const cards = await page.locator('#overview-summary .sum-card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('fixed tab activates fixed expenses view', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(200);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('fixed-view')).display);
    expect(display).not.toBe('none');
  });

  test('net worth tab activates net worth view', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(200);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('networth-view')).display);
    expect(display).not.toBe('none');
  });

  test('accounts tab activates accounts view', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(100);
    await page.click('#tab-accounts');
    await page.waitForTimeout(200);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('accounts-view')).display);
    expect(display).not.toBe('none');
  });

  test('profile button opens profile view', async ({ page }) => {
    await page.click('#profile-btn');
    await page.waitForTimeout(300);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('profile-view')).display);
    expect(display).not.toBe('none');
  });

  test('profile view shows household members section', async ({ page }) => {
    await page.click('#profile-btn');
    await page.waitForTimeout(300);
    const body = page.locator('#household-members-body');
    await expect(body).toBeVisible();
  });
});
