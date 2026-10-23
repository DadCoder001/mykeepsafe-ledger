import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

test.describe('Gap 4: Notification Center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/load-feature-validation.html`);
    await page.waitForSelector('.status.success', { timeout: 5000 });
    await page.goto(`${BASE}/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 10000 });
    await page.evaluate(() => {
      const m = document.getElementById('file-setup-modal');
      if (m) m.style.display = 'none';
      // Clear any existing notifications
      window.state.notifications = [];
      window.saveData();
      window.renderNotificationBell();
    });
  });

  test('Notification bell button renders in sidebar', async ({ page }) => {
    const bell = page.locator('#notif-bell-btn');
    await expect(bell).toBeVisible();
  });

  test('Bell badge hidden when no unread notifications', async ({ page }) => {
    const badge = page.locator('#notif-bell-badge');
    const isVisible = await badge.evaluate(el => el.classList.contains('visible'));
    expect(isVisible).toBe(false);
  });

  test('pushNotification adds to state and shows badge', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('budget_warn', 'Budget at 85% — 2026-01', '$425 of $500 budget used.');
    });
    const badge = page.locator('#notif-bell-badge');
    await expect(badge).toHaveClass(/visible/);
    expect(await badge.textContent()).toBe('1');
  });

  test('Opening notification panel shows notifications', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('budget_warn', 'Budget Warning', 'You have used 85% of your budget.');
    });
    await page.click('#notif-bell-btn');
    const panel = page.locator('#notif-panel-overlay');
    await expect(panel).toHaveClass(/open/);
    const items = page.locator('.notif-item');
    expect(await items.count()).toBeGreaterThanOrEqual(1);
  });

  test('Notification panel shows title and body', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('budget_alert', 'Budget exceeded — 2026-01', 'You spent $600 of $500 budget.');
    });
    await page.click('#notif-bell-btn');
    await page.waitForTimeout(200);
    const itemText = await page.locator('.notif-item').first().textContent();
    expect(itemText).toContain('Budget exceeded');
    expect(itemText).toContain('$600');
  });

  test('Mark all read clears badge', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('bill_due', 'Rent due soon', '$1,500 due on day 1.');
      window.pushNotification('info', 'Welcome', 'Hello!');
    });
    await page.click('#notif-bell-btn');
    await page.waitForTimeout(200);
    // Panel auto-marks as read after 800ms — or click the button directly
    await page.locator('.notif-read-all-btn').click();
    await page.waitForTimeout(200);
    const badge = page.locator('#notif-bell-badge');
    const isVisible = await badge.evaluate(el => el.classList.contains('visible'));
    expect(isVisible).toBe(false);
  });

  test('Dismiss button removes a notification', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('bill_due', 'Internet due soon', '$75 due on day 5.');
    });
    await page.click('#notif-bell-btn');
    await page.waitForTimeout(200);
    const before = await page.locator('.notif-item').count();
    expect(before).toBeGreaterThanOrEqual(1);
    await page.locator('.notif-item').first().hover();
    await page.locator('.notif-item-dismiss').first().click();
    await page.waitForTimeout(200);
    const after = await page.locator('.notif-item').count();
    expect(after).toBe(before - 1);
  });

  test('Close button hides notification panel', async ({ page }) => {
    await page.click('#notif-bell-btn');
    await expect(page.locator('#notif-panel-overlay')).toHaveClass(/open/);
    await page.locator('.notif-close-btn').click();
    await expect(page.locator('#notif-panel-overlay')).not.toHaveClass(/open/);
  });

  test('checkBudgetNotifications triggers at 80%', async ({ page }) => {
    // Set up month with budget and expenses at 80%
    await page.evaluate(() => {
      window.state.months['2026-01'].budget = 500;
      // Add expense to bring total to ~85% of 500 = $425
      const currentExpenses = window.state.months['2026-01'].expenses.reduce((s, e) => s + e.amount, 0);
      // Push a large expense to cross 80%
      window.state.months['2026-01'].expenses.push({
        amount: Math.max(0, 500 * 0.85 - currentExpenses),
        desc: 'Test Expense', cat: 'Other', date: new Date().toISOString()
      });
      window.checkBudgetNotifications('2026-01');
    });
    const badge = page.locator('#notif-bell-badge');
    await expect(badge).toHaveClass(/visible/);
    const notifTitles = await page.evaluate(() =>
      window.state.notifications.map(n => n.title)
    );
    expect(notifTitles.some(t => t.includes('Budget'))).toBe(true);
  });

  test('pushNotification deduplicates within 24h', async ({ page }) => {
    await page.evaluate(() => {
      window.pushNotification('budget_warn', 'Budget at 85% — 2026-01', 'First push');
      window.pushNotification('budget_warn', 'Budget at 85% — 2026-01', 'Duplicate push');
    });
    const count = await page.evaluate(() =>
      window.state.notifications.filter(n => n.title === 'Budget at 85% — 2026-01').length
    );
    expect(count).toBe(1);
  });

  test('Empty state shown when no notifications', async ({ page }) => {
    await page.click('#notif-bell-btn');
    await page.waitForTimeout(200);
    const empty = page.locator('.notif-empty');
    await expect(empty).toBeVisible();
  });
});
