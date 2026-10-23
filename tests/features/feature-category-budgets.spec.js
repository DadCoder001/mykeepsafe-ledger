import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

// Gap 1+2: Per-category budgets + rollover carry-forward
// These tests are stubs — they will become active when Gap 1+2 is implemented.
// Expected API: setCategoryBudget(monthKey, category, amount), state.months[k].categoryBudgets = {}
// Expected UI: category budget form in month/fixed view, progress bars per category

test.describe('Gap 1+2: Category Budgets + Rollover (stubs)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/load-feature-validation.html`);
    await page.waitForSelector('.status.success', { timeout: 5000 });
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 10000 });
    await page.evaluate(() => {
      const m = document.getElementById('file-setup-modal');
      if (m) m.style.display = 'none';
    });
  });

  test.skip('category budget form exists in month view', async ({ page }) => {
    // Expect: a form or section with id #category-budget-form or similar
    // that lets the user set a budget per category for the active month
    await page.click('#tab-month');
    const form = page.locator('#category-budget-form');
    await expect(form).toBeVisible();
  });

  test.skip('setCategoryBudget() saves amount to state.months[key].categoryBudgets', async ({ page }) => {
    // Expect: window.setCategoryBudget('2026-03', 'Groceries', 400) sets
    // state.months['2026-03'].categoryBudgets['Groceries'] === 400
    await page.evaluate(() => window.setCategoryBudget('2026-03', 'Groceries', 400));
    const budget = await page.evaluate(() => window.state.months['2026-03'].categoryBudgets?.['Groceries']);
    expect(budget).toBe(400);
  });

  test.skip('category progress bar renders when budget is set', async ({ page }) => {
    // Expect: after setCategoryBudget, a .cat-budget-bar element appears
    // for that category with a fill proportion matching spent/budget
    await page.click('#tab-month');
    await page.evaluate(() => window.setCategoryBudget('2026-03', 'Groceries', 400));
    const bar = page.locator('.cat-budget-bar').filter({ hasText: 'Groceries' });
    await expect(bar).toBeVisible();
  });

  test.skip('category budget alert notification fires when 80% spent', async ({ page }) => {
    // Expect: when expenses in a category reach 80% of the category budget,
    // a notification is pushed with type 'cat_budget_warn'
    await page.evaluate(() => {
      window.setCategoryBudget('2026-03', 'Groceries', 10); // tiny budget so it's exceeded
    });
    await page.waitForTimeout(300);
    const notif = await page.evaluate(() =>
      window.state.notifications.find(n => n.type === 'cat_budget_warn')
    );
    expect(notif).toBeTruthy();
  });

  test.skip('overview category breakdown column shows per-category spend vs budget', async ({ page }) => {
    // Expect: the overview tab shows a category breakdown table/column
    // with columns for Category, Spent, Budget, Remaining
    await page.click('#tab-overview');
    await page.waitForTimeout(300);
    const breakdown = page.locator('#overview-category-breakdown');
    await expect(breakdown).toBeVisible();
    await expect(breakdown).toContainText('Groceries');
  });

  test.skip('rollover — previous month surplus carries forward to next month budget', async ({ page }) => {
    // Expect: with budgetCarryForward = true, if April budget = $500 and spent = $300,
    // May gets $200 carry-forward added to its effective budget
    await page.evaluate(() => {
      window.state.settings.budgetCarryForward = true;
      window.state.months['2026-04'].budget = 500;
      window.toggleCarryForward && window.toggleCarryForward();
    });
    const mayCarryForward = await page.evaluate(() =>
      window.state.months['2026-05']?.carryForward ?? 0
    );
    expect(mayCarryForward).toBeGreaterThan(0);
  });

  test.skip('rollover display — effective budget card shows budget + carry-forward', async ({ page }) => {
    // Expect: when carry-forward is active, the Balance/Budget card in the month view
    // shows "Effective Budget: $X (incl. $Y carry-forward)"
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    const card = page.locator('.sum-card').filter({ hasText: 'Effective Budget' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('carry');
  });

  test.skip('rollover toggle setting saves to state.settings.budgetCarryForward', async ({ page }) => {
    // Expect: a toggle in Settings/Profile for "Budget Carry-Forward"
    // clicking it flips state.settings.budgetCarryForward
    await page.click('#profile-btn');
    await page.waitForTimeout(200);
    const toggle = page.locator('#budget-carry-forward-toggle');
    const before = await page.evaluate(() => window.state.settings.budgetCarryForward);
    await toggle.click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.state.settings.budgetCarryForward);
    expect(after).toBe(!before);
  });
});
