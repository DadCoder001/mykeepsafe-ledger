// ── GLOBAL ERROR TELEMETRY ──────────────────────────────────
window.addEventListener('error', function(e) {
  console.error('[MyKeepSafe] Uncaught error:', e.message, e.filename, e.lineno, e.error);
});
window.addEventListener('unhandledrejection', function(e) {
  console.error('[MyKeepSafe] Unhandled rejection:', e.reason);
});

// ── EVENT DELEGATION ─────────────────────────────────────────
// Inline onclick attributes may not fire in Tauri WebView2.
// Use data-action / data-keydown attributes instead — handled here.
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  try { (new Function('event', action)).call(el, e); } catch(ex) { console.error('[MyKeepSafe] action error:', action, ex); }
});
document.addEventListener('keydown', function(e) {
  const action = e.target.getAttribute('data-keydown');
  if (!action) return;
  try { (new Function('event', action)).call(e.target, e); } catch(ex) { console.error('[MyKeepSafe] keydown error:', action, ex); }
});
document.addEventListener('change', function(e) {
  const action = e.target.getAttribute('data-change');
  if (!action) return;
  try { (new Function('event', action)).call(e.target, e); } catch(ex) { console.error('[MyKeepSafe] change error:', action, ex); }
});

// ── CONFIG & CONSTANTS ──────────────────────────────────────
const STORAGE_KEY = 'myledger_data';
// ── APP MODE ────────────────────────────────────────────────
// 'demo' while the user is exploring the sample data (nothing is saved),
// otherwise 'full'. There is no paid tier: every feature is always available.
function getAppMode() {
  return window._ksDemoMode ? 'demo' : 'full';
}

const DEFAULT_CATEGORIES = ['Rent','Utilities','Groceries','Dining Out','Transportation',
                            'Entertainment','Healthcare','Insurance','Subscriptions','Shopping','Personal Care','Other'];
// ── STATE ───────────────────────────────────────────────────
let state = loadData();
window.state = state; // expose for testing
let activeMonth = null;
let activeView = localStorage.getItem('myledger_last_view') || 'accounts';
if (activeView === 'dashboard') activeView = 'accounts'; // redirect legacy saved state
let overviewMonths = [];
let charts = {};

// ── PERSISTENCE ──────────────────────────────────────────────
let linkedFileHandle = null;
let tauriLinkedPath = null;
const TAURI_LINKED_PATH_KEY = 'myledger_linked_path';
const FILE_HANDLE_DB = 'myledger_filehandle';
const FILE_HANDLE_STORE = 'handles';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Migrate: add savingsGoal to months and defaultSavingsGoal to settings
      if (data.settings && data.settings.defaultSavingsGoal === undefined) data.settings.defaultSavingsGoal = 0;
      Object.values(data.months || {}).forEach(m => { if (m.savingsGoal === undefined) m.savingsGoal = 0; });
      // Migrate: add assets and liabilities arrays
      if (!data.assets) data.assets = [];
      if (!data.liabilities) data.liabilities = [];
      // Migrate: add accounts, goals, userName
      if (!data.accounts) data.accounts = [];
      if (!data.goals) data.goals = [];
      if (!data.netWorthSnapshots) data.netWorthSnapshots = [];
      // Backfill snapshots from existing month data if none recorded yet
      if (data.netWorthSnapshots.length === 0 && data.months && data.assets !== undefined) {
        const assetTotal = (data.assets || []).reduce((s, a) => s + (a.value || 0), 0);
        const liabTotal = (data.liabilities || []).reduce((s, l) => s + (l.balance || 0), 0);
        const netWorth = assetTotal - liabTotal;
        (data.order || Object.keys(data.months)).forEach(k => {
          data.netWorthSnapshots.push({ month: k, value: netWorth });
        });
        data.netWorthSnapshots.sort((a, b) => a.month.localeCompare(b.month));
      }
      if (!data.settings.userName) data.settings.userName = '';
      if (!data.settings.dismissedSubscriptions) data.settings.dismissedSubscriptions = [];
      if (!data.settings.householdMembers) data.settings.householdMembers = [];
      if (!data.notifications) data.notifications = [];
      // Migrate: add linkedAccountId to goals, remove old contributions
      (data.goals || []).forEach(g => {
        if (g.linkedAccountId === undefined) g.linkedAccountId = '';
        if (g.monthlyTarget === undefined) g.monthlyTarget = 0;
        delete g.contributions;
      });
      // Migrate: add interestRate/minimumPayment to liabilities
      (data.liabilities || []).forEach(l => {
        if (l.interestRate === undefined) l.interestRate = 0;
        if (l.minimumPayment === undefined) l.minimumPayment = 0;
      });
      // Migrate: add frequency to fixed expenses
      (data.fixedExpenses || []).forEach(fe => { if (!fe.frequency) fe.frequency = 'monthly'; });
      // Migrate: add tags to transactions
      if (!data.knownTags) {
        data.knownTags = [];
        const tagSet = new Set();
        Object.values(data.months || {}).forEach(m => {
          (m.incomes || []).forEach(t => { if (!t.tags) t.tags = []; t.tags.forEach(tg => tagSet.add(tg)); });
          (m.expenses || []).forEach(t => { if (!t.tags) t.tags = []; t.tags.forEach(tg => tagSet.add(tg)); });
        });
        data.knownTags = [...tagSet].sort();
      }
      // Migrate: backfill accountId on transactions from month's linkedAccountId
      Object.values(data.months || {}).forEach(m => {
        let acctId = m.linkedAccountId || '';
        // If no linkedAccountId, auto-detect from the most common accountId in transactions
        if (!acctId) {
          const counts = {};
          [...(m.incomes || []), ...(m.expenses || [])].forEach(t => { if (t.accountId) counts[t.accountId] = (counts[t.accountId] || 0) + 1; });
          const topId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0];
          if (topId) { m.linkedAccountId = topId; acctId = topId; }
        }
        if (acctId) {
          (m.incomes || []).forEach(t => { if (!t.accountId) t.accountId = acctId; });
          (m.expenses || []).forEach(t => { if (!t.accountId) t.accountId = acctId; });
        }
        // Migrate: add transfers array
        if (!m.transfers) m.transfers = [];
        // Migrate: add categoryBudgets map
        if (!m.categoryBudgets) m.categoryBudgets = {};
      });
      // AI settings from older versions (cloud providers, WebLLM, old models).
      // src/ai/index.js also runs this once it loads, for the very first load.
      window.normalizeAISettings?.(data.settings);
      return data;
    }
  } catch(e) {}
  return getDefaultData();
}

function saveData() {
  // Demo mode: never persist. Anything the user does while browsing the
  // demo dashboard evaporates on reload — as intended.
  if (window._ksDemoMode) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveToLinkedFile();
  updateFileSyncUI();
}

// ── DEMO MODE ────────────────────────────────────────────────
// Loads demo-data.json into in-memory state for the first-launch preview.
// While _ksDemoMode is true, saveData() no-ops, so nothing
// the user does in the demo touches localStorage or the linked file.
async function enterDemoMode() {
  try {
    const res = await fetch('demo-data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`demo-data.json fetch failed (${res.status})`);
    const data = await res.json();

    // Minimal shape guarantees so the render pipeline doesn't crash on
    // missing fields. loadData()'s full migration list is more complete but
    // demo-data.json is already known to be well-formed.
    if (!data.months) data.months = {};
    if (!data.order) data.order = Object.keys(data.months).sort();
    if (!data.categories) data.categories = DEFAULT_CATEGORIES;
    if (!data.fixedExpenses) data.fixedExpenses = [];
    if (!data.accounts) data.accounts = [];
    if (!data.goals) data.goals = [];
    if (!data.assets) data.assets = [];
    if (!data.liabilities) data.liabilities = [];
    if (!data.netWorthSnapshots) data.netWorthSnapshots = [];
    if (!data.notifications) data.notifications = [];
    if (!data.knownTags) data.knownTags = [];
    if (!data.settings) data.settings = {};
    // Force AI off in demo mode so on-device model download isn't triggered.
    data.settings.aiEnabled = false;

    window._ksDemoMode = true;
    state = data;
    window.state = state;

    // Set active month + recalc balances so the dashboard shows real numbers.
    if (data.order.length > 0) {
      activeMonth = data.order[data.order.length - 1];
      window.activeMonth = activeMonth;
    }
    (data.order || []).forEach(k => window.recalcBalance?.(k));
    (data.accounts || []).forEach(a => window.syncLinkedAccount?.(a.id));

    // Trigger a full re-render across all views.
    render();
  } catch (e) {
    console.error('[MyKeepSafe] Failed to enter demo mode:', e);
    window._ksDemoMode = false;
    // Fall back to empty state.
    state = getDefaultData();
    window.state = state;
    render();
  }
}

function exitDemoMode() {
  window._ksDemoMode = false;
  state = loadData(); // the real data — demo edits were never saved
  window.state = state;
  if (state.order.length === 0) {
    const cur = new Date().toISOString().slice(0, 7);
    createMonth(cur);
    saveData();
  }
  activeMonth = state.order[state.order.length - 1];
  window.activeMonth = activeMonth;
  render();
}

// Onboarding "Explore with sample data": loads demo-data.json in memory only.
function exploreSampleData() {
  localStorage.setItem('myledger_onboarded', '1');
  const el = document.getElementById('onboarding-modal');
  if (el) {
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
  }
  enterDemoMode();
}


function getDefaultData() {
  return {
    months: {},
    order: [],
    categories: DEFAULT_CATEGORIES,
    fixedExpenses: [],
    knownTags: [],
    assets: [],
    liabilities: [],
    accounts: [],
    goals: [],
    netWorthSnapshots: [],
    notifications: [],
    seenMilestones: {},
    settings: { lowSavings: 10, expenseSpikePct: 10, largeTxPct: 20, aiEnabled: true, aiProvider: isDesktopApp() ? 'llamacpp' : 'ollama', aiModel: isDesktopApp() ? 'qwen3.5-4b' : 'qwen3.5:4b', lastBackup: null, budgetCarryForward: false, defaultSavingsGoal: 0, userName: '', dismissedSubscriptions: [], householdMembers: [], ollamaUrl: 'http://localhost:11434', localEndpoint: 'http://localhost:1234/v1' }
  };
}

// ── FILE SYNC (File System Access API / Tauri fallback) ──────
function isDesktopApp() {
  return typeof window.__TAURI__ !== 'undefined';
}
async function tauriInvoke(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args || {});
}
function fileSystemAccessSupported() {
  return typeof window.showSaveFilePicker === 'function' || isDesktopApp();
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FILE_HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeFileHandle(handle) {
  const db = await openHandleDB();
  const tx = db.transaction(FILE_HANDLE_STORE, 'readwrite');
  tx.objectStore(FILE_HANDLE_STORE).put(handle, 'linked');
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function retrieveFileHandle() {
  const db = await openHandleDB();
  const tx = db.transaction(FILE_HANDLE_STORE, 'readonly');
  const req = tx.objectStore(FILE_HANDLE_STORE).get('linked');
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
}

async function clearFileHandle() {
  const db = await openHandleDB();
  const tx = db.transaction(FILE_HANDLE_STORE, 'readwrite');
  tx.objectStore(FILE_HANDLE_STORE).delete('linked');
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function linkFile() {
  if (!fileSystemAccessSupported()) {
    alert('File Sync requires Chrome, Edge, or the MyKeepSafe Ledger desktop app. Use Export/Import as a fallback.');
    return;
  }
  // Tauri native: use open dialog so user can pick an existing file (or a new path)
  if (isDesktopApp() && typeof window.showSaveFilePicker !== 'function') {
    try {
      // Try open-file first so existing data files load correctly
      const path = await tauriInvoke('pick_open_file');
      if (!path) return;
      tauriLinkedPath = path;
      localStorage.setItem(TAURI_LINKED_PATH_KEY, path);
      // Read the file — if it has valid data, load it; otherwise write current state
      const fileData = await loadFromLinkedFile();
      if (fileData && fileData.months && fileData.order) {
        fileData.settings = { ...getDefaultData().settings, ...fileData.settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fileData));
        state = loadData(); // runs all migrations
        window.state = state;
        render();
      } else {
        // Empty or invalid file — write current state into it
        await saveToLinkedFile();
      }
      state.settings.lastBackup = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateFileSyncUI();
      closeFileSetupModal();
    } catch (e) {
      console.error('Tauri link file error:', e);
    }
    return;
  }
  // Browser File System Access API
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'mykeepsafe-ledger-data.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    linkedFileHandle = handle;
    await storeFileHandle(handle);
    // Read the file — if it has valid data, load it; otherwise write current state
    const fileData = await loadFromLinkedFile();
    if (fileData && fileData.months && fileData.order) {
      fileData.settings = { ...getDefaultData().settings, ...fileData.settings };
      state = fileData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    } else {
      await saveToLinkedFile();
    }
    state.settings.lastBackup = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateFileSyncUI();
    closeFileSetupModal();
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Link file error:', e);
  }
}

async function linkFileFromSetup() {
  await linkFile();
}

function showFileSetupModal() {
  const el = document.getElementById('file-setup-modal');
  if (el) {
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
  }
}

function closeFileSetupModal() {
  const el = document.getElementById('file-setup-modal');
  if (el) {
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
  }
}

function showOnboardingModal() {
  const el = document.getElementById('onboarding-modal');
  if (el) {
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
  }
}


function closeOnboardingModal() {
  localStorage.setItem('myledger_onboarded', '1');
  const el = document.getElementById('onboarding-modal');
  if (el) {
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
  }
  // After dismissing onboarding, offer file setup if no file linked yet
  const needsFileSetup = !serverMode && !linkedFileHandle && !tauriLinkedPath;
  if (needsFileSetup && isDesktopApp()) {
    showFileSetupModal();
  } else if (needsFileSetup && !isDesktopApp() && typeof window.showSaveFilePicker === 'function') {
    showFileSetupModal();
  }
}

function resetBlockingOverlays() {
  const modalIds = [
    'onboarding-modal',
    'file-setup-modal',
    'csv-modal'
  ];
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
  });
}

function dismissQuickStart() {
  // Deprecated: now handled by toggleQuickStart
  toggleQuickStart();
}

function toggleQuickStart() {
  const card = document.getElementById('qs-card');
  if (!card) return;
  const isCollapsed = card.classList.contains('collapsed');
  if (isCollapsed) {
    // Expand
    card.classList.remove('collapsed');
    localStorage.setItem('myledger_qs_expanded', '1');
    localStorage.removeItem('myledger_qs_collapsed');
  } else {
    // Collapse
    card.classList.add('collapsed');
    localStorage.setItem('myledger_qs_collapsed', '1');
    localStorage.removeItem('myledger_qs_expanded');
  }
}

