import { test, expect } from '@playwright/test';

// The AI CFO against a stubbed Ollama on localhost:11434. No real model is
// needed: these tests check the plumbing, the privacy guarantees and the
// conversation behaviour, not answer quality (see scripts/eval-models.mjs).

const BASE = 'http://localhost:8000';
const OLLAMA = 'http://localhost:11434';

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

async function enableAI(page) {
  await page.evaluate(() => {
    window.state.settings.aiEnabled = true;
    window.aiSetProvider('ollama');
    window.aiSetModel('qwen3.5:4b');
    window.render();
  });
}

// Fake Ollama. `replies` are returned in order; chat request bodies are recorded.
async function stubOllama(page, { running = true, installed = ['qwen3.5:4b'], replies = ['Hello from the stub.'] } = {}) {
  const chats = [];
  let replyIndex = 0;
  await page.route(`${OLLAMA}/**`, async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (!running) return route.abort('connectionrefused');
    if (path === '/api/tags') {
      return route.fulfill({ json: { models: installed.map(name => ({ name, size: 1 })) } });
    }
    if (path === '/api/pull') {
      const body = [
        { status: 'pulling manifest' },
        { status: 'downloading', total: 100, completed: 40 },
        { status: 'downloading', total: 100, completed: 100 },
        { status: 'success' },
      ].map(l => JSON.stringify(l)).join('\n') + '\n';
      installed.push(JSON.parse(req.postData()).model);
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body });
    }
    if (path === '/api/chat') {
      const payload = JSON.parse(req.postData());
      chats.push(payload);
      const text = replies[Math.min(replyIndex++, replies.length - 1)];
      if (payload.stream) {
        const chunks = text.match(/.{1,12}/gs) || [''];
        const body = chunks.map(c => JSON.stringify({ message: { role: 'assistant', content: c }, done: false })).join('\n')
          + '\n' + JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n';
        return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body });
      }
      return route.fulfill({ json: { message: { role: 'assistant', content: text }, done: true } });
    }
    return route.fulfill({ status: 404, json: { error: 'not found' } });
  });
  return chats;
}

