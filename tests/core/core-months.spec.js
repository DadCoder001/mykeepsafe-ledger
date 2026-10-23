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

test.describe('Core: Month Management', () => {
  test.beforeEach(async ({ page }) => {
    await loadCore(page);
  });

  test('initial state — two months loaded in sidebar', async ({ page }) => {
    await page.click('#tab-month');
    const count = await page.locator('.month-btn').count();
    expect(count).toBe(2);
  });

  test('clicking month button navigates to that month', async ({ page }) => {
    await page.click('#tab-month');
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(300);
    const title = await page.locator('#month-title').textContent();
    expect(title).toBe('2026-04');
  });

  test('active month starts as most recent (2026-05)', async ({ page }) => {
    await page.click('#tab-month');
    const title = await page.locator('#month-title').textContent();
    expect(title).toBe('2026-05');
  });

  test('create new month via month-input — added to state order', async ({ page }) => {
    await page.fill('#month-input', '2026-06');
    await page.click('button[data-action="loadMonth()"]');
    await page.waitForTimeout(300);
    const order = await page.evaluate(() => window.state.order);
    expect(order).toContain('2026-06');
    expect(order.length).toBe(3);
  });

  test('new month starts with empty incomes and expenses', async ({ page }) => {
    await page.fill('#month-input', '2026-07');
    await page.click('button[data-action="loadMonth()"]');
    await page.waitForTimeout(300);
    const newMonth = await page.evaluate(() => window.state.months['2026-07']);
    expect(newMonth.incomes.length).toBe(0);
    expect(newMonth.expenses.length).toBe(0);
    expect(newMonth.balance).toBe(0);
  });

  test('set budget — saves correct value to state', async ({ page }) => {
    await page.click('#tab-month');
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(200);
    await page.fill('#budget-input', '5000');
    await page.click('button[data-action="setBudget()"]');
    await page.waitForTimeout(200);
    const budget = await page.evaluate(() => window.state.months['2026-04'].budget);
    expect(budget).toBe(5000);
  });

  test('budget appears in month summary card after save', async ({ page }) => {
    await page.click('#tab-month');
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(200);
    await page.fill('#budget-input', '6000');
    await page.click('button[data-action="setBudget()"]');
    await page.waitForTimeout(300);
    // Budget card should show 6,000
    const budgetCard = page.locator('.sum-card').filter({ hasText: 'Budget' });
    await expect(budgetCard).toContainText('6,000');
  });
});