function applyQuickStartState() {
  const card = document.getElementById('qs-card');
  if (!card) return;
  const isOnboarded = !!localStorage.getItem('myledger_onboarded');
  const manuallyExpanded = !!localStorage.getItem('myledger_qs_expanded');
  const manuallyCollapsed = !!localStorage.getItem('myledger_qs_collapsed');
  // Collapsed when: onboarded AND not manually expanded; or manually collapsed
  const shouldCollapse = manuallyCollapsed || (isOnboarded && !manuallyExpanded);
  card.classList.toggle('collapsed', shouldCollapse);
}

// ── PROFILE VIEW ──────────────────────────────────────────────
function getDesktopVersionApi() {
  if (!isDesktopApp()) return null;
  return window.__TAURI__?.app || null;
}

async function resolveDesktopAppVersion() {
  if (!isDesktopApp()) return;
  const versionEl = document.getElementById('profile-app-version');
  if (!versionEl) return;
  const appApi = getDesktopVersionApi();
  if (!appApi || typeof appApi.getVersion !== 'function') return;
  try {
    const version = await appApi.getVersion();
    if (version) versionEl.textContent = `v${version}`;
  } catch (e) {
    console.warn('Could not resolve desktop version:', e);
  }
}

function saveProfileName() {
  const input = document.getElementById('profile-name-input');
  if (!input) return;
  const name = input.value.trim();
  state.settings.userName = name;
  // Also sync the dashboard sidebar name input
  const dashInput = document.getElementById('dash-name-input');
  if (dashInput) dashInput.value = name;
  saveData();
  document.dispatchEvent(new CustomEvent('ks:sidebar-render', { detail: { activeView, activeMonth } }));
  document.dispatchEvent(new CustomEvent('ks:profile-render'));
}

async function confirmResetAppData() {
  const confirmed = window.confirm(
    'This will permanently delete ALL your MyKeepSafe Ledger data on this computer (transactions, accounts, settings, everything).\n\nThis cannot be undone.\n\nAre you sure?'
  );
  if (!confirmed) return;
  if (serverMode) {
    try {
      await putToServer(getDefaultData());
    } catch (e) {
      alert('Could not clear the data file: ' + e.message);
      return;
    }
  }
  localStorage.clear();
  location.reload();
}

// ── LOCAL SERVER MODE ────────────────────────────────────────
// When the app is served by `npm start` (server/index.mjs), data is saved to a
// JSON file on disk through /api/data. localStorage stays as a cache.
let serverMode = null; // health info ({ dataFile, ... }) when active
let serverSaveTimer = null;

async function detectServerMode() {
  if (isDesktopApp()) return null;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return null;
    const info = await res.json();
    return info && info.ok ? info : null;
  } catch {
    return null;
  }
}

async function putToServer(data) {
  const res = await fetch('/api/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

function scheduleServerSave() {
  clearTimeout(serverSaveTimer);
  serverSaveTimer = setTimeout(async () => {
    serverSaveTimer = null;
    try {
      state.settings.lastBackup = Date.now();
      await putToServer(state);
    } catch (e) {
      console.error('[MyKeepSafe] Save to data file failed:', e);
      showToast('Could not save to your data file — is the app server still running?', 5000, 'error');
    }
  }, 300);
}

// Flush a pending save if the tab closes mid-debounce.
window.addEventListener('pagehide', () => {
  if (!serverMode || !serverSaveTimer) return;
  clearTimeout(serverSaveTimer);
  try {
    fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state), keepalive: true });
  } catch {}
});

// Loads the data file into state. Returns true when server mode is active.
async function restoreFromServer() {
  serverMode = await detectServerMode();
  window._ksServerMode = !!serverMode;
  if (!serverMode) return false;
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.status === 404) {
      // First run with the server: move any browser-only data into the file.
      if (state.order.length || (state.accounts || []).length) await putToServer(state);
      return true;
    }
    const fileData = await res.json();
    if (fileData && fileData.months && fileData.order) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fileData));
      state = loadData(); // runs all migrations
      window.state = state;
    }
  } catch (e) {
    console.error('[MyKeepSafe] Could not load the data file:', e);
    showToast('Could not read your data file — showing the copy saved in this browser.', 5000, 'error');
  }
  return true;
}

function getDataLocationLabel() {
  if (serverMode) return serverMode.dataFile;
  if (tauriLinkedPath) return tauriLinkedPath;
  if (linkedFileHandle) return (linkedFileHandle.name || 'linked file') + ' (linked file)';
  return 'This browser on this computer — export backups regularly';
}

async function unlinkFile() {
  linkedFileHandle = null;
  tauriLinkedPath = null;
  localStorage.removeItem(TAURI_LINKED_PATH_KEY);
  await clearFileHandle();
  // Reset app to blank state — unlinked means no data
  state = getDefaultData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  updateFileSyncUI();
  showToast('File unlinked — app reset to empty state.');
}

async function saveToLinkedFile() {
  if (serverMode) {
    scheduleServerSave();
    return;
  }
  if (tauriLinkedPath && isDesktopApp()) {
    try {
      await tauriInvoke('write_text_file', { path: tauriLinkedPath, content: JSON.stringify(state, null, 2) });
      state.settings.lastBackup = Date.now();
    } catch (e) {
      console.error('Tauri save to linked file failed:', e);
    }
    return;
  }
  if (!linkedFileHandle) return;
  try {
    const perm = await linkedFileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await linkedFileHandle.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') return;
    }
    const writable = await linkedFileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    state.settings.lastBackup = Date.now();
  } catch (e) {
    console.error('Save to linked file failed:', e);
  }
}

async function loadFromLinkedFile() {
  if (serverMode) {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.months && data.order) return data;
    } catch (e) {
      console.error('[MyKeepSafe] Load from data file failed:', e);
    }
    return null;
  }
  if (tauriLinkedPath && isDesktopApp()) {
    try {
      const text = await tauriInvoke('read_text_file', { path: tauriLinkedPath });
      const data = JSON.parse(text);
      if (data && data.months && data.order) return data;
    } catch (e) {
      console.error('Tauri load from linked file failed:', e);
    }
    return null;
  }
  if (!linkedFileHandle) return null;
  try {
    const perm = await linkedFileHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      const req = await linkedFileHandle.requestPermission({ mode: 'read' });
      if (req !== 'granted') return null;
    }
    const file = await linkedFileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (data && data.months && data.order) return data;
  } catch (e) {
    console.error('Load from linked file failed:', e);
  }
  return null;
}

async function restoreFileHandle() {
  if (await restoreFromServer()) {
    updateFileSyncUI();
    return;
  }
  // Tauri native fallback: restore saved path from localStorage
  if (isDesktopApp() && typeof window.showSaveFilePicker !== 'function') {
    const savedPath = localStorage.getItem(TAURI_LINKED_PATH_KEY);
    if (!savedPath) return;
    tauriLinkedPath = savedPath;
    try {
      const fileData = await loadFromLinkedFile();
      if (fileData) {
        fileData.settings = { ...getDefaultData().settings, ...fileData.settings };
        state = fileData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        state.order.forEach(k => recalcBalance(k));
        (state.accounts || []).forEach(a => syncLinkedAccount(a.id));
      }
    } catch (e) {
      console.error('Tauri restore file failed:', e);
      tauriLinkedPath = null;
      localStorage.removeItem(TAURI_LINKED_PATH_KEY);
    }
    updateFileSyncUI();
    return;
  }
  if (!fileSystemAccessSupported()) return;
  try {
    const handle = await retrieveFileHandle();
    if (!handle) return;
    linkedFileHandle = handle;
    // Try to load data from the linked file (fresher than localStorage)
    const fileData = await loadFromLinkedFile();
    if (fileData) {
      // Merge settings that may be localStorage-only
      fileData.settings = { ...getDefaultData().settings, ...fileData.settings };
      state = fileData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      state.order.forEach(k => recalcBalance(k));
      (state.accounts || []).forEach(a => syncLinkedAccount(a.id));
    }
    updateFileSyncUI();
  } catch (e) {
    console.error('Restore file handle failed:', e);
    linkedFileHandle = null;
  }
}

function updateFileSyncUI() {
  const statusEl = document.getElementById('file-sync-status');
  const linkBtn = document.getElementById('link-file-btn');
  const unlinkBtn = document.getElementById('unlink-file-btn');
  const reminderEl = document.getElementById('backup-reminder');
  if (!statusEl) return;

  if (serverMode) {
    statusEl.className = 'file-sync-status linked';
    statusEl.innerHTML = '<span class="sync-dot"></span><span class="file-sync-name"></span>';
    statusEl.querySelector('.file-sync-name').textContent = 'Saving to ' + serverMode.dataFile.split(/[\\/]/).pop() + ' on this computer';
    statusEl.title = serverMode.dataFile;
    if (linkBtn) linkBtn.style.display = 'none';
    if (unlinkBtn) unlinkBtn.style.display = 'none';
    if (reminderEl) reminderEl.style.display = 'none';
    const section = statusEl.closest('.sb-section');
    if (section) section.style.display = '';
    return;
  }

  const linkedName = linkedFileHandle
    ? (linkedFileHandle.name || 'linked file')
    : tauriLinkedPath
      ? tauriLinkedPath.split(/[\\/]/).pop()
      : null;
  if (linkedName) {
    statusEl.className = 'file-sync-status linked';
    statusEl.innerHTML = '<span class="sync-dot"></span><span class="file-sync-name">' + linkedName + '</span>';
    if (linkBtn) linkBtn.style.display = 'none';
    if (unlinkBtn) unlinkBtn.style.display = '';
    if (reminderEl) reminderEl.style.display = 'none';
  } else {
    statusEl.className = 'file-sync-status unlinked';
    statusEl.innerHTML = '<span class="sync-dot"></span><span>No file linked</span>';
    if (linkBtn) linkBtn.style.display = '';
    if (unlinkBtn) unlinkBtn.style.display = 'none';
    // Show backup reminder if no file linked and last backup > 7 days ago (or never)
    const last = state.settings.lastBackup;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (!last || (Date.now() - last > sevenDays)) {
      if (reminderEl) {
        reminderEl.style.display = '';
        reminderEl.textContent = last
          ? 'Last backup: ' + new Date(last).toLocaleDateString() + '. Consider exporting or linking a file.'
          : 'No recent backup. Link a file or export your data to keep it safe.';
      }
    } else {
      if (reminderEl) reminderEl.style.display = 'none';
    }
  }

  // Hide entire File Sync section if API not supported
  const syncSection = statusEl.closest('.sb-section');
  if (syncSection && !fileSystemAccessSupported()) {
    syncSection.style.display = 'none';
  }
}

// ── UTILITIES ────────────────────────────────────────────────
function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── MONTH MANAGEMENT ────────────────────────────────────────
function recordNetWorthSnapshot() {
  const { netWorth } = calcNetWorth();
  const month = new Date().toISOString().slice(0, 7);
  if (!state.netWorthSnapshots) state.netWorthSnapshots = [];
  const existing = state.netWorthSnapshots.find(s => s.month === month);
  if (existing) { existing.value = netWorth; } else { state.netWorthSnapshots.push({ month, value: netWorth }); }
  state.netWorthSnapshots.sort((a, b) => a.month.localeCompare(b.month));
}

function getRollingBalance(upToKey) {
  return state.order.filter(k => k <= upToKey).reduce((sum, k) => sum + (state.months[k]?.balance || 0), 0);
}

function toggleAddRow() {
  const body = document.getElementById('add-row-body');
  const toggle = document.querySelector('.add-row-toggle');
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (toggle) toggle.classList.toggle('open', isOpen);
}

function addBulkTransfers(transfers) {
  transfers.forEach(t => {
    if (!state.months[t.monthKey]) createMonth(t.monthKey);
    const m = state.months[t.monthKey];
    if (!m.transfers) m.transfers = [];
    m.transfers.push({ amount: t.amount, desc: t.desc, date: t.date, tags: t.tags || [], fromAccountId: t.fromAccountId, toAccountId: t.toAccountId });
  });
  const accountIds = new Set();
  transfers.forEach(t => { if (t.fromAccountId) accountIds.add(t.fromAccountId); if (t.toAccountId) accountIds.add(t.toAccountId); });
  accountIds.forEach(id => syncLinkedAccount(id));
  saveData();
  render();
}

// ── BUDGET ──────────────────────────────────────────────────
function getEffectiveBudget(monthKey) {
  const m = state.months[monthKey];
  if (!m) return 0;
  const carry = state.settings.budgetCarryForward ? (m.carryForward || 0) : 0;
  return m.budget + carry;
}