test.describe('AI CFO (local model)', () => {
  test('old cloud/WebLLM AI settings are migrated to a local provider', async ({ page }) => {
    // core-test-data.json was saved with aiProvider "webllm" and providerKeys.
    await loadCore(page);
    const s = await page.evaluate(() => window.state.settings);
    expect(s.aiProvider).toBe('ollama');
    expect(s.aiModel).toBe('qwen3.5:4b');
    expect(s.providerKeys).toBeUndefined();
  });

  test('shows how to install Ollama when it is not running', async ({ page }) => {
    await stubOllama(page, { running: false });
    await loadCore(page);
    await enableAI(page);
    await page.click('#tab-ai');
    await expect(page.locator('#ai-view')).toContainText("Ollama isn’t running");
    await expect(page.locator('#ai-view a[href="https://ollama.com/download"]')).toBeVisible();
  });

  test('curated models can be installed through Ollama with progress', async ({ page }) => {
    await stubOllama(page, { installed: [] });
    await loadCore(page);
    await enableAI(page);
    await page.click('#tab-ai');
    const card = page.locator('.ai-model-card', { hasText: 'Llama 3.2 3B' });
    await expect(card).toContainText('Fast');
    await card.getByRole('button', { name: 'Install' }).click();
    await expect(card.getByRole('button', { name: /Use this model|In use/ })).toBeVisible({ timeout: 5000 });
  });

  test('sends the computed snapshot, streams the answer, and remembers the conversation', async ({ page }) => {
    const chats = await stubOllama(page, { replies: ['Your spending rose in Groceries.', 'Because you shopped more often.'] });
    await loadCore(page);
    await enableAI(page);
    await page.click('#tab-month');

    await page.fill('#asp-input', 'What changed this month?');
    await page.click('.asp-send-btn');
    await expect(page.locator('#asp-response')).toContainText('Your spending rose in Groceries.');

    const first = chats[0];
    expect(first.model).toBe('qwen3.5:4b');
    expect(first.think).toBe(false);
    const system = first.messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain('personal CFO');
    expect(system.content).toContain('Financial snapshot');
    expect(system.content).toMatch(/Income: \$[\d,]+\.\d\d/);

    await page.fill('#asp-input', 'Why?');
    await page.click('.asp-send-btn');
    await expect(page.locator('#asp-response')).toContainText('Because you shopped more often.');
    const roles = chats[1].messages.map(m => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(chats[1].messages[2].content).toBe('Your spending rose in Groceries.');

    await page.click('#asp-response .ai-link-btn:has-text("New conversation")');
    await expect(page.locator('#asp-response')).not.toContainText('Groceries');
  });

  test('model output is escaped, never run as HTML', async ({ page }) => {
    await stubOllama(page, { replies: ['Merchant <img src=x onerror="window.__xss=1"> is **notable**.'] });
    await loadCore(page);
    await enableAI(page);
    await page.fill('#asp-input', 'test');
    await page.click('.asp-send-btn');
    await expect(page.locator('#asp-response')).toContainText('<img src=x');
    await expect(page.locator('#asp-response strong')).toHaveText('notable');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('#asp-response img').count()).toBe(0);
  });

  test('Explain buttons ask about the thing next to them', async ({ page }) => {
    const chats = await stubOllama(page, { replies: ['Here is the explanation.'] });
    await loadCore(page);
    await enableAI(page);
    await page.click('#tab-month');
    // A tiny budget guarantees an "Over budget" alert to explain.
    await page.evaluate(() => {
      window.setActiveMonth('2026-04');
      window.state.months['2026-04'].budget = 1;
      window.render();
    });
    const insight = page.locator('#insights-list .insight', { hasText: 'Over budget' }).first();
    const text = (await insight.locator('span').first().textContent()).trim();
    await insight.locator('.ai-explain-btn').click();
    await expect(page.locator('#asp-response')).toContainText('Here is the explanation.');
    expect(chats[0].messages.at(-1).content).toContain(text);
  });

  test('monthly CFO review can be saved to the month', async ({ page }) => {
    await stubOllama(page, { replies: ['### What happened\nYou saved money.'] });
    await loadCore(page);
    await enableAI(page);
    await page.click('#tab-month');
    await page.click('#month-insights .ai-narrative-btn');
    await page.locator('#asp-response button:has-text("Save to this month")').click();
    await expect(page.locator('.cfo-review summary')).toContainText('Your CFO review');
    const saved = await page.evaluate(() => window.state.months[window.getActiveMonth()].cfoReview.text);
    expect(saved).toContain('You saved money.');
  });

  test('a model server that is not on this computer is refused', async ({ page }) => {
    await loadCore(page);
    const err = await page.evaluate(() => {
      try { window.aiSetLocalEndpoint('http://192.168.1.20:1234/v1'); return null } catch (e) { return e.message }
    });
    expect(err).toContain('must run on this computer');
    const err2 = await page.evaluate(() => {
      try { window.aiSetLocalEndpoint('https://api.openai.com/v1'); return null } catch (e) { return e.message }
    });
    expect(err2).toContain('must run on this computer');
  });

  test('the app makes no requests outside this computer', async ({ page }) => {
    const external = [];
    page.on('request', r => {
      const u = new URL(r.url());
      if (/^(https?|wss?):$/.test(u.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) external.push(r.url());
    });
    await stubOllama(page, { replies: ['ok'] });
    await loadCore(page);
    await enableAI(page);
    for (const tab of ['#tab-accounts', '#tab-month', '#tab-overview', '#tab-forecast', '#tab-networth', '#tab-fixed', '#tab-ai']) {
      await page.click(tab);
      await page.waitForTimeout(150);
    }
    await page.fill('#asp-input', 'Where did my money go?');
    await page.click('.asp-send-btn');
    await expect(page.locator('#asp-response')).toContainText('ok');
    expect(external).toEqual([]);
  });
});
