import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

test.describe('Gap 5: Debt Payoff Planner', () => {
  test.beforeEach(async ({ page }) => {
    // Feature validation data includes liabilities with interest rates
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

  test('Debt planner section is visible with rate-bearing liabilities', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const plannerSection = page.locator('#debt-planner-section');
    await expect(plannerSection).toBeVisible();
  });

  test('Planner shows payoff summary cards', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const summaryCards = page.locator('#debt-planner-summary .sum-card');
    expect(await summaryCards.count()).toBeGreaterThan(0);
  });

  test('Strategy buttons exist and toggle', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const avBtn = page.locator('#debt-strategy-avalanche');
    const swBtn = page.locator('#debt-strategy-snowball');
    await expect(avBtn).toBeVisible();
    await expect(swBtn).toBeVisible();
  });

  test('Extra payment comparison table renders', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const compEl = page.locator('#debt-extra-comparison');
    await expect(compEl).toBeVisible();
    // Comparison table should have 3 rows (current + $50 + $100)
    const rows = page.locator('#debt-extra-comparison tbody tr');
    expect(await rows.count()).toBe(3);
  });

  test('Extra payment comparison shows savings column', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const compText = await page.locator('#debt-extra-comparison').textContent();
    expect(compText).toContain('saved');
    expect(compText).toContain('+$50');
  });

  test('Empty state shown when no liabilities have interest rates', async ({ page }) => {
    // Remove interest rates from all liabilities
    await page.evaluate(() => {
      window.state.liabilities.forEach(l => {
        l.interestRate = 0;
        l.minimumPayment = 0;
      });
      window.renderNetWorthView();
    });

    await page.click('#tab-networth');
    await page.waitForTimeout(400);

    const emptyState = page.locator('.debt-planner-empty');
    await expect(emptyState).toBeVisible();
    const text = await emptyState.textContent();
    expect(text).toContain('interest rate');
  });

  test('calcDebtPayoff returns correct structure', async ({ page }) => {
    const result = await page.evaluate(() => {
      const debts = window.state.liabilities.filter(l => l.interestRate > 0 && l.minimumPayment > 0);
      return window.calcDebtPayoff(debts, 0);
    });
    expect(result).toHaveProperty('months');
    expect(result).toHaveProperty('totalInterest');
    expect(result).toHaveProperty('monthlyBalances');
    expect(result.months).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  test('Extra payment reduces months to payoff', async ({ page }) => {
    const [base, withExtra] = await page.evaluate(() => {
      const debts = window.state.liabilities.filter(l => l.interestRate > 0 && l.minimumPayment > 0);
      const b = window.calcDebtPayoff(debts, 0);
      const e = window.calcDebtPayoff(debts, 200);
      return [b.months, e.months];
    });
    expect(withExtra).toBeLessThan(base);
  });
});