// ── NET WORTH ───────────────────────────────────────────────
function calcNetWorth() {
  const acctAssets = (state.accounts || []).reduce((s, a) => s + a.balance, 0);
  const totalAssets = state.assets.reduce((s, a) => s + a.value, 0) + acctAssets;
  const totalLiabilities = state.liabilities.reduce((s, l) => s + l.value, 0);
  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

// ── DEBT PAYOFF PLANNER ─────────────────────────────────────
let debtStrategy = 'avalanche'; // 'avalanche' | 'snowball'

function setDebtStrategy(strategy) {
  debtStrategy = strategy;
  renderDebtPlanner();
}

function calcDebtPayoff(debts, extraPayment) {
  // Returns months to pay off all debts and total interest paid
  // debts: [{id, name, balance, rate (annual %), minPayment}]
  // Makes a copy to avoid mutating state
  let remaining = debts.map(d => ({ ...d, balance: d.value, rate: d.interestRate / 100 / 12 }));
  let month = 0;
  let totalInterest = 0;
  const monthlyBalances = [remaining.map(d => d.balance)]; // snapshot per month

  while (remaining.some(d => d.balance > 0) && month < 600) {
    month++;
    let extra = extraPayment;

    // Order by strategy
    const ordered = debtStrategy === 'avalanche'
      ? [...remaining].sort((a, b) => b.interestRate - a.interestRate)
      : [...remaining].sort((a, b) => a.balance - b.balance);

    // Apply interest + min payment to all
    remaining.forEach(d => {
      if (d.balance <= 0) return;
      const interest = d.balance * d.rate;
      totalInterest += interest;
      d.balance += interest;
      const pay = Math.min(d.minimumPayment || d.balance, d.balance);
      d.balance -= pay;
    });

    // Apply extra payment to priority debt
    for (const d of ordered) {
      if (d.balance <= 0 || extra <= 0) continue;
      const pay = Math.min(extra, d.balance);
      d.balance -= pay;
      extra -= pay;
    }

    remaining.forEach(d => { if (d.balance < 0.01) d.balance = 0; });
    monthlyBalances.push(remaining.map(d => d.balance));
  }

  return { months: month, totalInterest, monthlyBalances };
}

function renderDebtPlanner() {
  const debts = state.liabilities.filter(l => l.interestRate > 0 && l.minimumPayment > 0);
  if (debts.length === 0) return;

  const extraInput = document.getElementById('debt-extra-payment');
  const extra = parseFloat(extraInput?.value) || 0;

  // Calc both strategies for comparison
  const oldStrategy = debtStrategy;
  debtStrategy = 'avalanche';
  const av = calcDebtPayoff(debts, extra);
  debtStrategy = 'snowball';
  const sw = calcDebtPayoff(debts, extra);
  debtStrategy = oldStrategy;
  const current = debtStrategy === 'avalanche' ? av : sw;

  // Update button styles
  const avBtn = document.getElementById('debt-strategy-avalanche');
  const swBtn = document.getElementById('debt-strategy-snowball');
  if (avBtn) avBtn.style.fontWeight = debtStrategy === 'avalanche' ? '700' : '400';
  if (swBtn) swBtn.style.fontWeight = debtStrategy === 'snowball' ? '700' : '400';

  // Summary
  const summaryEl = document.getElementById('debt-planner-summary');
  if (summaryEl) {
    const avYrs = (av.months / 12).toFixed(1);
    const swYrs = (sw.months / 12).toFixed(1);
    summaryEl.innerHTML = `
      <div class="sum-card"><div class="sum-label">Payoff (${debtStrategy === 'avalanche' ? 'Avalanche' : 'Snowball'})</div><div class="sum-val pos">${current.months} months (${(current.months/12).toFixed(1)} yrs)</div></div>
      <div class="sum-card"><div class="sum-label">Total Interest</div><div class="sum-val neg">${fmt(current.totalInterest)}</div></div>
      <div class="sum-card"><div class="sum-label">Avalanche vs Snowball</div><div class="sum-val neu">${avYrs} vs ${swYrs} yrs · ${fmt(Math.abs(av.totalInterest - sw.totalInterest))} difference</div></div>
    `;
  }

  // Chart: total debt balance over time
  destroyChart('debtPayoff');
  const ctx = document.getElementById('debtPayoffChart')?.getContext('2d');
  if (ctx && typeof Chart !== 'undefined') {
    const labels = current.monthlyBalances.map((_, i) => `Mo ${i}`);
    const totalBalances = current.monthlyBalances.map(snap => snap.reduce((s, b) => s + b, 0));
    charts.debtPayoff = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Debt',
          data: totalBalances,
          borderColor: '#c0392b',
          backgroundColor: 'rgba(192,57,43,0.07)',
          fill: true, tension: 0.3, pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
        scales: { x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
      }
    });
  }

  // Per-debt payoff table
  const tableEl = document.getElementById('debt-payoff-table');
  if (tableEl) {
    // Find when each debt reaches 0
    const payoffMonths = debts.map((d, i) => {
      const mo = current.monthlyBalances.findIndex(snap => snap[i] === 0);
      return { name: d.name, month: mo, rate: d.interestRate, balance: d.value };
    });
    tableEl.innerHTML = `<table class="nw-table"><thead><tr><th>Debt</th><th>Balance</th><th>Rate</th><th>Payoff</th></tr></thead><tbody>
      ${payoffMonths.map(d => `<tr>
        <td>${d.name}</td>
        <td class="nw-val">${fmt(d.balance)}</td>
        <td class="nw-val">${d.rate.toFixed(2)}%</td>
        <td class="nw-val">${d.month > 0 ? d.month + ' months' : 'Paid off'}</td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  // Gap 5: extra-payment comparison table
  const compEl = document.getElementById('debt-extra-comparison');
  if (compEl) {
    const base50 = (() => { const s = debtStrategy; debtStrategy = s; return calcDebtPayoff(debts, extra + 50); })();
    const base100 = (() => { return calcDebtPayoff(debts, extra + 100); })();
    const rows = [
      { label: extra > 0 ? `Current (+${fmt(extra)}/mo)` : 'Current pace', res: current },
      { label: `+${fmt(50)}/mo extra`, res: base50 },
      { label: `+${fmt(100)}/mo extra`, res: base100 },
    ];
    compEl.innerHTML = `
      <div style="margin-top:1rem;">
        <div style="font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:0.5rem;">Extra Payment Comparison</div>
        <table class="nw-table">
          <thead><tr><th>Scenario</th><th>Months</th><th>Total Interest</th><th>Savings vs Current</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `<tr>
              <td>${r.label}</td>
              <td class="nw-val">${r.res.months}</td>
              <td class="nw-val neg">${fmt(r.res.totalInterest)}</td>
              <td class="nw-val pos">${i === 0 ? '—' : (current.totalInterest - r.res.totalInterest) >= 0 ? fmt(current.totalInterest - r.res.totalInterest) + ' saved' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

// ── HEURISTIC INSIGHTS ──────────────────────────────────────
function generateMonthInsights(monthKey) {
  const insights = [];
  const m = state.months[monthKey];
  if (!m) return insights;

  const income = m.incomes.reduce((s, t) => s + t.amount, 0);
  const expense = m.expenses.reduce((s, t) => s + t.amount, 0);
  const savings = income > 0 ? ((income - expense) / income) * 100 : 0;
  const { lowSavings, expenseSpikePct, largeTxPct } = state.settings;

  const catTotals = {};
  m.expenses.forEach(e => { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
  const sorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);
  if (sorted[0]) insights.push({ type: 'info', text: `Top spend: ${sorted[0][0]} at ${fmt(sorted[0][1])}` });
  if (sorted[1]) insights.push({ type: 'info', text: `2nd: ${sorted[1][0]} at ${fmt(sorted[1][1])}` });

  if (income > 0 && savings < lowSavings) {
    insights.push({ type: 'warn', text: `Savings rate ${savings.toFixed(1)}% below target` });
  } else if (income > 0) {
    insights.push({ type: 'good', text: `Savings rate ${savings.toFixed(1)}% — on track` });
  }

  if (m.budget > 0 && expense > m.budget) {
    const effectiveBudget = getEffectiveBudget(monthKey);
    insights.push({ type: 'alert', text: `Over budget by ${fmt(expense - effectiveBudget)}` });
  }

  if (state.settings.budgetCarryForward && (m.carryForward || 0) > 0) {
    const prevKey = state.order[state.order.indexOf(monthKey) - 1];
    const prevLabel = prevKey || 'previous month';
    insights.push({ type: 'good', text: `Carried ${fmt(m.carryForward)} from ${prevLabel}` });
  }

  // Savings goal insights
  if (m.savingsGoal > 0) {
    const balance = income - expense;
    const actualSaved = balance > 0 ? balance : 0;
    if (actualSaved >= m.savingsGoal) {
      insights.push({ type: 'good', text: `Savings goal met: ${fmt(actualSaved)} of ${fmt(m.savingsGoal)}` });
    } else {
      insights.push({ type: 'warn', text: `Savings goal: ${fmt(actualSaved)} of ${fmt(m.savingsGoal)} (${fmt(m.savingsGoal - actualSaved)} to go)` });
    }
  }

  const prevKey = state.order[state.order.indexOf(monthKey) - 1];
  if (prevKey) {
    const prevExp = state.months[prevKey].expenses.reduce((s,t) => s+t.amount, 0);
    if (prevExp > 0) {
      const changePct = ((expense - prevExp) / prevExp) * 100;
      if (changePct > expenseSpikePct) {
        insights.push({ type: 'warn', text: `Expenses up ${changePct.toFixed(1)}% vs last month` });
      }
    }
  }

  if (m.expenses.length > 0) {
    const avg = expense / m.expenses.length;
    const threshold = avg * (1 + largeTxPct / 100);
    m.expenses.filter(e => e.amount > threshold).forEach(e => {
      insights.push({ type: 'info', text: `Large: ${e.desc || e.cat} — ${fmt(e.amount)}` });
    });
  }

  return insights;
}

function generateOverviewInsights(months) {
  const insights = [];
  if (months.length === 0) return insights;

  let totalInc = 0, totalExp = 0;
  const catTotals = {};
  months.forEach(k => {
    const m = state.months[k];
    const inc = m.incomes.reduce((s,t) => s+t.amount, 0);
    const exp = m.expenses.reduce((s,t) => s+t.amount, 0);
    totalInc += inc;
    totalExp += exp;
    m.expenses.forEach(e => {
      catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
    });
  });

  const avgSavings = totalInc > 0 ? ((totalInc - totalExp) / totalInc) * 100 : 0;
  insights.push({ type: 'info', text: `Period income: ${fmt(totalInc)}` });
  insights.push({ type: 'info', text: `Period expenses: ${fmt(totalExp)}` });
  insights.push({ type: avgSavings >= 10 ? 'good' : 'warn', text: `Average savings rate: ${avgSavings.toFixed(1)}%` });

  const sorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);
  if (sorted[0]) insights.push({ type: 'info', text: `Top category: ${sorted[0][0]} (${fmt(sorted[0][1])})` });

  return insights;
}

// ── CHARTS ──────────────────────────────────────────────────
function setChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--ink3').trim() || '#8888aa';
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function initBalanceChart(monthKey) {
  destroyChart('balance');
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('balanceChart')?.getContext('2d');
  if (!ctx) return;

  const labels = state.order;
  const data = state.order.map((k, i) => getRollingBalance(k));

  charts.balance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Rolling Balance',
        data,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        backgroundColor: 'rgba(45,106,79,0.08)',
        fill: true, tension: 0.3, pointRadius: 4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function initExpenseChart(monthKey) {
  destroyChart('expense');
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('expenseChart')?.getContext('2d');
  if (!ctx) return;

  const m = state.months[monthKey];
  if (!m) return;

  const catTotals = {};
  m.expenses.forEach(e => {
    catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
  });
  const entries = Object.entries(catTotals).filter(([,v]) => v > 0);
  const COLORS = ['#2d6a4f','#40916c','#52b788','#74c69d','#95d5b2','#b7e4c7','#c0392b','#e57373','#b5830a','#f4c542','#1d4ed8','#60a5fa'];

  charts.expense = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
  });
}

function initOverviewCharts(months) {
  if (typeof Chart === 'undefined') return;
  destroyChart('ovBalance');
  destroyChart('ovCatTrend');
  const ctx1 = document.getElementById('ovBalanceChart')?.getContext('2d');
  if (ctx1) {
    const data = months.map((k, i) => getRollingBalance(k));
    charts.ovBalance = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Rolling Balance',
          data,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(45,106,79,0.08)',
          fill: true, tension: 0.3, pointRadius: 4
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  destroyChart('ovIncExp');
  const ctx2 = document.getElementById('ovIncExpChart')?.getContext('2d');
  if (ctx2) {
    charts.ovIncExp = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Income', data: months.map(k => state.months[k]?.incomes.reduce((s,t)=>s+t.amount,0)||0), backgroundColor: 'rgba(45,106,79,0.7)' },
          { label: 'Expenses', data: months.map(k => state.months[k]?.expenses.reduce((s,t)=>s+t.amount,0)||0), backgroundColor: 'rgba(192,57,43,0.7)' }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  }

  destroyChart('ovCat');
  const ctx3 = document.getElementById('ovCatChart')?.getContext('2d');
  if (ctx3) {
    const catTotals = {};
    months.forEach(k => {
      state.months[k]?.expenses.forEach(e => {
        catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
      });
    });
    const entries = Object.entries(catTotals).filter(([,v]) => v > 0);
    const COLORS = ['#2d6a4f','#40916c','#52b788','#74c69d','#95d5b2','#b7e4c7','#c0392b','#e57373','#b5830a','#f4c542','#1d4ed8','#60a5fa'];
    charts.ovCat = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{ data: entries.map(([,v]) => v), backgroundColor: COLORS, borderWidth: 0 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
  }

  destroyChart('ovSavings');
  const ctx4 = document.getElementById('ovSavingsChart')?.getContext('2d');
  if (ctx4) {
    const rates = months.map(k => {
      const m = state.months[k];
      const inc = m.incomes.reduce((s,t)=>s+t.amount,0);
      const exp = m.expenses.reduce((s,t)=>s+t.amount,0);
      return inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    });
    charts.ovSavings = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Savings Rate %',
          data: rates,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(45,106,79,0.08)',
          fill: true, tension: 0.3, pointRadius: 4
        }]
      },
      options: { responsive: true, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
    });
  }

  // Chart 5: Category Trends — top 5 categories month-over-month grouped bar
  destroyChart('ovCatTrend');
  const ctx5 = document.getElementById('ovCatTrendChart')?.getContext('2d');
  if (ctx5 && months.length > 0) {
    // Find top 5 categories by total spend
    const allCatTotals = {};
    months.forEach(k => state.months[k]?.expenses.forEach(e => {
      allCatTotals[e.cat] = (allCatTotals[e.cat] || 0) + e.amount;
    }));
    const topCats = Object.entries(allCatTotals).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([c]) => c);
    const CAT_COLORS = ['rgba(45,106,79,0.8)','rgba(192,57,43,0.8)','rgba(180,131,10,0.8)','rgba(29,78,216,0.8)','rgba(126,34,206,0.8)'];
    charts.ovCatTrend = new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: months,
        datasets: topCats.map((cat, i) => ({
          label: cat,
          data: months.map(k => state.months[k]?.expenses.filter(e => e.cat === cat).reduce((s,e) => s+e.amount, 0) || 0),
          backgroundColor: CAT_COLORS[i % CAT_COLORS.length]
        }))
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        scales: { x: { stacked: false }, y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
      }
    });
  }

  renderCashFlowBreakdown(months);
}

