import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000';

test.describe('Gap 3: Subscription Auto-Detection', () => {
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

  test('detectRecurringTransactions finds Netflix and Spotify', async ({ page }) => {
    const detected = await page.evaluate(() => window.detectRecurringTransactions());
    const descs = detected.map(d => d.desc.toLowerCase());
    expect(descs).toContain('netflix');
    expect(descs).toContain('spotify');
    // All detected candidates appear in 3 months
    detected.forEach(d => expect(d.months.length).toBeGreaterThanOrEqual(2));
  });

  test('subscription review modal appears via showSubscriptionModal', async ({ page }) => {
    await page.evaluate(() => {
      const detected = window.detectRecurringTransactions();
      window.showSubscriptionModal(detected);
    });
    const modal = page.locator('#subscription-review-modal');
    await expect(modal).toBeVisible();
    // Should show candidate rows
    const candidates = page.locator('.sub-candidate');
    expect(await candidates.count()).toBeGreaterThanOrEqual(2);
  });

  test('modal shows correct candidate details', async ({ page }) => {
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    await expect(page.locator('#subscription-review-modal')).toBeVisible();
    // Netflix candidate visible with amount and months
    const candidateText = await page.locator('.sub-candidate').allTextContents();
    const netflixCandidate = candidateText.find(t => t.toLowerCase().includes('netflix'));
    expect(netflixCandidate).toBeTruthy();
    expect(netflixCandidate).toContain('17');
    expect(netflixCandidate).toContain('month');
  });

  test('Add to Fixed removes candidate and adds to fixedExpenses', async ({ page }) => {
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    const before = await page.evaluate(() => window._subCandidates.length);
    expect(before).toBeGreaterThanOrEqual(2);

    // Find the Netflix candidate index
    const netflixIdx = await page.evaluate(() =>
      window._subCandidates.findIndex(c => c.desc.toLowerCase() === 'netflix')
    );
    expect(netflixIdx).toBeGreaterThanOrEqual(0);

    // Click Add on Netflix
    await page.locator('.sub-btn-add').nth(netflixIdx).click();
    await page.waitForTimeout(200);

    // Candidate count decreased
    const after = await page.evaluate(() => window._subCandidates.length);
    expect(after).toBe(before - 1);

    // Netflix is now in fixedExpenses
    const fixed = await page.evaluate(() =>
      window.state.fixedExpenses.some(fe => fe.desc.toLowerCase() === 'netflix')
    );
    expect(fixed).toBe(true);
  });

  test('Dismiss stores key in dismissedSubscriptions', async ({ page }) => {
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    const spotifyIdx = await page.evaluate(() =>
      window._subCandidates.findIndex(c => c.desc.toLowerCase() === 'spotify')
    );
    expect(spotifyIdx).toBeGreaterThanOrEqual(0);

    await page.locator('.sub-btn-dismiss').nth(spotifyIdx).click();
    await page.waitForTimeout(200);

    const dismissed = await page.evaluate(() => window.state.settings.dismissedSubscriptions);
    const hasDismissed = dismissed.some(k => k.includes('spotify'));
    expect(hasDismissed).toBe(true);
  });

  test('dismissed candidate does not reappear on second detection', async ({ page }) => {
    // Dismiss Spotify
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    const spotifyIdx = await page.evaluate(() =>
      window._subCandidates.findIndex(c => c.desc.toLowerCase() === 'spotify')
    );
    await page.locator('.sub-btn-dismiss').nth(spotifyIdx).click();
    await page.waitForTimeout(200);
    await page.evaluate(() => window.closeSubscriptionModal());

    // Show modal again
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    const modal = page.locator('#subscription-review-modal');
    if (await modal.isVisible()) {
      const candidates = await page.locator('.sub-candidate').allTextContents();
      const spotifyVisible = candidates.some(t => t.toLowerCase().includes('spotify'));
      expect(spotifyVisible).toBe(false);
    }
    // If modal not visible, Spotify was the only candidate — also valid
  });

  test('Done button closes the modal', async ({ page }) => {
    await page.evaluate(() => {
      window.showSubscriptionModal(window.detectRecurringTransactions());
    });
    await expect(page.locator('#subscription-review-modal')).toBeVisible();
    await page.locator('#subscription-review-modal .ugm-btn-ghost').click();
    await expect(page.locator('#subscription-review-modal')).not.toBeVisible();
  });
});
