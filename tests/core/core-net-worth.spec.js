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

test.describe('Core: Net Worth', () => {
  test.beforeEach(async ({ page }) => {
    await loadCore(page);
    await page.click('#tab-networth');
    await page.waitForTimeout(200);
  });

  test('net worth view renders when clicking net worth tab', async ({ page }) => {
    const display = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('networth-view')).display;
    });
    expect(display).not.toBe('none');
  });

  test('empty state — zero assets and liabilities', async ({ page }) => {
    const result = await page.evaluate(() => window.calcNetWorth());
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
    expect(result.netWorth).toBe(0);
  });

  test('add asset — appears in assets-tbody', async ({ page }) => {
    await page.fill('#asset-name', 'Savings Account');
    await page.fill('#asset-value', '5000');
    await page.selectOption('#asset-category', 'cash');
    await page.click('button[data-action="addAsset()"]');
    await page.waitForTimeout(300);
    const tbody = page.locator('#assets-tbody');
    await expect(tbody).toContainText('Savings Account');
    await expect(tbody).toContainText('5,000');
  });

  test('add asset — net worth increases correctly', async ({ page }) => {
    await page.fill('#asset-name', 'Investments');
    await page.fill('#asset-value', '12000');
    await page.selectOption('#asset-category', 'investment');
    await page.click('button[data-action="addAsset()"]');
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => window.calcNetWorth());
    expect(result.totalAssets).toBe(12000);
    expect(result.netWorth).toBe(12000);
  });

  test('add liability — appears in liabilities-tbody', async ({ page }) => {
    await page.fill('#liability-name', 'Car Loan');
    await page.fill('#liability-value', '8000');
    await page.selectOption('#liability-category', 'loan');
    await page.click('button[data-action="addLiability()"]');
    await page.waitForTimeout(300);
    const tbody = page.locator('#liabilities-tbody');
    await expect(tbody).toContainText('Car Loan');
    await expect(tbody).toContainText('8,000');
  });

  test('net worth = assets minus liabilities', async ({ page }) => {
    // Add asset
    await page.fill('#asset-name', 'Home');
    await page.fill('#asset-value', '300000');
    await page.selectOption('#asset-category', 'property');
    await page.click('button[data-action="addAsset()"]');
    await page.waitForTimeout(200);
    // Add liability
    await page.fill('#liability-name', 'Mortgage');
    await page.fill('#liability-value', '250000');
    await page.selectOption('#liability-category', 'mortgage');
    await page.click('button[data-action="addLiability()"]');
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => window.calcNetWorth());
    expect(result.netWorth).toBe(50000);
  });

  test('delete asset — net worth updates', async ({ page }) => {
    await page.fill('#asset-name', 'Temp Asset');
    await page.fill('#asset-value', '1000');
    await page.selectOption('#asset-category', 'other');
    await page.click('button[data-action="addAsset()"]');
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.calcNetWorth().totalAssets);
    expect(before).toBe(1000);
    // Delete the asset
    await page.evaluate(() => {
      const id = window.state.assets[0].id;
      window.deleteAsset(id);
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.calcNetWorth().totalAssets);
    expect(after).toBe(0);
  });
});