function renderCashFlowBreakdown(months) {
  const section = document.getElementById('ov-cashflow-section');
  if (!section) return;

  let totalInc = 0;
  const catTotals = {};
  const incSources = {};  // desc → amount, for source nodes

  months.forEach(k => {
    const m = state.months?.[k];
    if (!m) return;
    (m.incomes || []).forEach(t => {
      totalInc += t.amount;
      const key = t.desc || 'Income';
      incSources[key] = (incSources[key] || 0) + t.amount;
    });
    (m.expenses || []).forEach(e => {
      if (e.splits?.length) {
        e.splits.forEach(s => { catTotals[s.cat] = (catTotals[s.cat] || 0) + s.amount; });
      } else {
        catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount;
      }
    });
  });

  if (totalInc <= 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const periodEl = document.getElementById('ov-cashflow-period');
  if (periodEl) periodEl.textContent = months.length > 1 ? `${months[0]} – ${months[months.length - 1]}` : months[0];

  const container = document.getElementById('ov-cashflow-bars');
  if (!container) return;

  // ── Sankey path ──────────────────────────────────────────────
  if (typeof Chart !== 'undefined' && Chart.registry?.controllers?.get('sankey')) {
    destroyChart('ovCashFlow');
    container.innerHTML = '<canvas id="ov-cashflow-chart"></canvas>';
    const ctx = document.getElementById('ov-cashflow-chart')?.getContext('2d');
    if (!ctx) return;

    const CAT_COLORS = ['#4a90e2','#e27d4a','#c67bc6','#e2c84a','#4ac6c6','#e24a7d','#a0a0e2','#6ecba8','#cb6e6e','#8eb5d4','#b5d4a0','#d4a0b5'];
    const totalExp = Object.values(catTotals).reduce((s, v) => s + v, 0);
    const unspent = totalInc - totalExp;

    // Group income sources by stripping trailing " — MonthName" or " — YYYY-MM"
    const MONTH_SUFFIX = /\s*[—–-]\s*(January|February|March|April|May|June|July|August|September|October|November|December|\d{4}-\d{2})$/i;
    const groupedSources = {};
    Object.entries(incSources).forEach(([desc, amt]) => {
      const base = desc.replace(MONTH_SUFFIX, '').trim() || 'Income';
      groupedSources[base] = (groupedSources[base] || 0) + amt;
    });
    const sourceEntries = Object.entries(groupedSources).sort((a, b) => b[1] - a[1]);

    // Cap expense categories at top 7; merge rest into "Other"
    const TOP_N = 7;
    const sortedCats = Object.entries(catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const topCats = sortedCats.slice(0, TOP_N);
    const otherAmt = sortedCats.slice(TOP_N).reduce((s, [, v]) => s + v, 0);
    if (otherAmt > 0) topCats.push(['Other', otherAmt]);

    // Use central "Income" node only when there are multiple distinct income sources
    const MID_NODE = 'Income';
    const useMiddle = sourceEntries.length > 1;
    const singleSrc = sourceEntries[0]?.[0] || 'Income';

    const flowData = [];
    if (useMiddle) {
      sourceEntries.forEach(([desc, amt]) => flowData.push({ from: desc, to: MID_NODE, flow: amt }));
      topCats.forEach(([cat, amt]) => flowData.push({ from: MID_NODE, to: cat, flow: amt }));
      if (unspent > 0) flowData.push({ from: MID_NODE, to: 'Savings', flow: unspent });
    } else {
      topCats.forEach(([cat, amt]) => flowData.push({ from: singleSrc, to: cat, flow: amt }));
      if (unspent > 0) flowData.push({ from: singleSrc, to: 'Savings', flow: unspent });
    }

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2d6a4f';
    const nodeColorMap = {};
    sourceEntries.forEach(([n]) => { nodeColorMap[n] = accentColor; });
    nodeColorMap[MID_NODE] = '#52b788';
    topCats.forEach(([cat], i) => { nodeColorMap[cat] = CAT_COLORS[i % CAT_COLORS.length]; });
    nodeColorMap['Savings'] = '#40916c';
    nodeColorMap['Other'] = '#a0a0a0';

    // Build per-node totals for labels
    const nodeTotals = {};
    flowData.forEach(f => { nodeTotals[f.to] = (nodeTotals[f.to] || 0) + f.flow; });
    sourceEntries.forEach(([n, v]) => { nodeTotals[n] = v; });

    const chart = new Chart(ctx, {
      type: 'sankey',
      data: {
        datasets: [{
          data: flowData,
          colorFrom: c => nodeColorMap[c.dataset.data[c.dataIndex]?.from] || '#888',
          colorTo:   c => nodeColorMap[c.dataset.data[c.dataIndex]?.to]   || '#888',
          colorMode: 'gradient',
          borderWidth: 0,
          nodePadding: 28,
          nodeWidth: 18,
          labels: Object.fromEntries(
            Object.entries(nodeTotals).map(([n, v]) => [n, `${n}\n${fmt(v)}`])
          ),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => {
                const d = c.dataset.data[c.dataIndex];
                const pct = totalInc > 0 ? ((d.flow / totalInc) * 100).toFixed(1) : 0;
                return `${d.from} → ${d.to}: ${fmt(d.flow)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
    window.registerChart?.('ovCashFlow', chart);
    return;
  }

  // ── Fallback: horizontal bars ────────────────────────────────
  const totalExp = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const unspent = totalInc - totalExp;
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const COLORS = ['#4a90e2','#e27d4a','#7bc67e','#c67bc6','#e2c84a','#4ac6c6','#e24a7d','#a0a0e2','#e2a04a','#6ecba8','#cb6e6e','#8eb5d4'];

  let html = `<div class="cf-row cf-row-income">
    <div class="cf-label">Income</div>
    <div class="cf-bar-wrap"><div class="cf-bar cf-bar-income" style="width:100%">
      <span class="cf-bar-label">${fmt(totalInc)}</span>
    </div></div>
  </div>`;
  sorted.forEach(([cat, amount], i) => {
    const pct = Math.max((amount / totalInc) * 100, 0.5).toFixed(1);
    const displayPct = ((amount / totalInc) * 100).toFixed(1);
    html += `<div class="cf-row">
      <div class="cf-label" title="${cat}">${cat}</div>
      <div class="cf-bar-wrap"><div class="cf-bar" style="width:${pct}%;background:${COLORS[i % COLORS.length]}">
        <span class="cf-bar-label">${fmt(amount)} <span class="cf-pct">${displayPct}%</span></span>
      </div></div>
    </div>`;
  });
  if (unspent !== 0) {
    const pct = Math.max((Math.abs(unspent) / totalInc) * 100, 0.5).toFixed(1);
    const color = unspent >= 0 ? 'var(--accent)' : 'var(--red)';
    html += `<div class="cf-row">
      <div class="cf-label" style="color:${color}">${unspent >= 0 ? 'Remaining' : 'Overspent'}</div>
      <div class="cf-bar-wrap"><div class="cf-bar" style="width:${pct}%;background:${color};opacity:0.7">
        <span class="cf-bar-label">${fmt(Math.abs(unspent))}</span>
      </div></div>
    </div>`;
  }
  container.innerHTML = html;
}

// ── FORECAST ────────────────────────────────────────────────

let forecastWhatIf = null; // null = baseline

function buildForecastData(whatIf) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Starting balance: sum of all cash accounts
  const cashBalance = (state.accounts || [])
    .filter(a => a.type === 'cash')
    .reduce((s, a) => s + a.balance, 0);

  // Monthly income: avg of last 3 months
  const recentMonths = state.order.slice(-3);
  const avgMonthlyInc = recentMonths.length
    ? recentMonths.reduce((s, k) => s + (state.months[k]?.incomes.reduce((a,t)=>a+t.amount,0)||0), 0) / recentMonths.length
    : 0;

  // Daily income (spread evenly)
  let dailyInc = avgMonthlyInc / 30.44;

  // Apply what-if modifiers
  let extraMonthlyInc = 0;
  let extraMonthlyExp = 0;
  let excludeCats = [];
  if (whatIf === 'income-500') extraMonthlyInc = 500;
  if (whatIf === 'expense-200') extraMonthlyExp = -200;
  if (whatIf === 'cancel-subscriptions') excludeCats = ['Subscriptions'];

  // Build recurring expense schedule from fixed expenses
  const fixedExpenses = state.fixedExpenses.filter(fe => {
    if (excludeCats.includes(fe.cat)) return false;
    return true;
  });

  // Generate daily balance for 90 days
  const labels = [], balances = [];
  let balance = cashBalance;

  for (let day = 0; day <= 90; day++) {
    const d = new Date(today);
    d.setDate(d.getDate() + day);
    const dom = d.getDate(); // day of month
    const monthProgress = day / 30.44;

    // Add daily income slice
    balance += dailyInc + (extraMonthlyInc / 30.44) + (extraMonthlyExp / 30.44);

    // Deduct fixed expenses on their approximate due date (day 1 of month)
    if (dom === 1 && day > 0) {
      fixedExpenses.forEach(fe => {
        const freq = fe.frequency || 'monthly';
        if (freq === 'monthly') balance -= fe.amount;
        else if (freq === 'biweekly' && Math.floor(day / 14) % 1 === 0) balance -= fe.amount;
        else if (freq === 'quarterly' && Math.round(monthProgress) % 3 === 0) balance -= fe.amount;
        else if (freq === 'annual' && Math.round(monthProgress) % 12 === 0) balance -= fe.amount;
      });
    }

    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    balances.push(Math.round(balance * 100) / 100);
  }

  return { labels, balances, cashBalance, avgMonthlyInc };
}

function applyWhatIf(scenario) {
  forecastWhatIf = scenario === 'reset' ? null : scenario;
  document.dispatchEvent(new CustomEvent('ks:forecast-render'));
}

// ── OVERVIEW ────────────────────────────────────────────────
function applyDateRange() {
  const from = document.getElementById('range-from').value;
  const to = document.getElementById('range-to').value;
  if (!from || !to || from > to) {
    alert('Invalid date range');
    return;
  }
  overviewMonths = state.order.filter(k => k >= from && k <= to);
  render();
}

function resetDateRange() {
  overviewMonths = state.order.slice();
  document.getElementById('range-from').value = '';
  document.getElementById('range-to').value = '';
  render();
}

// ── AI ADVISOR ──────────────────────────────────────────────
// The assistant itself lives in src/ai/ (snapshot, providers, chat).
function toggleAI() {
  state.settings.aiEnabled = !state.settings.aiEnabled;
  saveData();
  render();
}


// ── EXPORT / IMPORT ─────────────────────────────────────────
function showToast(msg, duration = 3000, type = 'default') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;opacity:0;transition:opacity 0.2s;pointer-events:none;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.18);';
  if (type !== 'default') el.classList.add(`toast-${type}`);
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, duration);
}

function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportJSON() {
  triggerDownload(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'myledger_backup.json');
}

function exportCSVTx() {
  const rows = [['month','type','amount','category','description','date','tags']];
  state.order.forEach(k => {
    const m = state.months[k];
    m.incomes.forEach(t => rows.push([k,'income',t.amount,'',t.desc||'',t.date,(t.tags||[]).join(';')]));
    m.expenses.forEach(t => rows.push([k,'expense',t.amount,t.cat,t.desc||'',t.date,(t.tags||[]).join(';')]));
  });
  triggerDownload(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), 'myledger_transactions.csv');
}

function exportCSVSummary() {
  const rows = [['month','income','expense','budget','remaining','balance','rolling_balance']];
  let rolling = 0;
  state.order.forEach(k => {
    const m = state.months[k];
    const inc = m.incomes.reduce((s,t)=>s+t.amount,0);
    const exp = m.expenses.reduce((s,t)=>s+t.amount,0);
    rolling += (inc - exp);
    rows.push([k, inc, exp, m.budget, m.budget - exp, m.balance, rolling]);
  });
  triggerDownload(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), 'myledger_summary.csv');
}

function exportPDF() {
  // Set up print header
  const header = document.getElementById('print-header');
  let title = 'MyLedger Report';
  if (activeView === 'month' && activeMonth) title = `MyLedger — ${activeMonth}`;
  else if (activeView === 'overview') title = 'MyLedger — Financial Overview';
  else if (activeView === 'fixed') title = 'MyLedger — Fixed Expenses';
  else if (activeView === 'networth') title = 'MyLedger — Net Worth';
  header.innerHTML = `<h2>${title}</h2><p>Generated ${new Date().toLocaleDateString()}</p>`;

  // Mark the active view for printing
  const views = ['month-view', 'overview-view', 'fixed-view', 'networth-view'];
  const activeId = activeView === 'month' ? 'month-view' : activeView === 'overview' ? 'overview-view' : activeView === 'fixed' ? 'fixed-view' : 'networth-view';
  views.forEach(v => document.getElementById(v).classList.remove('print-active'));
  document.getElementById(activeId).classList.add('print-active');

  window.print();

  // Cleanup after print
  setTimeout(() => {
    views.forEach(v => document.getElementById(v).classList.remove('print-active'));
    render();
  }, 500);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.months || !parsed.categories) throw new Error('Invalid');
      // Always merge — never replace existing data
      let addedMonths = 0, addedTx = 0;
      Object.keys(parsed.months).forEach(k => {
        if (!state.months[k]) {
          state.months[k] = parsed.months[k];
          if (!state.order.includes(k)) state.order.push(k);
          addedMonths++;
          addedTx += (parsed.months[k].incomes?.length || 0) + (parsed.months[k].expenses?.length || 0);
        } else {
          // Month exists — append only transactions not already present (dedupe by amount+date+desc)
          const m = state.months[k];
          const txKey = t => `${t.amount}|${t.date}|${(t.desc||'').trim()}`;
          const existingInc = new Set((m.incomes || []).map(txKey));
          const existingExp = new Set((m.expenses || []).map(txKey));
          (parsed.months[k].incomes || []).forEach(t => {
            if (!existingInc.has(txKey(t))) { m.incomes.push(t); addedTx++; }
          });
          (parsed.months[k].expenses || []).forEach(t => {
            if (!existingExp.has(txKey(t))) { m.expenses.push(t); addedTx++; }
          });
        }
      });
      state.order.sort();
      parsed.categories.forEach(c => { if (!state.categories.includes(c)) state.categories.push(c); });
      (parsed.fixedExpenses || []).forEach(fe => {
        if (!state.fixedExpenses.find(f => f.desc === fe.desc && f.amount === fe.amount && f.frequency === fe.frequency))
          state.fixedExpenses.push(fe);
      });
      (parsed.knownTags || []).forEach(t => { if (!state.knownTags.includes(t)) state.knownTags.push(t); });
      state.knownTags.sort();
      (parsed.assets || []).forEach(a => { if (!state.assets.find(x => x.name === a.name)) state.assets.push(a); });
      (parsed.liabilities || []).forEach(l => { if (!state.liabilities.find(x => x.name === l.name)) state.liabilities.push(l); });
      (parsed.accounts || []).forEach(a => { if (!(state.accounts||[]).find(x => x.name === a.name)) { if (!state.accounts) state.accounts = []; state.accounts.push(a); } });
      (parsed.goals || []).forEach(g => { if (!(state.goals||[]).find(x => x.name === g.name)) { if (!state.goals) state.goals = []; state.goals.push(g); } });
      saveData();
      activeMonth = state.order[state.order.length - 1] || null;
      render();
      // Brief merge summary toast
      showToast(`Merged: ${addedMonths} new month${addedMonths !== 1 ? 's' : ''}, ${addedTx} new transaction${addedTx !== 1 ? 's' : ''}`);
    } catch(err) {
      alert('Import failed: invalid file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function saveThresholds() {
  state.settings.lowSavings = parseFloat(document.getElementById('threshold-savings').value) || 10;
  state.settings.expenseSpikePct = parseFloat(document.getElementById('threshold-spike').value) || 10;
  state.settings.largeTxPct = parseFloat(document.getElementById('threshold-large').value) || 20;
  saveData();
  render();
}

// ── CSV IMPORT ──────────────────────────────────────────────
let csvParsedData = null;
let csvColumnMap = { date: -1, amount: -1, debit: -1, credit: -1, description: -1, category: -1, merchant: -1, type: -1 };
let csvRowOverrides = {}; // { rowIndex: { cat, isIncome } }

const BANK_CATEGORY_MAP = {
  'dining & entertainment': 'Dining Out',
  'utilities': 'Utilities',
  'loans': 'Other',
  'transfers & payments': 'Other',
  'deposits': null,       // income — no expense category
  'savings & investments': 'Other',
  'insurance': 'Insurance',
  'healthcare': 'Healthcare',
  'groceries': 'Groceries',
  'transportation': 'Transportation',
  'travel': 'Transportation',
  'shopping': 'Shopping',
  'personal care': 'Personal Care',
  'entertainment': 'Entertainment',
  'subscriptions': 'Subscriptions',
  'other': 'Other'
};

function mapBankCategory(bankCat) {
  if (!bankCat) return 'Other';
  const lc = bankCat.toLowerCase().trim();
  // Exact match
  if (BANK_CATEGORY_MAP[lc] !== undefined) return BANK_CATEGORY_MAP[lc] || 'Other';
  // Partial match
  for (const key of Object.keys(BANK_CATEGORY_MAP)) {
    if (lc.includes(key) || key.includes(lc)) return BANK_CATEGORY_MAP[key] || 'Other';
  }
  // Sub-category keyword fallback
  if (lc.includes('food') || lc.includes('restaurant') || lc.includes('fast food') || lc.includes('dining')) return 'Dining Out';
  if (lc.includes('phone') || lc.includes('internet') || lc.includes('cable')) return 'Utilities';
  if (lc.includes('student') || lc.includes('loan')) return 'Other';
  if (lc.includes('invest') || lc.includes('brokerage')) return 'Other';
  return 'Other';
}

// Returns a signed amount string from a CSV row, handling both single-column
// and split Debit/Credit formats (e.g. Capital One).
function getCSVAmountRaw(r) {
  if (csvColumnMap.amount >= 0) return (r[csvColumnMap.amount] || '').trim();
  // Split debit/credit columns: debit = expense (negative), credit = income (positive)
  const debitStr = csvColumnMap.debit >= 0 ? (r[csvColumnMap.debit] || '').trim() : '';
  const creditStr = csvColumnMap.credit >= 0 ? (r[csvColumnMap.credit] || '').trim() : '';
  const credit = parseFloat(creditStr.replace(/[^0-9.]/g, ''));
  const debit = parseFloat(debitStr.replace(/[^0-9.]/g, ''));
  if (!isNaN(credit) && credit > 0) return String(credit);   // income
  if (!isNaN(debit) && debit > 0) return String(-debit);     // expense
  return '';
}

function parseBankAmount(raw) {
  if (!raw) return NaN;
  const s = raw.trim();
  // ($2.99) or (2.99) — parentheses = negative; or leading minus sign
  const isNeg = /^\(/.test(s) || s.startsWith('-');
  const clean = s.replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? NaN : (isNeg ? -val : val);
}

function scoreBestDescriptionColumn(headers, rows = []) {
  // Score each column for suitability as a human-readable description
  const nameWeights = { merchant: 10, 'merchant name': 10, name: 7, description: 6, desc: 6, memo: 5, note: 5, 'full description': 3, details: 3, narrative: 3 };
  const scores = headers.map((h, colIdx) => {
    const lc = h.toLowerCase().trim();
    let score = nameWeights[lc] || 0;
    // Partial name match
    if (!score) {
      for (const [key, w] of Object.entries(nameWeights)) {
        if (lc.includes(key)) { score = Math.max(score, w - 1); }
      }
    }
    // Data quality check on up to 10 sample rows
    const sample = rows.slice(0, 10);
    let filled = 0, goodLen = 0, hexCount = 0;
    sample.forEach(r => {
      const v = (r[colIdx] || '').trim();
      if (v.length > 0) filled++;
      if (v.length >= 3 && v.length <= 50) goodLen++;
      if (/^[0-9a-f-]{8,}$/i.test(v)) hexCount++;
    });
    const n = sample.length || 1;
    score += (filled / n) * 3;   // reward non-empty
    score += (goodLen / n) * 2;  // reward reasonable length
    score -= (hexCount / n) * 5; // penalise hex/ID columns
    return { colIdx, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 ? scores[0].colIdx : -1;
}

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      lines.length === 0 ? (lines.push([current]), current = '') : (lines[lines.length - 1].push(current), current = '');
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (lines.length === 0) lines.push([current]);
      else lines[lines.length - 1].push(current);
      current = '';
      lines.push([]);
    } else {
      current += ch;
    }
  }
  if (current || (lines.length && lines[lines.length - 1].length > 0)) {
    if (lines.length === 0) lines.push([current]);
    else lines[lines.length - 1].push(current);
  }
  return lines.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function autoDetectColumns(headers, rows) {
  const map = { date: -1, amount: -1, debit: -1, credit: -1, description: -1, category: -1, merchant: -1, type: -1 };
  headers.forEach((h, i) => {
    const lc = h.toLowerCase().trim();
    // Date — prefer 'posted date' over 'transaction date'
    if (lc === 'posted date') { map.date = i; }
    else if (lc === 'transaction date' && map.date === -1) { map.date = i; }
    else if (lc.includes('date') && map.date === -1) { map.date = i; }
    // Amount (single column)
    if (lc === 'amount' || lc === 'value' || lc === 'sum' || lc === 'total') map.amount = i;
    else if ((lc.includes('amount') || lc.includes('value')) && map.amount === -1) map.amount = i;
    // Debit / Credit split columns (e.g. Capital One)
    if (lc === 'debit') map.debit = i;
    if (lc === 'credit') map.credit = i;
    // Category
    if (lc === 'category name' || lc === 'category') map.category = i;
    else if (lc.includes('cat') && map.category === -1) map.category = i;
    // Merchant (separate from description)
    if (lc === 'merchant name' || lc === 'merchant') map.merchant = i;
    // Transaction type (Credit/Debit)
    if (lc === 'transaction type' || lc === 'type') map.type = i;
  });
  // Dynamic best-description column (avoids hardcoding)
  map.description = scoreBestDescriptionColumn(headers, rows);
  return map;
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const rows = parseCSV(text);
    if (rows.length < 2) { alert('CSV file is empty or has no data rows.'); return; }
    csvParsedData = { headers: rows[0], rows: rows.slice(1) };
    csvColumnMap = autoDetectColumns(csvParsedData.headers, csvParsedData.rows);
    csvRowOverrides = {};
    showCSVPreview();
  };
  reader.readAsText(file);
  event.target.value = '';
}

function showCSVPreview() {
  if (!csvParsedData) return;
  const modal = document.getElementById('csv-modal');
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
  // Disable all background elements so clicks cannot pass through
  document.querySelector('.sidebar')?.setAttribute('inert', '');
  document.querySelector('.main')?.setAttribute('inert', '');
  document.querySelector('.ai-side-panel')?.setAttribute('inert', '');

  // Populate account-link dropdown
  const linkSel = document.getElementById('csv-link-account');
  if (linkSel) {
    const accounts = state.accounts || [];
    linkSel.innerHTML = '<option value="">— Don\'t link to an account —</option>' +
      accounts.map(a => `<option value="${a.id}">${a.name} (${fmt(a.balance)})</option>`).join('') +
      '<option value="__new__">+ Create a new account…</option>';
    const linkStep = document.getElementById('csv-link-step');
    if (linkStep) linkStep.style.display = 'flex';
  }

  // Column mapping selects
  const mappingDiv = document.getElementById('csv-mapping');
  const fields = ['date', 'amount', 'description', 'merchant', 'category', 'type'];
  const fieldLabels = { date: 'Date', amount: 'Amount', description: 'Description', merchant: 'Merchant (desc override)', category: 'Bank Category', type: 'Tx Type (Credit/Debit)' };
  const cols = csvParsedData.headers;
  mappingDiv.innerHTML = '<label style="font-size:0.8rem;font-weight:600;width:100%;">Target Month</label>' +
    '<select id="csv-target-month" style="padding:4px 8px;border-radius:6px;border:1px solid var(--paper3);font-size:0.8rem;margin-bottom:8px;">' +
    '<option value="__auto__"' + (true ? ' selected' : '') + '>Auto-detect from date</option>' +
    (activeMonth ? `<option value="${activeMonth}">${activeMonth}</option>` : '') +
    state.order.filter(k => k !== activeMonth).map(k => `<option value="${k}">${k}</option>`).join('') +
    '</select>' +
    fields.map(f => {
      const opts = cols.map((c, i) => `<option value="${i}"${csvColumnMap[f] === i ? ' selected' : ''}>${c}</option>`).join('');
      return `<label>${fieldLabels[f]}<select onchange="csvColumnMap.${f}=parseInt(this.value);csvRowOverrides={};refreshCSVPreview()">${'<option value="-1">— skip —</option>' + opts}</select></label>`;
    }).join('');

  // Auto-flag known payment/transfer patterns as transfers (user can click to override)
  const TRANSFER_KEYWORDS = /\b(mobile\s*pay[mt]+|autopay|auto\s*pay|online\s*pay(ment)?|ach\s*(payment|debit|credit)|wire\s*(transfer)?|account\s*transfer|bank\s*transfer|zelle|venmo|cash\s*app|paypal\s*transfer)\b/i;
  // If the linked account is a credit card, also flag any positive amount row that isn't
  // a cash-back/reward as a transfer (it's a payment to the card, not income)
  const REWARD_KEYWORDS = /\b(cash\s*back|reward|rebate|refund|return|credit)\b/i;
  const linkAcctForDetect = (state.accounts || []).find(a => a.id === (document.getElementById('csv-link-account')?.value || ''));
  const linkedIsCreditCard = linkAcctForDetect?.type === 'credit';
  csvParsedData.rows.forEach((r, i) => {
    if (csvRowOverrides[i]?.txType) return; // don't overwrite explicit user choice
    const descCol = csvColumnMap.description >= 0 ? r[csvColumnMap.description] : '';
    const merchCol = csvColumnMap.merchant >= 0 ? r[csvColumnMap.merchant] : '';
    const desc = (descCol || merchCol || '').trim();
    const amtRaw = getCSVAmountRaw(r);
    const amt = parseBankAmount(amtRaw);
    if (TRANSFER_KEYWORDS.test(desc)) {
      csvRowOverrides[i] = { ...(csvRowOverrides[i] || {}), txType: 'transfer' };
    } else if (linkedIsCreditCard && !isNaN(amt) && amt > 0 && !REWARD_KEYWORDS.test(desc)) {
      // Positive amount on a CC account = payment received = transfer in from another account
      csvRowOverrides[i] = { ...(csvRowOverrides[i] || {}), txType: 'transfer' };
    }
  });

  refreshCSVPreview();
}

function refreshCSVPreview() {
  const head = document.getElementById('csv-preview-head');
  const body = document.getElementById('csv-preview-body');
  const stats = document.getElementById('csv-stats');
  const rows = csvParsedData.rows;
  const maxPreview = Math.min(rows.length, 15);
  const catOpts = DEFAULT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

  head.innerHTML = '<tr><th>#</th><th>Date</th><th>Desc / Merchant</th><th>Amount</th><th>Category</th><th>Type</th></tr>';

  let totalValid = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const amtRaw = getCSVAmountRaw(r);
    const amt = parseBankAmount(amtRaw);
    if (!isNaN(amt) && amt !== 0) totalValid++;
  }

  const previewRows = [];
  for (let i = 0; i < maxPreview; i++) {
    const r = rows[i];
    const dateVal = csvColumnMap.date >= 0 ? (r[csvColumnMap.date] || '').trim() : '';
    const amtRaw = getCSVAmountRaw(r);
    const amt = parseBankAmount(amtRaw);
    const isValid = !isNaN(amt) && amt !== 0;

    // Description: prefer merchant column if mapped, else description column
    const merchantVal = csvColumnMap.merchant >= 0 ? (r[csvColumnMap.merchant] || '').trim() : '';
    const descVal = csvColumnMap.description >= 0 ? (r[csvColumnMap.description] || '').trim() : '';
    const displayDesc = merchantVal || descVal;

    // Income/expense: use type column first, then amount sign
    const typeVal = csvColumnMap.type >= 0 ? (r[csvColumnMap.type] || '').trim().toLowerCase() : '';
    let overrideIncome = csvRowOverrides[i]?.isIncome;
    let isIncome;
    if (overrideIncome !== undefined) {
      isIncome = overrideIncome;
    } else if (typeVal === 'credit') {
      isIncome = true;
    } else if (typeVal === 'debit' || typeVal === 'pos' || typeVal === 'atm') {
      isIncome = false;
    } else {
      isIncome = isValid && amt > 0;
    }

    // Category: check row override, then bank category map, then default
    let cat;
    if (csvRowOverrides[i]?.cat !== undefined) {
      cat = csvRowOverrides[i].cat;
    } else {
      const bankCat = csvColumnMap.category >= 0 ? (r[csvColumnMap.category] || '').trim() : '';
      cat = isIncome ? '(Income)' : (mapBankCategory(bankCat) || 'Other');
    }

    const tr = document.createElement('tr');
    if (!isValid) tr.style.opacity = '0.45';

    const cells = [i + 1, dateVal, displayDesc, isValid ? (isIncome ? '+' : '-') + Math.abs(amt).toFixed(2) : amtRaw];
    cells.forEach((val, idx) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (idx === 3 && !isValid) td.classList.add('csv-err');
      tr.appendChild(td);
    });

    // Category cell — editable select (skipped for income rows)
    const catTd = document.createElement('td');
    if (isValid && !isIncome) {
      catTd.innerHTML = `<select class="csv-cat-sel" onchange="csvRowOverrides[${i}]={...(csvRowOverrides[${i}]||{}),cat:this.value}"><option value="">— map —</option>${catOpts}</select>`;
      catTd.querySelector('select').value = cat;
    } else {
      catTd.textContent = isIncome ? '' : cat;
    }
    tr.appendChild(catTd);

    // Type badge — 3-state cycle: income → expense → transfer
    const txTypeOverride = csvRowOverrides[i]?.txType;
    let displayType;
    if (txTypeOverride) {
      displayType = txTypeOverride;
    } else {
      displayType = isIncome ? 'income' : 'expense';
    }
    const typeTd = document.createElement('td');
    if (isValid) {
      const nextType = displayType === 'income' ? 'expense' : displayType === 'expense' ? 'transfer' : 'income';
      const badgeClass = displayType === 'income' ? 'csv-income' : displayType === 'transfer' ? 'csv-transfer' : 'csv-expense';
      const badgeLabel = displayType === 'income' ? '▲ Income' : displayType === 'transfer' ? '↔ Transfer' : '▼ Expense';
      let xfrAcctHtml = '';
      if (displayType === 'transfer') {
        const accounts = state.accounts || [];
        const linkAcctId = document.getElementById('csv-link-account')?.value || '';
        const acctOpts = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        xfrAcctHtml =
          `<select class="csv-cat-sel" style="margin-top:4px;" id="csv-from-acct-${i}" onchange="csvRowOverrides[${i}]={...(csvRowOverrides[${i}]||{}),fromAccountId:this.value}"><option value="">← From account…</option>${acctOpts}</select>` +
          `<select class="csv-cat-sel" style="margin-top:4px;" id="csv-to-acct-${i}" onchange="csvRowOverrides[${i}]={...(csvRowOverrides[${i}]||{}),toAccountId:this.value}"><option value="">→ To account…</option>${acctOpts}</select>`;
      }
      typeTd.innerHTML = `<span class="csv-type-badge ${badgeClass}" onclick="csvRowOverrides[${i}]={...(csvRowOverrides[${i}]||{}),txType:'${nextType}'};refreshCSVPreview()" title="Click to cycle">${badgeLabel}</span>${xfrAcctHtml}`;
      if (displayType === 'transfer') {
        const linkAcctId = document.getElementById('csv-link-account')?.value || '';
        const fromSel = typeTd.querySelector(`#csv-from-acct-${i}`);
        if (fromSel && csvRowOverrides[i]?.fromAccountId) fromSel.value = csvRowOverrides[i].fromAccountId;
        const toSel = typeTd.querySelector(`#csv-to-acct-${i}`);
        if (toSel) toSel.value = csvRowOverrides[i]?.toAccountId || linkAcctId;
      }
    } else {
      typeTd.textContent = '—';
    }
    tr.appendChild(typeTd);
    previewRows.push(tr);
  }

  body.innerHTML = '';
  previewRows.forEach(tr => body.appendChild(tr));

  // Dedup detection: scan for potential transfer matches against existing data
  const linkAccountId = document.getElementById('csv-link-account')?.value || '';
  if (linkAccountId && (state.accounts || []).length >= 2) {
    const previewTxns = rows.slice(0, rows.length).map((r, i) => {
      const amtRaw = getCSVAmountRaw(r);
      const amt = parseBankAmount(amtRaw);
      const dateVal = csvColumnMap.date >= 0 ? (r[csvColumnMap.date] || '').trim() : '';
      const parsedDate = dateVal ? new Date(dateVal) : new Date();
      const desc = (csvColumnMap.merchant >= 0 ? r[csvColumnMap.merchant] : '') || (csvColumnMap.description >= 0 ? r[csvColumnMap.description] : '') || '';
      return { amount: -Math.abs(amt), desc: (desc || '').trim(), date: parsedDate.toISOString() };
    }).filter(t => !isNaN(t.amount) && t.amount !== 0);
    const candidates = detectPotentialTransfers(previewTxns, linkAccountId);
    window.__csvDedupCandidates = candidates;
    renderCSVDedupSection(candidates, previewTxns);
  } else {
    const sec = document.getElementById('csv-dedup-section');
    if (sec) sec.style.display = 'none';
  }

  const aiBtn = document.getElementById('csv-ai-suggest-btn');
  if (aiBtn) aiBtn.style.display = state.settings.aiEnabled ? 'inline-flex' : 'none';

  stats.textContent = `${totalValid} valid of ${rows.length} rows` + (rows.length > maxPreview ? ` (showing first ${maxPreview})` : '');
}

function confirmCSVImport() {
  if (!csvParsedData) return;
  // Guard: if user chose "+ Create new account" but didn't complete it, treat as no link
  const rawLinkId = document.getElementById('csv-link-account')?.value || '';
  if (rawLinkId === '__new__') {
    alert('Please finish creating the new account first, or choose an existing account.');
    return;
  }
  const targetMonth = document.getElementById('csv-target-month')?.value || activeMonth;
  const rows = csvParsedData.rows;
  const txns = [];

  rows.forEach((r, i) => {
    const amtRaw = getCSVAmountRaw(r);
    const amt = parseBankAmount(amtRaw);
    if (isNaN(amt) || amt === 0) return;

    const dateVal = csvColumnMap.date >= 0 ? (r[csvColumnMap.date] || '').trim() : '';
    const parsedDate = dateVal ? new Date(dateVal) : new Date();
    const isoDate = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

    let monthKey = targetMonth;
    if (targetMonth === '__auto__' && !isNaN(parsedDate.getTime())) {
      monthKey = parsedDate.toISOString().slice(0, 7);
    }
    if (!monthKey || monthKey === '__auto__') monthKey = activeMonth || new Date().toISOString().slice(0, 7);

    // Description: prefer merchant column over description column
    const merchantVal = csvColumnMap.merchant >= 0 ? (r[csvColumnMap.merchant] || '').trim() : '';
    const descVal = csvColumnMap.description >= 0 ? (r[csvColumnMap.description] || '').trim() : '';
    const desc = merchantVal || descVal;

    // Income/expense/transfer detection: row override > type column > amount sign
    const txTypeOverride = csvRowOverrides[i]?.txType;
    const typeVal = csvColumnMap.type >= 0 ? (r[csvColumnMap.type] || '').trim().toLowerCase() : '';
    let isTransfer = txTypeOverride === 'transfer';
    let isIncome;
    if (isTransfer) {
      isIncome = false;
    } else if (txTypeOverride === 'income') {
      isIncome = true;
    } else if (txTypeOverride === 'expense') {
      isIncome = false;
    } else if (csvRowOverrides[i]?.isIncome !== undefined) {
      isIncome = csvRowOverrides[i].isIncome;
    } else if (typeVal === 'credit') {
      isIncome = true;
    } else if (typeVal === 'debit' || typeVal === 'pos' || typeVal === 'atm') {
      isIncome = false;
    } else {
      isIncome = amt > 0;
    }

    // Category: row override > bank category map
    let cat = 'Other';
    if (!isIncome) {
      if (csvRowOverrides[i]?.cat) {
        cat = csvRowOverrides[i].cat;
      } else {
        const bankCat = csvColumnMap.category >= 0 ? (r[csvColumnMap.category] || '').trim() : '';
        cat = mapBankCategory(bankCat);
      }
    }

    // Normalise sign: income = positive, expense = negative
    const finalAmt = isIncome ? Math.abs(amt) : -Math.abs(amt);
    const toAccountId = isTransfer ? (csvRowOverrides[i]?.toAccountId || '') : '';
    const fromAccountId = isTransfer ? (csvRowOverrides[i]?.fromAccountId || '') : '';
    txns.push({ amount: finalAmt, desc, cat, date: isoDate, monthKey, tags: [], isTransfer, fromAccountId, toAccountId });
  });

  if (txns.length === 0) { alert('No valid transactions found.'); return; }
  state.settings.lastCsvImport = Date.now();

  // Account linking: stamp accountId on each transaction, then derive balance from tx history
  const linkAccountId = document.getElementById('csv-link-account')?.value || '';
  const linkAcct = (state.accounts || []).find(a => a.id === linkAccountId);
  const linkIsCreditCard = linkAcct?.type === 'credit';
  const transfers = [];
  const regularTxns = [];
  txns.forEach(t => {
    if (t.isTransfer) {
      // For CC accounts: payment comes FROM another account TO the CC (linked account)
      // For checking/savings: transfer goes FROM the linked account TO another account
      let fromId = t.fromAccountId;
      let toId = t.toAccountId;
      if (!fromId && !toId) {
        // No accounts specified at all — fall back to expense
        t.isTransfer = false; regularTxns.push(t); return;
      }
      if (linkIsCreditCard) {
        // CC = destination of payment: from = other account (fromId or leave blank), to = CC
        if (!toId) toId = linkAccountId;
        if (!fromId) fromId = '';
      } else {
        // Checking/savings = source: from = linked account, to = destination
        if (!fromId) fromId = linkAccountId;
      }
      if (!toId) { t.isTransfer = false; regularTxns.push(t); return; }
      transfers.push({ amount: Math.abs(t.amount), desc: t.desc, date: t.date, monthKey: t.monthKey, tags: [], fromAccountId: fromId, toAccountId: toId });
    } else {
      if (linkAccountId) t.accountId = linkAccountId;
      regularTxns.push(t);
    }
  });

  if (regularTxns.length > 0) addBulkTransactions(regularTxns);
  if (transfers.length > 0) addBulkTransfers(transfers);

  const syncIds = new Set([linkAccountId, ...transfers.map(t => t.toAccountId)].filter(Boolean));
  syncIds.forEach(id => syncLinkedAccount(id));
  if (linkAccountId) saveData();

  closeCSVModal();
  const total = regularTxns.length + transfers.length;
  const xfrNote = transfers.length > 0 ? ` · ${transfers.length} transfer${transfers.length !== 1 ? 's' : ''}` : '';
  showToast(`Imported ${total} transaction${total !== 1 ? 's' : ''}${xfrNote}${linkAccountId ? ' · linked to account' : ''}`);
  // Gap 3: show subscription review modal after import if recurring charges detected
  const detected = detectRecurringTransactions();
  if (detected.length) showSubscriptionModal(detected);
}

function addBulkTransactions(txns) {
  txns.forEach(t => {
    if (!state.months[t.monthKey]) createMonth(t.monthKey);
    const m = state.months[t.monthKey];
    if (t.amount > 0) {
      m.incomes.push({ amount: t.amount, desc: t.desc, date: t.date, tags: t.tags || [], ...(t.accountId ? { accountId: t.accountId } : {}) });
    } else {
      m.expenses.push({ amount: Math.abs(t.amount), desc: t.desc, cat: t.cat || 'Other', date: t.date, tags: t.tags || [], ...(t.accountId ? { accountId: t.accountId } : {}) });
    }
  });
  const affectedMonths = new Set(txns.map(t => t.monthKey));
  affectedMonths.forEach(mk => { recalcBalance(mk); syncLinkedAccountForMonth(mk); });
  saveData();
  render();
}

function detectPotentialTransfers(newTxns, linkAccountId) {
  // Find debit entries in new import that match an existing income in another account (same amount ±1%, within 3 days)
  const candidates = [];
  newTxns.forEach((t, ni) => {
    if (t.amount >= 0) return; // only debits
    const absAmt = Math.abs(t.amount);
    const newDate = new Date(t.date);
    state.order.forEach(mk => {
      const m = state.months[mk];
      (m.incomes || []).forEach((ex) => {
        if (!ex.accountId || ex.accountId === linkAccountId) return;
        const diff = Math.abs(ex.amount - absAmt) / absAmt;
        if (diff > 0.01) return;
        const daysDiff = Math.abs((new Date(ex.date) - newDate) / 86400000);
        if (daysDiff <= 3) {
          candidates.push({ newTxnIndex: ni, newDesc: t.desc, newAmt: absAmt, existingAcctId: ex.accountId, existingDesc: ex.desc, existingDate: ex.date });
        }
      });
    });
  });
  return candidates;
}

function renderCSVDedupSection(candidates, newTxns) {
  const sec = document.getElementById('csv-dedup-section');
  if (!sec) return;
  if (!candidates || candidates.length === 0) { sec.style.display = 'none'; return; }
  const accounts = state.accounts || [];
  const html = candidates.map((c, ci) => {
    const fromName = accounts.find(a => a.id === (document.getElementById('csv-link-account')?.value || ''))?.name || 'Import account';
    const toName = accounts.find(a => a.id === c.existingAcctId)?.name || c.existingAcctId;
    return `<div class="csv-dedup-row">
      <div class="csv-dedup-info">
        <span class="csv-dedup-badge">↔ Possible Transfer</span>
        <strong>${fmt(c.newAmt)}</strong> · "${c.newDesc}" (import)
        matches "${c.existingDesc}" in <em>${toName}</em>
      </div>
      <div class="csv-dedup-btns">
        <button class="csv-dedup-mark" onclick="csvRowOverrides[${c.newTxnIndex}]={...(csvRowOverrides[${c.newTxnIndex}]||{}),txType:'transfer',toAccountId:'${c.existingAcctId}'};renderCSVDedupSection(window.__csvDedupCandidates||[],[]);refreshCSVPreview()">✔ Mark as Transfer</button>
        <button class="csv-dedup-skip" onclick="csvRowOverrides[${c.newTxnIndex}]={...(csvRowOverrides[${c.newTxnIndex}]||{}),txType:'expense'};document.querySelector('.csv-dedup-row:nth-child(${ci+1})').remove()">✕ Keep as-is</button>
      </div>
    </div>`;
  }).join('');
  sec.style.display = 'block';
  sec.innerHTML = `<div class="csv-dedup-section-wrap"><div class="csv-dedup-header">⚠️ ${candidates.length} possible transfer${candidates.length !== 1 ? 's' : ''} detected — review before importing</div>${html}</div>`;
}

async function askAICategories() {
  if (!csvParsedData) return;
  const btn = document.getElementById('csv-ai-suggest-btn');
  if (btn) { btn.textContent = '✦ Thinking…'; btn.disabled = true; }
  const rows = csvParsedData.rows;
  const catList = DEFAULT_CATEGORIES.join(', ');
  const items = rows.slice(0, 30).map((r, i) => {
    const merchantVal = csvColumnMap.merchant >= 0 ? (r[csvColumnMap.merchant] || '').trim() : '';
    const descVal = csvColumnMap.description >= 0 ? (r[csvColumnMap.description] || '').trim() : '';
    const bankCat = csvColumnMap.category >= 0 ? (r[csvColumnMap.category] || '').trim() : '';
    const amtRaw = csvColumnMap.amount >= 0 ? (r[csvColumnMap.amount] || '').trim() : '';
    const amt = parseBankAmount(amtRaw);
    const typeVal = csvColumnMap.type >= 0 ? (r[csvColumnMap.type] || '').trim().toLowerCase() : '';
    const isIncome = typeVal === 'credit' || (!typeVal && !isNaN(amt) && amt > 0);
    if (isIncome) return null;
    return `${i}: "${merchantVal || descVal}" (bank: "${bankCat}")`;
  }).filter(Boolean);

  const prompt = `You are a personal finance categorizer. Assign each transaction to exactly one category from: [${catList}]. Return ONLY a valid JSON object mapping row index to category string. No explanation.\n\nTransactions:\n${items.join('\n')}`;
  try {
    const reply = await window.askAIRaw(prompt);
    const match = reply.match(/\{[\s\S]*\}/);
    if (match) {
      const suggestions = JSON.parse(match[0]);
      Object.entries(suggestions).forEach(([idx, cat]) => {
        if (DEFAULT_CATEGORIES.includes(cat)) {
          csvRowOverrides[parseInt(idx)] = { ...(csvRowOverrides[parseInt(idx)] || {}), cat };
        }
      });
      refreshCSVPreview();
      showToast('✦ AI categories applied — review and adjust as needed');
    }
  } catch(err) {
    showToast('AI suggestion failed — try again');
  }
  if (btn) { btn.innerHTML = '✦ AI Suggest'; btn.disabled = false; }
}

function closeCSVModal() {
  document.getElementById('csv-modal').style.display = 'none';
  // Re-enable background elements
  document.querySelector('.sidebar')?.removeAttribute('inert');
  document.querySelector('.main')?.removeAttribute('inert');
  document.querySelector('.ai-side-panel')?.removeAttribute('inert');
  csvParsedData = null;
  csvRowOverrides = {};
}

function handleCSVAccountChange(val) {
  const form = document.getElementById('csv-new-account-form');
  if (!form) return;
  if (val === '__new__') {
    form.style.display = 'block';
    document.getElementById('csv-new-acct-name')?.focus();
  } else {
    form.style.display = 'none';
    // Re-run auto-detection whenever the linked account changes — CC vs non-CC affects which rows are flagged as transfers
    if (csvParsedData) {
      csvRowOverrides = {};
      if (document.getElementById('csv-preview-head')) showCSVPreview();
    }
  }
}

function createAccountFromCSV() {
  const name = (document.getElementById('csv-new-acct-name')?.value || '').trim();
  const type = document.getElementById('csv-new-acct-type')?.value || 'cash';
  const balance = parseFloat(document.getElementById('csv-new-acct-balance')?.value) || 0;
  if (!name) { alert('Please enter an account name.'); return; }
  const id = 'acct-' + Date.now();
  if (!state.accounts) state.accounts = [];
  state.accounts.push({ id, name, type, balance, baseBalance: balance });
  saveData();
  // Refresh the dropdown and select the new account
  const linkSel = document.getElementById('csv-link-account');
  if (linkSel) {
    const accounts = state.accounts;
    linkSel.innerHTML = '<option value="">— Don\'t link to an account —</option>' +
      accounts.map(a => `<option value="${a.id}">${a.name} (${fmt(a.balance)})</option>`).join('') +
      '<option value="__new__">+ Create a new account…</option>';
    linkSel.value = id;
  }
  document.getElementById('csv-new-account-form').style.display = 'none';
  showToast(`Account "${name}" created and linked`);
}

// ── RENDER ──────────────────────────────────────────────────
function switchView(view) {
  activeView = view;
  localStorage.setItem('myledger_last_view', view);
  if (view === 'overview' && overviewMonths.length === 0) {
    overviewMonths = state.order.slice();
  }
  try { render(); } catch(e) { console.error('[MyKeepSafe] render() error in switchView:', view, e); }
}

function render() {
  try { document.dispatchEvent(new CustomEvent('ks:sidebar-render', { detail: { activeView, activeMonth } })); } catch(e) { console.error('[MyKeepSafe] sidebar-render error:', e); }
  document.getElementById('accounts-view').style.display = activeView === 'accounts' ? 'block' : 'none';
  document.getElementById('dashboard-view').style.display = activeView === 'dashboard' ? 'block' : 'none';
  document.getElementById('month-view').style.display = activeView === 'month' ? 'block' : 'none';
  document.getElementById('overview-view').style.display = activeView === 'overview' ? 'block' : 'none';
  document.getElementById('forecast-view').style.display = activeView === 'forecast' ? 'block' : 'none';
  document.getElementById('fixed-view').style.display = activeView === 'fixed' ? 'block' : 'none';
  document.getElementById('networth-view').style.display = activeView === 'networth' ? 'block' : 'none';
  document.getElementById('ai-view').style.display = activeView === 'ai' ? 'block' : 'none';
  document.getElementById('profile-view').style.display = activeView === 'profile' ? 'block' : 'none';
  try {
    if (activeView === 'accounts') document.dispatchEvent(new CustomEvent('ks:accounts-render'));
    else if (activeView === 'dashboard') document.dispatchEvent(new CustomEvent('ks:dashboard-render'));
    else if (activeView === 'month') {
      document.dispatchEvent(new CustomEvent('ks:month-render', { detail: { monthKey: activeMonth } }));
      // Account pickers for the add forms (DOM-managed, outside React's content area)
      const _accounts = state.accounts || [];
      const _defaultAcctId = (activeMonth && state.months[activeMonth]?.linkedAccountId) || (_accounts[0]?.id || '');
      ['income-account', 'expense-account'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const current = sel.value || _defaultAcctId;
        if (_accounts.length === 0) {
          sel.innerHTML = '<option value="">— Create an account first —</option>';
          sel.disabled = true;
        } else {
          sel.disabled = false;
          sel.innerHTML = _accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
          if (_accounts.find(a => a.id === current)) sel.value = current;
        }
      });
      const _fromSel = document.getElementById('transfer-from');
      const _toSel = document.getElementById('transfer-to');
      if (_fromSel && _toSel) {
        if (_accounts.length < 2) {
          [_fromSel, _toSel].forEach(s => { s.innerHTML = '<option value="">— Need 2+ accounts —</option>'; s.disabled = true; });
        } else {
          [_fromSel, _toSel].forEach((s, idx) => {
            s.disabled = false;
            s.innerHTML = _accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
            if (!s.value) s.value = _accounts[idx]?.id || '';
          });
        }
      }
    }
    else if (activeView === 'overview') {
      document.dispatchEvent(new CustomEvent('ks:overview-render', { detail: { months: overviewMonths.length ? overviewMonths : state.order.slice() } }));
    }
    else if (activeView === 'forecast') {
      document.dispatchEvent(new CustomEvent('ks:forecast-render'));
    }
    else if (activeView === 'fixed') {
      // Sidebar fixed-list (DOM-managed — React leaves #fixed-list empty)
      const feList = document.getElementById('fixed-list');
      if (feList) {
        feList.innerHTML = '';
        (state.fixedExpenses || []).forEach(fe => {
          const li = document.createElement('li');
          li.textContent = `${fe.desc} — ${fmt(fe.amount)}`;
          feList.appendChild(li);
        });
        if (!state.fixedExpenses.length) feList.innerHTML = '<li style="color:var(--ink3);font-size:12px;">None yet</li>';
      }
      document.dispatchEvent(new CustomEvent('ks:fixed-render', { detail: { billsMonth: activeMonth || (state.order[state.order.length - 1] || null) } }));
    }
    else if (activeView === 'networth') {
      document.dispatchEvent(new CustomEvent('ks:networth-render'));
    }
    else if (activeView === 'profile') document.dispatchEvent(new CustomEvent('ks:profile-render'));
  } catch(e) { console.error('[MyKeepSafe] view render error [' + activeView + ']:', e); }
  try { document.dispatchEvent(new CustomEvent('ks:ai-render')); } catch(e) { console.error('[MyKeepSafe] ai-render error:', e); }
  try { window.renderFloatingAI?.(); } catch(e) { console.error('[MyKeepSafe] renderFloatingAI error:', e); }
  try { document.dispatchEvent(new CustomEvent('ks:notifications-render')); } catch(e) {}
  try { if (activeView === 'month') window.renderMemberFilter?.(); } catch(e) {}
  try { window.checkAndFireMilestones?.(); } catch(e) { console.error('[MyKeepSafe] checkAndFireMilestones error:', e); }
}


function detectRecurringTransactions() {
  // Scan all expense transactions across months for patterns:
  // same description (case-insensitive) appearing in 2+ different months with amount within ±10%
  const descMap = {}; // key: normalized desc → [{month, amount, desc, cat}]
  state.order.forEach(k => {
    (state.months[k]?.expenses || []).forEach(e => {
      const key = (e.desc || '').toLowerCase().trim();
      if (!key) return;
      if (!descMap[key]) descMap[key] = [];
      descMap[key].push({ month: k, amount: e.amount, desc: e.desc, cat: e.cat });
    });
  });

  const detected = [];
  Object.entries(descMap).forEach(([key, entries]) => {
    // Need 2+ different months
    const months = [...new Set(entries.map(e => e.month))];
    if (months.length < 2) return;
    // Check that amounts are consistent (all within ±10% of median)
    const amounts = entries.map(e => e.amount).sort((a,b) => a-b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const allConsistent = amounts.every(a => Math.abs(a - median) / median <= 0.10);
    if (!allConsistent) return;
    // Skip if already in fixed expenses
    const alreadyFixed = state.fixedExpenses.some(fe => fe.desc.toLowerCase().trim() === key);
    if (alreadyFixed) return;
    const latest = entries[entries.length - 1];
    detected.push({ desc: latest.desc, amount: median, cat: latest.cat || 'Other', months });
  });

  return detected;
}

// ── GAP 3: SUBSCRIPTION DETECTION MODAL ─────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._subCandidates = []; // exposed for testing

function showSubscriptionModal(detected) {
  const dismissed = state.settings.dismissedSubscriptions || [];
  const filtered = detected.filter(d => !dismissed.includes(d.desc.toLowerCase().trim() + ':' + d.amount));
  window._subCandidates.length = 0;
  filtered.forEach(d => window._subCandidates.push(d));
  if (!window._subCandidates.length) return;
  _renderSubCandidates();
  const modal = document.getElementById('subscription-review-modal');
  if (modal) modal.style.display = 'flex';
}

function _renderSubCandidates() {
  const list = document.getElementById('sub-review-list');
  if (!list) return;
  if (!window._subCandidates.length) { closeSubscriptionModal(); return; }
  list.innerHTML = window._subCandidates.map((c, i) => `
    <div class="sub-candidate">
      <div class="sub-cand-info">
        <div class="sub-cand-name">${esc(c.desc)}</div>
        <div class="sub-cand-meta">
          <span style="font-family:'DM Mono',monospace;">${fmt(c.amount)}/mo</span>
          <span>·</span>
          <span>${c.months.length} month${c.months.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span class="tag-chip">${esc(c.cat)}</span>
        </div>
      </div>
      <div class="sub-cand-actions">
        <button class="sub-btn-add" onclick="confirmAddSubscription(${i})">+ Add to Fixed</button>
        <button class="sub-btn-dismiss" onclick="dismissSubscription(${i})">✕</button>
      </div>
    </div>
  `).join('');
}

function closeSubscriptionModal() {
  const modal = document.getElementById('subscription-review-modal');
  if (modal) modal.style.display = 'none';
  window._subCandidates.length = 0;
}

function confirmAddSubscription(idx) {
  const c = window._subCandidates[idx];
  if (!c) return;
  addDetectedAsFixed(c.desc, c.amount, c.cat);
  const key = c.desc.toLowerCase().trim() + ':' + c.amount;
  if (!state.settings.dismissedSubscriptions.includes(key)) {
    state.settings.dismissedSubscriptions.push(key);
    saveData();
  }
  window._subCandidates.splice(idx, 1);
  _renderSubCandidates();
}

function dismissSubscription(idx) {
  const c = window._subCandidates[idx];
  if (!c) return;
  const key = c.desc.toLowerCase().trim() + ':' + c.amount;
  if (!state.settings.dismissedSubscriptions) state.settings.dismissedSubscriptions = [];
  if (!state.settings.dismissedSubscriptions.includes(key)) {
    state.settings.dismissedSubscriptions.push(key);
    saveData();
  }
  window._subCandidates.splice(idx, 1);
  _renderSubCandidates();
}

// ── GAP 6: UPCOMING BILLS ────────────────────────────────────
function getUpcomingBills(monthKey) {
  const month = state.months[monthKey];
  const appliedIds = new Set(month?.fixedExpenseIds || []);
  const today = new Date();
  const todayDay = today.getDate();
  return state.fixedExpenses.map(fe => {
    const applied = appliedIds.has(fe.id);
    const dueDay = fe.dueDay || 1;
    const daysUntil = dueDay - todayDay;
    const isOverdue = !applied && daysUntil < 0;
    const isDueSoon = !applied && !isOverdue && daysUntil <= 7;
    return { ...fe, applied, dueDay, daysUntil, isOverdue, isDueSoon };
  }).sort((a, b) => a.dueDay - b.dueDay);
}

function renderUpcomingBills(monthKey) {
  const section = document.getElementById('upcoming-bills-section');
  if (!section) return;
  if (!state.fixedExpenses.length || !monthKey) { section.style.display = 'none'; return; }
  const bills = getUpcomingBills(monthKey);
  const appliedCount = bills.filter(b => b.applied).length;
  const totalDue = bills.filter(b => !b.applied).reduce((s, b) => s + b.amount, 0);
  section.style.display = 'block';
  section.innerHTML = `
    <div class="upcoming-bills-header">
      <span>📅 Upcoming Bills — ${monthKey}</span>
      <span style="font-weight:400;color:var(--ink3);font-size:12px;">${appliedCount}/${bills.length} applied${totalDue > 0 ? ' · ' + fmt(totalDue) + ' remaining' : ''}</span>
    </div>
    <div class="upcoming-bills-grid">
      ${bills.map(b => {
        const cls = b.applied ? 'applied' : b.isOverdue ? 'overdue' : b.isDueSoon ? 'due-soon' : '';
        const badge = b.applied ? '<span class="ub-badge applied">Applied</span>' :
                      b.isOverdue ? '<span class="ub-badge overdue">Overdue</span>' :
                      b.isDueSoon ? `<span class="ub-badge due-soon">Due in ${b.daysUntil}d</span>` :
                      `<span class="ub-badge pending">Day ${b.dueDay}</span>`;
        return `<div class="ub-card ${cls}">
          <div class="ub-card-name">${esc(b.desc)}</div>
          <div class="ub-card-amount">${fmt(b.amount)}</div>
          ${badge}
        </div>`;
      }).join('')}
    </div>
  `;
}

// ── GAP 4: NOTIFICATION CENTER ───────────────────────────────
function pushNotification(type, title, body) {
  if (!state.notifications) state.notifications = [];
  // Deduplicate: don't re-push same type+title within 24h
  const now = Date.now();
  const dup = state.notifications.find(n => n.type === type && n.title === title && (now - n.createdAt) < 86400000);
  if (dup) return;
  state.notifications.unshift({ id: 'notif-' + now, type, title, body, createdAt: now, read: false });
  if (state.notifications.length > 50) state.notifications.splice(50);
  saveData();
  document.dispatchEvent(new CustomEvent('ks:notifications-render'));
}

function markAllNotificationsRead() {
  (state.notifications || []).forEach(n => { n.read = true; });
  saveData();
  document.dispatchEvent(new CustomEvent('ks:notifications-render'));
}

function clearNotification(id) {
  if (!state.notifications) return;
  const idx = state.notifications.findIndex(n => n.id === id);
  if (idx !== -1) state.notifications.splice(idx, 1);
  saveData();
  document.dispatchEvent(new CustomEvent('ks:notifications-render'));
}

function renderNotificationBell() {
  document.dispatchEvent(new CustomEvent('ks:notifications-render'));
}

function openNotificationPanel() {
  document.dispatchEvent(new CustomEvent('ks:notifications-open'));
  setTimeout(markAllNotificationsRead, 800);
}

function closeNotificationPanel() {
  document.dispatchEvent(new CustomEvent('ks:notifications-close'));
}

function renderNotificationPanel() {
  document.dispatchEvent(new CustomEvent('ks:notifications-render'));
}

function checkBudgetNotifications(monthKey) {
  const m = state.months[monthKey];
  if (!m || !m.budget) return;
  const totalExpenses = (m.expenses || []).reduce((s, e) => s + e.amount, 0);
  const pct = totalExpenses / m.budget * 100;
  if (pct >= 100) {
    pushNotification('budget_alert', `Budget exceeded — ${monthKey}`, `Spending ${fmt(totalExpenses)} has passed your ${fmt(m.budget)} budget.`);
  } else if (pct >= 80) {
    pushNotification('budget_warn', `Budget at ${Math.round(pct)}% — ${monthKey}`, `${fmt(totalExpenses)} spent of ${fmt(m.budget)} budget.`);
  }
}

function checkBillDueNotifications() {
  if (!state.fixedExpenses.length) return;
  const today = new Date();
  const todayDay = today.getDate();
  const monthKey = activeMonth || state.order[state.order.length - 1];
  if (!monthKey) return;
  const appliedIds = new Set(state.months[monthKey]?.fixedExpenseIds || []);
  state.fixedExpenses.forEach(fe => {
    const dueDay = fe.dueDay || 1;
    const daysUntil = dueDay - todayDay;
    if (!appliedIds.has(fe.id) && daysUntil >= 0 && daysUntil <= 3) {
      pushNotification('bill_due', `${fe.desc} due soon`, `${fmt(fe.amount)} due on day ${dueDay} — not yet applied.`);
    }
  });
}

// ── GAP 7: COUPLES / MEMBER TAGGING ─────────────────────────






// ── AI SIDE PANEL ─────────────────────────────────────────
let aiPanelOpen = true;

function toggleAIPanel() {
  aiPanelOpen = !aiPanelOpen;
  const panel = document.getElementById('ai-side-panel');
  if (!panel) return;
  const toggleBtn = document.getElementById('asp-toggle-btn');
  if (aiPanelOpen) {
    panel.classList.remove('closed');
    panel.classList.add('open');
    if (toggleBtn) { toggleBtn.textContent = '◀'; toggleBtn.title = 'Collapse AI panel'; }
    window.renderAIPanel?.();
  } else {
    panel.classList.remove('open');
    panel.classList.add('closed');
    if (toggleBtn) { toggleBtn.textContent = '▶'; toggleBtn.title = 'Expand AI panel'; }
  }
  localStorage.setItem('myledger_ai_panel_open', aiPanelOpen ? '1' : '0');
}

// ── COMMAND PALETTE ─────────────────────────────────────────
const CMD_NAV = [
  { icon: '💳', label: 'Go to Accounts',       action: "switchView('accounts')" },
  { icon: '📅', label: 'Go to Month',          action: "switchView('month')" },
  { icon: '📊', label: 'Go to Overview',       action: "switchView('overview')" },
  { icon: '📈', label: 'Go to Forecast',       action: "switchView('forecast')" },
  { icon: '💎', label: 'Go to Net Worth',      action: "switchView('networth')" },
  { icon: '📌', label: 'Go to Fixed Expenses', action: "switchView('fixed')" },
  { icon: '👤', label: 'Go to Profile',        action: "switchView('profile')" },
  { icon: '⚙',  label: 'AI settings',          action: "switchView('ai')" },
];
const CMD_ACTIONS = [
  { icon: '✦',  label: 'Ask AI',          hint: 'Ctrl+J', action: "if(!aiPanelOpen)toggleAIPanel();setTimeout(()=>document.getElementById('asp-input')?.focus(),210)" },
  { icon: '📥', label: 'Import CSV',      hint: '',       action: "document.getElementById('csv-modal').style.display='flex'" },
  { icon: '📤', label: 'Export Backup',  hint: '',       action: "exportJSON()" },
  { icon: '🔄', label: 'Import/Restore', hint: '',       action: "document.getElementById('import-file').click()" },
];
let cmdSelectedIndex = 0;
let cmdItems = [];

function openCommandPalette() {
  const overlay = document.getElementById('cmd-palette');
  if (!overlay) return;
  overlay.classList.add('open');
  const input = document.getElementById('cmd-input');
  if (input) { input.value = ''; input.focus(); }
  filterCommandPalette('');
}

function closeCommandPalette() {
  const overlay = document.getElementById('cmd-palette');
  if (overlay) overlay.classList.remove('open');
}

function filterCommandPalette(query) {
  const q = (query || '').toLowerCase().trim();
  const resultsEl = document.getElementById('cmd-results');
  if (!resultsEl) return;
  let navItems    = CMD_NAV.filter(i => !q || i.label.toLowerCase().includes(q));
  let actionItems = CMD_ACTIONS.filter(i => !q || i.label.toLowerCase().includes(q));
  let monthItems  = [];
  if (q.length >= 2 && state && state.order) {
    monthItems = state.order.filter(m => m.includes(q)).slice(0, 4).map(m => ({
      icon: '📅', label: 'Month: ' + m, action: "activeMonth='" + m + "';switchView('month')"
    }));
  }
  cmdItems = [...navItems, ...actionItems, ...monthItems];
  cmdSelectedIndex = 0;
  if (cmdItems.length === 0) {
    resultsEl.innerHTML = '<div class="cmd-empty">No results for "' + q + '"</div>';
    return;
  }
  let html = '';
  let idx = 0;
  if (navItems.length)    { html += '<div class="cmd-section-label">Navigate</div>';   navItems.forEach(i    => { html += renderCmdItem(i, idx++); }); }
  if (actionItems.length) { html += '<div class="cmd-section-label">Actions</div>';    actionItems.forEach(i => { html += renderCmdItem(i, idx++); }); }
  if (monthItems.length)  { html += '<div class="cmd-section-label">Months</div>';     monthItems.forEach(i  => { html += renderCmdItem(i, idx++); }); }
  resultsEl.innerHTML = html;
  highlightCmdItem(0);
}

function renderCmdItem(item, idx) {
  return `<div class="cmd-item" data-idx="${idx}" data-action="executeCmdItem(${idx})">` +
    `<span class="cmd-item-icon">${item.icon}</span>` +
    `<span class="cmd-item-label">${item.label}</span>` +
    (item.hint ? `<span class="cmd-item-hint">${item.hint}</span>` : '') +
    `</div>`;
}

function highlightCmdItem(idx) {
  document.querySelectorAll('.cmd-item').forEach((el, i) => el.classList.toggle('selected', i === idx));
}

function executeCmdItem(idx) {
  const item = cmdItems[idx];
  if (!item) return;
  closeCommandPalette();
  try { (new Function(item.action))(); } catch(e) { console.error('[MyKeepSafe] cmd action error:', item.action, e); }
}

// ── EVENT LISTENERS & INIT ──────────────────────────────────







// Ctrl+K → command palette | Ctrl+J → AI panel | Ctrl+/ → feedback | / → search | Arrow nav in palette
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const overlay = document.getElementById('cmd-palette');
    if (overlay && overlay.classList.contains('open')) { closeCommandPalette(); } else { openCommandPalette(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
    e.preventDefault();
    const panel = document.getElementById('ai-side-panel');
    if (panel && panel.style.display !== 'none') {
      toggleAIPanel();
      if (aiPanelOpen) setTimeout(() => document.getElementById('asp-input')?.focus(), 210);
    }
    return;
  }
  const overlay = document.getElementById('cmd-palette');
  if (overlay && overlay.classList.contains('open')) {
    if (e.key === 'Escape')    { closeCommandPalette(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelectedIndex = Math.min(cmdSelectedIndex + 1, cmdItems.length - 1); highlightCmdItem(cmdSelectedIndex); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); cmdSelectedIndex = Math.max(cmdSelectedIndex - 1, 0); highlightCmdItem(cmdSelectedIndex); }
    else if (e.key === 'Enter')     { e.preventDefault(); executeCmdItem(cmdSelectedIndex); }
    return;
  }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey &&
      document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') {
    const searchEl = document.getElementById('tx-search') || document.getElementById('dash-search');
    if (searchEl) { e.preventDefault(); searchEl.focus(); }
  }
});

// F12 → open DevTools (diagnostic build)
document.addEventListener('keydown', function(e) {
  if (e.key === 'F12') {
    e.preventDefault();
    if (typeof window.__TAURI__ !== 'undefined') {
      try { window.__TAURI__.webviewWindow.getCurrentWebviewWindow().openDevtools(); } catch(_) {}
    }
  }
  // Ctrl+Shift+T → diagnostic toast (shows current state without needing DevTools)
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    showToast('JS running ✓  view=' + activeView + '  month=' + activeMonth);
  }
  // Ctrl+Shift+R → clear beta token + onboarding so the full first-run flow repeats
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    localStorage.removeItem('myledger_beta_token');
    localStorage.removeItem('myledger_onboarded');
    location.reload();
  }
});

// Expose helpers used by React view components and bridge.js
window.getActiveMonth = () => activeMonth;
window.setActiveMonth = (v) => { activeMonth = v; };
window.getActiveView = () => activeView;
window.setActiveView = (v) => { activeView = v; };
window.getAIPanelOpen = () => aiPanelOpen;
window.setAIPanelOpen = (v) => { aiPanelOpen = v; };
window.saveData = saveData;
window.loadData = loadData;
window.getRollingBalance = getRollingBalance;
window.getEffectiveBudget = getEffectiveBudget;
window.generateMonthInsights = generateMonthInsights;
window.initBalanceChart = initBalanceChart;
window.initExpenseChart = initExpenseChart;
window.generateOverviewInsights = generateOverviewInsights;
window.initOverviewCharts = initOverviewCharts;
window.renderCashFlowBreakdown = renderCashFlowBreakdown;
window.destroyChart = destroyChart;
window.registerChart = (id, chart) => { charts[id] = chart; };
window.renderNetWorthView = () => { document.dispatchEvent(new CustomEvent('ks:networth-render')); };
window.buildForecastData = buildForecastData;
window.getForecastWhatIf = () => forecastWhatIf;

// UI control functions called by React components
window.render = render;
window.getAppMode = getAppMode;
window.enterDemoMode = enterDemoMode;
window.exitDemoMode = exitDemoMode;
window.getUpcomingBills = getUpcomingBills;
window.openNotificationPanel = openNotificationPanel;
window.closeNotificationPanel = closeNotificationPanel;
window.closeCSVModal = closeCSVModal;
window.confirmCSVImport = confirmCSVImport;
window.createAccountFromCSV = createAccountFromCSV;
window.handleCSVAccountChange = handleCSVAccountChange;
window.closeCommandPalette = closeCommandPalette;
window.closeSubscriptionModal = closeSubscriptionModal;

window.switchView = switchView;
window.toggleAddRow = toggleAddRow;
window.showToast = showToast;
window.exportJSON = exportJSON;
window.exportCSVTx = exportCSVTx;
window.exportPDF = exportPDF;
window.toggleAIPanel = toggleAIPanel;
window.saveProfileName = saveProfileName;
window.closeFileSetupModal = closeFileSetupModal;
window.closeOnboardingModal = closeOnboardingModal;
window.exploreSampleData = exploreSampleData;
window.getDataLocationLabel = getDataLocationLabel;
window.linkFile = linkFile;
window.linkFileFromSetup = linkFileFromSetup;
window.toggleQuickStart = toggleQuickStart;
window.unlinkFile = unlinkFile;
window.setDebtStrategy = setDebtStrategy;
window.applyWhatIf = applyWhatIf;
window.applyDateRange = applyDateRange;
window.resetDateRange = resetDateRange;

window.applyQuickStartState = applyQuickStartState;
window.confirmResetAppData = confirmResetAppData;
window.calcNetWorth = calcNetWorth;
window.renderDebtPlanner = renderDebtPlanner;
window.toggleAI = toggleAI;
window.exportCSVSummary = exportCSVSummary;
window.saveThresholds = saveThresholds;
window.askAICategories = askAICategories;
window.detectRecurringTransactions = detectRecurringTransactions;

window._legacyInit = async () => {
  try {
  if (isDesktopApp()) {
    localStorage.removeItem('myledger_trace_enabled');
  }
  resetBlockingOverlays();
  if (isDesktopApp()) {
    try {
      // Use webviewWindow API — same path as the existing openDevtools() call
      const wv = window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.();
      if (wv?.setFocus) wv.setFocus().catch(() => {});
    } catch(_) {}
  }
  setChartDefaults();
  await restoreFileHandle();

  const hadData = state.order.length > 0 || (state.accounts || []).length > 0;
  // Recalc month balances and sync account balances on every startup
  state.order.forEach(k => recalcBalance(k));
  (state.accounts || []).forEach(a => syncLinkedAccount(a.id));
  if (state.order.length === 0) {
    const cur = new Date().toISOString().slice(0, 7);
    createMonth(cur);
    activeMonth = cur;
  } else {
    activeMonth = state.order[state.order.length - 1];
  }
  if (!['dashboard', 'month', 'overview', 'fixed', 'networth', 'ai', 'profile'].includes(activeView)) {
    activeView = 'month';
  }
  if (isDesktopApp() && activeView === 'dashboard') {
    activeView = 'month';
  }
  overviewMonths = state.order.slice();
  render();
  updateFileSyncUI();
  await resolveDesktopAppVersion();

  // First-launch onboarding modal (once only). It also offers sample data.
  const isFirstLaunch = !localStorage.getItem('myledger_onboarded') && !hadData;
  if (isFirstLaunch) {
    showOnboardingModal();
  }

  // First-run: prompt for file setup only in browser — shown after onboarding is dismissed.
  // (showOnboardingModal sets a flag; closeOnboardingModal triggers this if still needed.)
  if (!isFirstLaunch && !serverMode && !linkedFileHandle && !tauriLinkedPath && !isDesktopApp() && typeof window.showSaveFilePicker === 'function') {
    showFileSetupModal();
  }

  } catch (err) {
    console.error('[MyKeepSafe] Startup error:', err);
  }

  // Event listeners wired outside try/catch — always registered even if render() threw above
  document.getElementById('cmd-input')?.addEventListener('input', function() { filterCommandPalette(this.value); });
  // Restore AI panel open/closed state
  if (localStorage.getItem('myledger_ai_panel_open') === '0') { aiPanelOpen = true; toggleAIPanel(); }
  // Dashboard search → forwards to month tab
  document.getElementById('dash-search')?.addEventListener('focus', function() { this._focused = true; });
  document.getElementById('dash-search')?.addEventListener('blur', function() { this._focused = false; });
  document.getElementById('profile-name-input')?.addEventListener('focus', function() { this._focused = true; });
  document.getElementById('profile-name-input')?.addEventListener('blur', function() { this._focused = false; });
  document.getElementById('dash-search')?.addEventListener('input', function() {
    const val = this.value;
    const txSearch = document.getElementById('tx-search');
    if (txSearch) txSearch.value = val;
    if (val.trim()) {
      switchView('month');
      document.dispatchEvent(new CustomEvent('ks:month-render', { detail: { monthKey: activeMonth, initialSearch: val } }));
    }
  });

  // Transaction search & filter listeners
  // tx-search and filter-chip event listeners removed — MonthView.jsx handles these via React state
};
