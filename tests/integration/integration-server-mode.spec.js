import { test, expect } from '@playwright/test';

// `npm start`: the built app served by server/index.mjs, saving to a JSON file.
const BASE = 'http://localhost:8200';

async function open(page) {
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 15000 });
}

test.describe('Server mode (npm start)', () => {
  test('saves to the data file and restores it after browser storage is cleared', async ({ page, request }) => {
    await open(page);
    expect(await page.evaluate(() => window._ksServerMode)).toBe(true);

    await page.evaluate(() => {
      window.closeOnboardingModal?.();
      const k = window.state.order[0];
      window.state.months[k].expenses.push({ amount: 42.5, desc: 'Server mode coffee', cat: 'Groceries', date: new Date().toISOString(), tags: [] });
      window.saveData();
    });
    await expect.poll(async () => (await (await request.get(`${BASE}/api/data`)).text()), { timeout: 5000 })
      .toContain('Server mode coffee');

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window._legacyInitDone === true, { timeout: 15000 });
    expect(await page.evaluate(() => JSON.stringify(window.state))).toContain('Server mode coffee');
    await expect(page.locator('#onboarding-modal')).toBeHidden();
    await expect(page.locator('#file-sync-status')).toContainText('on this computer');
  });

  test('serves a strict Content Security Policy', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    const csp = res.headers()['content-security-policy'];
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  test('rejects invalid data and cross-site requests', async ({ request }) => {
    const bad = await request.put(`${BASE}/api/data`, { data: { hello: 'world' } });
    expect(bad.status()).toBe(400);
    const cross = await request.put(`${BASE}/api/data`, { data: { months: {}, order: [] }, headers: { Origin: 'https://evil.example' } });
    expect(cross.status()).toBe(403);
  });

  test('the model proxy only reaches this computer and reports a missing server clearly', async ({ request }) => {
    const res = await request.get(`${BASE}/api/llm/1/api/tags`);
    expect(res.status()).toBe(502);
    expect((await res.json()).error).toContain('not reachable');
  });
});
