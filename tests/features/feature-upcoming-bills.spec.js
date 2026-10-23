import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

test.describe('Gap 6: Upcoming Bills', () => {
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

  test('Upcoming bills section renders in Fixed tab', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);

    const section = page.locator('#upcoming-bills-section');
    await expect(section).toBeVisible();
    // Should contain bill cards for each fixed expense
    const cards = page.locator('.ub-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  test('Upcoming bills shows all fixed expenses as cards', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);

    const section = page.locator('#upcoming-bills-section');
    await expect(section).toBeVisible();

    // Feature validation data has 4 fixed expenses
    const cards = page.locator('.ub-card');
    expect(await cards.count()).toBe(4);
  });

  test('Bill cards show expense name and amount', async ({ page }) => {
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);

    const cardTexts = await page.locator('.ub-card').allTextContents();
    // Rent card should show "Rent" and "1,500"
    const rentCard = cardTexts.find(t => t.includes('Rent'));
    expect(rentCard).toBeTruthy();
    expect(rentCard).toContain('1,500');
  });

  test('Applied bills show Applied badge', async ({ page }) => {
    // Navigate to month 2026-03 first to set activeMonth
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    // Click month button for 2026-03
    await page.locator('.month-btn').filter({ hasText: '2026-03' }).click();
    await page.waitForTimeout(200);

    // Now switch to Fixed tab
    await page.click('#tab-fixed');
    await page.waitForTimeout(300);

    // 2026-03 has fv-rent, fv-internet, fv-gym applied
    const appliedBadges = page.locator('.ub-badge.applied');
    expect(await appliedBadges.count()).toBeGreaterThanOrEqual(3);
  });

  test('Month sidebar shows bills-due-card when month is active', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    await page.locator('.month-btn').filter({ hasText: '2026-03' }).click();
    await page.waitForTimeout(300);

    const billsCard = page.locator('#bills-due-card');
    await expect(billsCard).toBeVisible();
    // Shows bill count or "All applied" message
    const text = await billsCard.textContent();
    expect(text).toMatch(/bill|applied/i);
  });

  test('Bills header shows month key', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    await page.locator('.month-btn').filter({ hasText: '2026-03' }).click();
    await page.waitForTimeout(200);

    await page.click('#tab-fixed');
    await page.waitForTimeout(300);

    const header = await page.locator('.upcoming-bills-header').textContent();
    expect(header).toContain('2026-03');
  });

  test('getUpcomingBills returns correct data structure', async ({ page }) => {
    const bills = await page.evaluate(() => window.getUpcomingBills('2026-03'));
    expect(bills.length).toBe(4);
    bills.forEach(b => {
      expect(b).toHaveProperty('desc');
      expect(b).toHaveProperty('amount');
      expect(b).toHaveProperty('applied');
      expect(b).toHaveProperty('dueDay');
    });
    // Verify applied status for month with known fixedExpenseIds
    const rent = bills.find(b => b.desc === 'Rent');
    expect(rent.applied).toBe(true);
    const phone = bills.find(b => b.desc === 'Phone Bill');
    expect(phone.applied).toBe(false);
  });
});
