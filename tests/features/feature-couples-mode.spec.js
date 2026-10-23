import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

test.describe('Gap 7: Couples / Member Tagging', () => {
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

  test('householdMembers loaded from fixture', async ({ page }) => {
    const members = await page.evaluate(() => window.state.settings.householdMembers);
    expect(members).toContain('Alex');
    expect(members).toContain('Jordan');
  });

  test('Member filter row visible in Month tab when members exist', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(300);
    const filterRow = page.locator('#member-filter-row');
    await expect(filterRow).toBeVisible();
    // Should contain "Alex" and "Jordan" options
    const filterText = await filterRow.textContent();
    expect(filterText).toContain('Alex');
    expect(filterText).toContain('Jordan');
  });

  test('Member filter hides when no household members', async ({ page }) => {
    await page.evaluate(() => {
      window.state.settings.householdMembers = [];
      window.renderMemberFilter();
    });
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    const filterRow = page.locator('#member-filter-row');
    // Should be hidden when no members
    const display = await filterRow.evaluate(el => el.style.display);
    expect(display).toBe('none');
  });

  test('Member selects appear in Add Income/Expense forms', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(300);
    // renderMemberFilter() sets display:'block' on these selects — check the inline style
    // (parents may be collapsed, so toBeVisible() would fail; the style property is the right signal)
    const incDisplay = await page.locator('#income-member').evaluate(el => el.style.display);
    const expDisplay = await page.locator('#expense-member').evaluate(el => el.style.display);
    expect(incDisplay).toBe('block');
    expect(expDisplay).toBe('block');
  });

  test('Member filter filters transactions to show only that member', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    await page.locator('.month-btn').filter({ hasText: '2026-03' }).click();
    await page.waitForTimeout(300);

    // Filter to Alex
    await page.evaluate(() => window.setMemberFilter('Alex'));
    await page.waitForTimeout(200);

    const txRows = await page.locator('.tx-row').allTextContents();
    // All visible rows should either have Alex member or we're filtering correctly
    // At minimum, Jordan's transaction should not be visible
    const jordanVisible = txRows.some(t => t.includes('Jordan Coffee'));
    expect(jordanVisible).toBe(false);
  });

  test('Member badge shown on tagged transactions', async ({ page }) => {
    await page.click('#tab-month');
    await page.waitForTimeout(200);
    await page.locator('.month-btn').filter({ hasText: '2026-03' }).click();
    await page.waitForTimeout(300);

    // Clear member filter to see all
    await page.evaluate(() => window.setMemberFilter(null));
    await page.waitForTimeout(200);

    const memberBadges = page.locator('.tx-member-badge');
    expect(await memberBadges.count()).toBeGreaterThanOrEqual(2);
    const badgeTexts = await memberBadges.allTextContents();
    expect(badgeTexts).toContain('Alex');
    expect(badgeTexts).toContain('Jordan');
  });

  test('Household members section renders in Profile', async ({ page }) => {
    await page.evaluate(() => {
      const m = document.getElementById('profile-btn');
      if (m) m.click();
    });
    await page.waitForTimeout(300);

    const body = page.locator('#household-members-body');
    await expect(body).toBeVisible();
    const text = await body.textContent();
    expect(text).toContain('Alex');
    expect(text).toContain('Jordan');
  });

  test('addHouseholdMember adds to state', async ({ page }) => {
    const before = await page.evaluate(() => window.state.settings.householdMembers.length);
    await page.evaluate(() => window.addHouseholdMember('Casey'));
    const after = await page.evaluate(() => window.state.settings.householdMembers);
    expect(after).toContain('Casey');
    expect(after.length).toBe(before + 1);
  });

  test('removeHouseholdMember removes from state', async ({ page }) => {
    await page.evaluate(() => window.removeHouseholdMember('Jordan'));
    const members = await page.evaluate(() => window.state.settings.householdMembers);
    expect(members).not.toContain('Jordan');
  });

  test('setMemberFilter updates activeMemberFilter', async ({ page }) => {
    await page.evaluate(() => window.setMemberFilter('Alex'));
    const filter = await page.evaluate(() => window.activeMemberFilter);
    expect(filter).toBe('Alex');
    await page.evaluate(() => window.setMemberFilter(''));
    const cleared = await page.evaluate(() => window.activeMemberFilter);
    expect(cleared).toBeNull();
  });
});
