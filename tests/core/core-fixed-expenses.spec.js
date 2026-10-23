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

async function addInternetFixedExpense(page) {
  await page.fill('#fe-amount', '80');
  await page.fill('#fe-desc', 'Internet');
  await page.fill('#fe-cat', 'Utilities');
  await page.selectOption('#fe-frequency', 'monthly');
  await page.click('button[data-action="addFixedExpense()"]');
  await page.waitForTimeout(400);
}

test.describe('Core: Fixed Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await loadCore(page);
    await page.click('#tab-fixed');
    await page.waitForTimeout(200);
  });

  test('fixed expenses view renders when clicking fixed tab', async ({ page }) => {
    const display = await page.evaluate(() => {
      return getComputedStyle(document.getElementById('fixed-view')).display;
    });
    expect(display).not.toBe('none');
  });

  test('add fixed expense — appears in fe-tbody', async ({ page }) => {
    await addInternetFixedExpense(page);
    const tbody = page.locator('#fe-tbody');
    await expect(tbody).toContainText('Internet');
    await expect(tbody).toContainText('80');
  });

  test('add fixed expense — auto-applied to existing months', async ({ page }) => {
    await addInternetFixedExpense(page);
    const aprilIds = await page.evaluate(() => window.state.months['2026-04'].fixedExpenseIds);
    const mayIds = await page.evaluate(() => window.state.months['2026-05'].fixedExpenseIds);
    expect(aprilIds.length).toBeGreaterThanOrEqual(1);
    expect(mayIds.length).toBeGreaterThanOrEqual(1);
  });

  test('fixed expense auto-expense appears in month expense list', async ({ page }) => {
    await addInternetFixedExpense(page);
    await page.click('#tab-month');
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(300);
    const txList = page.locator('#tx-list');
    await expect(txList).toContainText('Internet');
  });

  test('new month created after fixed expense gets it applied', async ({ page }) => {
    await addInternetFixedExpense(page);
    // Create month via window function (month-input is in the month-tab sidebar section)
    await page.evaluate(() => {
      window.createMonth('2026-06');
    });
    await page.waitForTimeout(400);
    const newIds = await page.evaluate(() => window.state.months['2026-06'].fixedExpenseIds);
    expect(newIds.length).toBeGreaterThanOrEqual(1);
  });

  test('fixed expenses summary cards render', async ({ page }) => {
    await addInternetFixedExpense(page);
    // The fixed view shows summary cards including monthly fixed cost
    const cards = await page.evaluate(() => {
      const sumCells = document.querySelectorAll('.sum-card .sum-label');
      return Array.from(sumCells).map(el => el.textContent);
    });
    const hasFixedCost = cards.some(label => label.includes('Monthly') || label.includes('Fixed'));
    expect(hasFixedCost).toBe(true);
  });

  test('upcoming bills section appears after fixed expense added', async ({ page }) => {
    await addInternetFixedExpense(page);
    const display = await page.evaluate(() => {
      return document.getElementById('upcoming-bills-section').style.display;
    });
    expect(display).not.toBe('none');
    const cards = await page.locator('.ub-card').count();
    expect(cards).toBeGreaterThanOrEqual(1);
  });
});
