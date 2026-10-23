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

// The add-transaction form is inside a collapsible — must be opened first
async function openAddRow(page) {
  await page.click('.add-row-toggle');
  await page.waitForTimeout(200);
}

test.describe('Core: Transactions', () => {
  test.beforeEach(async ({ page }) => {
    await loadCore(page);
    // Navigate to month view (active month will be 2026-05, the last)
    await page.click('#tab-month');
    await page.waitForTimeout(200);
  });

  test('loads core data — April has seed income and expense', async ({ page }) => {
    const incomes = await page.evaluate(() => window.state.months['2026-04'].incomes.length);
    const expenses = await page.evaluate(() => window.state.months['2026-04'].expenses.length);
    expect(incomes).toBe(1);
    expect(expenses).toBe(1);
  });

  test('balance calculation — income minus expenses equals balance', async ({ page }) => {
    const balance = await page.evaluate(() => window.state.months['2026-04'].balance);
    expect(balance).toBe(3800);
  });

  test('add income — appears in state and updates balance', async ({ page }) => {
    // Active month is 2026-05 (empty). Open collapsible and add income.
    await openAddRow(page);
    await page.fill('#income-amount', '1500');
    await page.fill('#income-desc', 'Test Salary');
    await page.click('button[data-action="addIncome()"]');
    await page.waitForTimeout(300);
    const incomes = await page.evaluate(() => window.state.months['2026-05'].incomes.length);
    expect(incomes).toBe(1);
    const balance = await page.evaluate(() => window.state.months['2026-05'].balance);
    expect(balance).toBe(1500);
  });

  test('add expense — appears in state with correct amount and category', async ({ page }) => {
    await openAddRow(page);
    await page.fill('#expense-amount', '75');
    await page.fill('#expense-desc', 'Test Dining');
    await page.fill('#expense-cat', 'Dining Out');
    await page.click('button[data-action="addExpense()"]');
    await page.waitForTimeout(300);
    const expenses = await page.evaluate(() => window.state.months['2026-05'].expenses);
    expect(expenses.length).toBe(1);
    expect(expenses[0].amount).toBe(75);
    expect(expenses[0].cat).toBe('Dining Out');
  });

  test('add expense without category — does not add to state', async ({ page }) => {
    await openAddRow(page);
    const before = await page.evaluate(() => window.state.months['2026-05'].expenses.length);
    await page.fill('#expense-amount', '50');
    await page.fill('#expense-desc', 'No Cat Test');
    // leave expense-cat empty
    await page.click('button[data-action="addExpense()"]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.state.months['2026-05'].expenses.length);
    expect(after).toBe(before);
  });

  test('delete expense via tx-del button — removed from state', async ({ page }) => {
    // Navigate to 2026-04 which has 1 income + 1 expense
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.state.months['2026-04'].expenses.length);
    expect(before).toBe(1);
    // Transactions are ordered: incomes first, then expenses.
    // Income tx-del only calls stopPropagation (no delete).
    // Expense tx-del calls deleteExpense — it is the last .tx-del in this month.
    const expenseDelBtn = page.locator('.tx-del').last();
    await expenseDelBtn.click();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.state.months['2026-04'].expenses.length);
    expect(after).toBe(0);
  });

  test('delete income via slide panel — removed from state', async ({ page }) => {
    await page.click('.month-btn', { hasText: '2026-04' });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.state.months['2026-04'].incomes.length);
    expect(before).toBe(1);
    // Income rows open the slide panel on click — use it to delete
    const incomeRow = page.locator('.tx-row').first();
    await incomeRow.click();
    await page.waitForSelector('#tx-slide-overlay', { state: 'visible', timeout: 3000 });
    await page.click('#tsp-delete-btn');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.state.months['2026-04'].incomes.length);
    expect(after).toBe(0);
  });

  test('saveData persists state to localStorage', async ({ page }) => {
    await page.evaluate(() => {
      window.state.months['2026-05'].budget = 999;
      window.saveData();
    });
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('myledger_data');
      return JSON.parse(raw).months['2026-05'].budget;
    });
    expect(saved).toBe(999);
  });
});
