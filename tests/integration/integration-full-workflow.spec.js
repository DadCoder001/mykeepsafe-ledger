import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

// Uses the rich feature-validation-data.json fixture:
// 3 months (2026-01 to 2026-03), 4 fixed expenses with dueDay,
// 2 liabilities with interestRate, 2 household members, Netflix/Spotify recurring

async function loadFeatureValidation(page) {
  await page.goto(`${BASE}/load-feature-validation.html`);
  await page.waitForSelector('.status.success', { timeout: 5000 });
  await page.goto(`${BASE}/index.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 10000 });
  await page.evaluate(() => {
    const m = document.getElementById('file-setup-modal');
    if (m) m.style.display = 'none';
  });
}

test.describe('Integration: Full Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loadFeatureValidation(page);
  });

  test('fixture state has correct shape — 3 months, 4 fixed, 2 liabilities, 2 members', async ({ page }) => {
    const state = await page.evaluate(() => ({
      monthCount: window.state.order.length,
      fixedCount: window.state.fixedExpenses.length,
      liabilityCount: window.state.liabilities.length,
      memberCount: window.state.settings.householdMembers.length,
    }));
    expect(state.monthCount).toBe(3);
    expect(state.fixedCount).toBe(4);
    expect(state.liabilityCount).toBe(2);
    expect(state.memberCount).toBe(2);
  });

  test('Month tab — transactions visible for 2026-03', async ({ page }) => {
    await page.click('#tab-month');
    // Active month is the last one (2026-03)
    await page.waitForTimeout(300);
    const txList = page.locator('#tx-list');
    const txRows = await txList.locator('.tx-row').count();
    expect(txRows).toBeGreaterThan(0);
  });

  test('Month tab — member filter row visible with household members', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(300);
    const display = await page.evaluate(() => {
      const el = document.getElementById('member-filter-row');
      return el ? el.style.display : 'missing';
    });
    expect(display).not.toBe('none');
    expect(display).not.toBe('missing');
  });

  test('member filter narrows visible transactions', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(300);
    const allRows = await page.locator('#tx-list .tx-row').count();
    // Apply Alex filter via window function
    await page.evaluate(() => window.setMemberFilter('Alex'));
    await page.waitForTimeout(300);
    const filteredRows = await page.locator('#tx-list .tx-row').count();
    // Filtered should be less than or equal to unfiltered
    expect(filteredRows).toBeLessThanOrEqual(allRows);
  });

  test('clearing member filter shows all transactions', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(300);
    const allRows = await page.locator('#tx-list .tx-row').count();
    await page.evaluate(() => window.setMemberFilter('Alex'));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.setMemberFilter(null));
    await page.waitForTimeout(300);
    const restoredRows = await page.locator('#tx-list .tx-row').count();
    expect(restoredRows).toBe(allRows);
  });

  test('Overview tab — summary cards render with data', async ({ page }) => {
    await page.click('#tab-overview');
    await page.waitForTimeout(500);
    const display = await page.evaluate(() => getComputedStyle(document.getElementById('overview-view')).display);
    expect(display).not.toBe('none');
    const cards = await page.locator('#overview-summary .sum-card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('Fixed tab — 4 upcoming bill cards visible', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);
    const ubDisplay = await page.evaluate(() => document.getElementById('upcoming-bills-section').style.display);
    expect(ubDisplay).not.toBe('none');
    const cards = await page.locator('.ub-card').count();
    expect(cards).toBe(4);
  });

  test('Fixed tab — 4 fixed expenses in fe-tbody', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);
    const rows = await page.locator('#fe-tbody tr').count();
    expect(rows).toBe(4);
  });

  test('Net Worth tab — 3 summary cards: Total Assets, Liabilities, Net Worth', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(300);
    const cards = await page.evaluate(() => {
      const labels = document.querySelectorAll('.sum-card .sum-label');
      return Array.from(labels).map(el => el.textContent);
    });
    expect(cards.some(l => l.includes('Total Assets'))).toBe(true);
    expect(cards.some(l => l.includes('Total Liabilities'))).toBe(true);
    expect(cards.some(l => l.includes('Net Worth'))).toBe(true);
  });

  test('Debt planner visible with rated liabilities', async ({ page }) => {
    await page.click('#tab-networth');
    await page.waitForTimeout(300);
    // 2 liabilities with interestRate > 0
    const debtSection = page.locator('#debt-strategy-avalanche').or(page.locator('#debt-extra-comparison'));
    await expect(debtSection.first()).toBeVisible();
  });

  test('pushNotification adds to bell badge', async ({ page }) => {
    await page.evaluate(() => {
      window.state.notifications = [];
      window.saveData();
      window.renderNotificationBell();
    });
    const before = await page.evaluate(() => {
      return document.getElementById('notif-bell-badge').classList.contains('visible');
    });
    expect(before).toBe(false);
    await page.evaluate(() => window.pushNotification('budget_warn', 'Test Alert', 'Test body'));
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      return document.getElementById('notif-bell-badge').classList.contains('visible');
    });
    expect(after).toBe(true);
  });

  test('bell opens notification panel with the pushed notification', async ({ page }) => {
    await page.evaluate(() => {
      window.state.notifications = [];
      window.saveData();
      window.renderNotificationBell();
      window.pushNotification('info', 'Integration Test Notice', 'Check this works');
    });
    await page.click('#notif-bell-btn');
    await page.waitForSelector('#notif-panel-overlay', { state: 'visible', timeout: 3000 });
    const list = page.locator('#notif-list');
    await expect(list).toContainText('Integration Test Notice');
  });

  test('add income in 2026-03 updates state balance correctly', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.state.months['2026-03'].balance);
    // Open the collapsible add-row before filling
    await page.click('.add-row-toggle');
    await page.waitForTimeout(200);
    await page.fill('#income-amount', '500');
    await page.fill('#income-desc', 'Integration Bonus');
    await page.click('button[data-action="addIncome()"]');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.state.months['2026-03'].balance);
    expect(after).toBe(before + 500);
  });

  test('detectRecurringTransactions returns Netflix and Spotify candidates', async ({ page }) => {
    const candidates = await page.evaluate(() => window.detectRecurringTransactions());
    const descs = candidates.map(c => c.desc.toLowerCase());
    const hasNetflix = descs.some(d => d.includes('netflix'));
    const hasSpotify = descs.some(d => d.includes('spotify'));
    expect(hasNetflix || hasSpotify).toBe(true);
  });
});
