// End to end with the REAL extension and the REAL app (vite dev on :5173), only the Azure pages are
// local fakes and the lab status call is mocked (so nothing reaches Azure):
//   Ready lab -> /labs shows "extension detected" -> "Open portal only" opens Azure with NO cursor
//   -> "Start guided lab" -> /setup -> Continue x4 -> "Start guided session" opens the lab's portal
//   page WITH the cursor guiding. Also: no extension / expired lab / storage lab fall back safely.
//   node labs-proctoring/test/guided-e2e.mjs      (needs `vite dev` on :5173)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve(process.cwd(), 'ghost-cursor-extension');
const APP = 'http://localhost:5173';
const ACCOUNT = 'labfoundrye2e';
const PORTAL_URL = `https://portal.azure.com/#@t/resource/subscriptions/s/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/${ACCOUNT}/overview`;
const out = { PASS: false, NOT_VERIFIED: false, results: [] };
const check = (id, ok, detail = '') => out.results.push({ id, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 300) });

function loadChromium() {
  const base = join(homedir(), '.vscode', 'extensions');
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('danielsanmedium.dscodegpt-')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  return createRequire(join(base, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
function chromeExe() {
  const base = join(homedir(), 'AppData', 'Local', 'ms-playwright');
  for (const d of readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse()) {
    const exe = join(base, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('chromium not found');
}
async function launch(withExtension) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const args = ['--headless=new', '--no-sandbox', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'aiwb-e2e-'))}`, 'about:blank'];
  if (withExtension) args.splice(3, 0, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const proc = spawn(chromeExe(), args, { stdio: 'ignore' });
  const chromium = loadChromium();
  let browser;
  for (let i = 0; i < 40 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!browser) { proc.kill(); throw new Error('could not attach to Chromium'); }
  return { ctx: browser.contexts()[0], close: () => proc.kill() };
}

const FUTURE = () => new Date(Date.now() + 3600_000).toISOString();
const record = (over = {}) => JSON.stringify({
  opId: 'op-e2e-00000001', plat: 'foundry', phase: 'ready', createdAt: Date.now(), deploymentName: 'lab-proj-e2e',
  accountName: ACCOUNT, projectName: 'sandbox-project', portalUrl: PORTAL_URL, expiresAt: FUTURE(), ...over,
});

async function prepare(ctx, rec) {
  // Azure pages are local fakes; the status call is mocked so Azure is never contacted.
  await ctx.route('https://portal.azure.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>portal fixture</title><button>Go to Foundry portal</button>' }));
  await ctx.route('**/api/labs/status**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ state: 'Succeeded', stage: 4, portalUrl: PORTAL_URL }) }));
  const page = await ctx.newPage();
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((r) => { localStorage.clear(); if (r) localStorage.setItem('aiwb.lab.v1', r); }, rec);
  return page;
}
const rootOf = (pg) => pg.evaluate(() => { const r = document.getElementById('aiwb-ghost-root'); return r ? { state: r.dataset.state, pill: r.querySelector('.aiwb-pill')?.textContent } : null; });
const visible = (pg, re) => pg.getByRole('button', { name: re }).isVisible().catch(() => false);

async function toLastSetupStep(page) {
  await page.goto(`${APP}/setup`, { waitUntil: 'load' });
  for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: /^continue$/i }).click(); await page.waitForTimeout(250); }
}

try {
  if (!(await fetch(`${APP}/labs`).then((r) => r.ok).catch(() => false))) {
    out.NOT_VERIFIED = true; out.results.push({ id: 'precondition', ok: null, detail: `vite dev is not running on ${APP}` });
  } else {
    // ---- with the extension ----
    const { ctx, close } = await launch(true);
    try {
      let page = await prepare(ctx, record());
      await page.goto(`${APP}/labs`, { waitUntil: 'load' });
      await page.getByText(/Ready · expires/i).waitFor({ timeout: 15000 }).catch(() => {});
      check('E1 /labs detects the extension and says so', await page.getByText(/Ghost cursor extension detected/i).isVisible().catch(() => false));

      // Open portal only: opens Azure, NO cursor
      const popup1 = ctx.waitForEvent('page', { timeout: 8000 });
      await page.getByRole('link', { name: /open portal only/i }).click();
      const p1 = await popup1.catch(() => null);
      check('E2 "Open portal only" opens the lab\'s portal page', !!p1 && p1.url().includes(ACCOUNT), p1 && p1.url());
      if (p1) { await p1.waitForTimeout(3000); check('E3 ...and the portal page shows NO cursor', !(await rootOf(p1)), JSON.stringify(await rootOf(p1))); await p1.close(); }

      // Start guided lab -> /setup -> ... -> Start guided session
      await page.getByRole('link', { name: /start guided lab/i }).click();
      await page.waitForURL(/\/setup/, { timeout: 8000 }).catch(() => {});
      for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: /^continue$/i }).click(); await page.waitForTimeout(250); }
      check('E4 the last Setup step says the session opens Azure and guides', await page.getByText(/opens your Azure lab in a new tab/i).isVisible().catch(() => false));
      const popup2 = ctx.waitForEvent('page', { timeout: 8000 });
      await page.getByRole('link', { name: /start guided session/i }).click();
      const p2 = await popup2.catch(() => null);
      check('E5 "Start guided session" opens the lab\'s portal page', !!p2 && p2.url().includes(ACCOUNT), p2 && p2.url());
      if (p2) {
        const ok = await p2.waitForFunction(() => { const r = document.getElementById('aiwb-ghost-root'); return r && r.dataset.state === 'pointing' && r.querySelector('.aiwb-pill').textContent === "Click 'Go to Foundry portal'"; }, null, { timeout: 8000 }).then(() => true).catch(() => false);
        check('E6 ...and the cursor is ON, pointing at "Go to Foundry portal"', ok, JSON.stringify(await rootOf(p2)));
        await p2.close();
      }

      // Open portal only AFTER a guided session turns the cursor off again
      const popup3 = ctx.waitForEvent('page', { timeout: 8000 });
      await page.goto(`${APP}/labs`, { waitUntil: 'load' });
      await page.getByText(/Ready · expires/i).waitFor({ timeout: 15000 }).catch(() => {});
      await page.getByRole('link', { name: /open portal only/i }).click();
      const p3 = await popup3.catch(() => null);
      if (p3) { await p3.waitForTimeout(3000); check('E7 "Open portal only" after a guided session shows NO cursor', !(await rootOf(p3)), JSON.stringify(await rootOf(p3))); await p3.close(); }

      // Fallbacks: arming must not happen for an expired lab or a placeholder storage lab
      for (const [name, rec] of [
        ['E8 expired lab', record({ expiresAt: new Date(Date.now() - 1000).toISOString(), phase: 'ready' })],
        ['E9 storage (placeholder) lab', record({ accountName: null, projectName: null })],
      ]) {
        await page.evaluate((r) => localStorage.setItem('aiwb.lab.v1', r), rec);
        await toLastSetupStep(page);
        const guidedLink = await page.getByRole('link', { name: /start guided session/i }).getAttribute('href').catch(() => null);
        check(name + ' falls back to the practice session (/guided), nothing armed', guidedLink === '/guided', String(guidedLink));
      }
    } finally { close(); }

    // ---- WITHOUT the extension: no false promise ----
    const b = await launch(false);
    try {
      const page = await prepare(b.ctx, record());
      await page.goto(`${APP}/labs`, { waitUntil: 'load' });
      await page.getByText(/Ready · expires/i).waitFor({ timeout: 15000 }).catch(() => {});
      check('E10 without the extension /labs shows the install steps (and says to reload)', await page.getByText(/install the extension once, then reload this page/i).isVisible().catch(() => false));
      await toLastSetupStep(page);
      check('E11 without the extension the guided button is disabled and nothing is promised',
        await page.getByRole('button', { name: /install the extension first/i }).isDisabled().catch(() => false) &&
        (await page.getByText(/extension was not found/i).isVisible().catch(() => false)));
    } finally { b.close(); }
  }
} catch (e) {
  out.results.push({ id: 'script', ok: false, detail: String(e).slice(0, 300) });
}
out.PASS = !out.NOT_VERIFIED && out.results.every((r) => r.ok === true);
console.log(JSON.stringify(out, null, 2));
process.exit(out.PASS ? 0 : out.NOT_VERIFIED ? 2 : 1);
