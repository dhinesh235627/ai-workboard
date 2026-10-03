// ONE integrated run: real app (vite :5173) + real local backend (:7071) + real blob emulator + the REAL
// extension + a FAKE camera. Azure pages are local fakes and the lab status is mocked, so nothing reaches Azure.
//   1. /setup camera check: turn on "Snapshot on flag"
//   2. SWITCH TABS (a real tab switch if the browser reports it, else a dispatched visibilitychange):
//      one camera photo must be uploaded to blob storage (checked in the storage itself)
//   3. Continue to the last step, "Start guided session": the lab's portal page opens WITH the cursor
//   4. the cursor guides the first steps across portal.azure.com -> ai.azure.com
//   node labs-proctoring/test/full-e2e.mjs        (needs vite on :5173, the backend on :7071 and Azurite)
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const EXT = resolve(ROOT, 'ghost-cursor-extension');
const APP = 'http://localhost:5173';
const ACCOUNT = 'labfoundryfull1';
const PORTAL_URL = `https://portal.azure.com/#@t/resource/subscriptions/s/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/${ACCOUNT}/overview`;
const out = { PASS: false, NOT_VERIFIED: false, results: [], notes: {} };
const check = (id, ok, detail = '') => out.results.push({ id, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 300) });

function loadChromium() {
  const base = join(homedir(), '.vscode', 'extensions');
  const dirs = readdirSync(base).filter((d) => d.startsWith('danielsanmedium.dscodegpt-')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
async function launch() {
  const port = 9900 + Math.floor(Math.random() * 90);
  const args = ['--headless=new', '--no-sandbox', '--no-first-run', `--remote-debugging-port=${port}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader',
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'aiwb-full-'))}`, 'about:blank'];
  const proc = spawn(chromeExe(), args, { stdio: 'ignore' });
  const chromium = loadChromium();
  let browser;
  for (let i = 0; i < 40 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!browser) { proc.kill(); throw new Error('could not attach to Chromium'); }
  return { ctx: browser.contexts()[0], close: () => proc.kill() };
}

// Newest blob in the snapshot container, read from the storage itself (read-only tool).
function snapshotCount() {
  try {
    const o = execFileSync(process.execPath, [join(ROOT, 'backend', 'tools', 'show-snapshots.mjs'), '0'], { cwd: join(ROOT, 'backend'), encoding: 'utf8', timeout: 30000 });
    const m = o.match(/^(\d+) snapshot\(s\)/m);
    return m ? Number(m[1]) : 0;
  } catch { return -1; }
}

const futureIso = () => new Date(Date.now() + 3600_000).toISOString();
const rec = JSON.stringify({ opId: 'op-full-00000001', plat: 'foundry', phase: 'ready', createdAt: Date.now(), deploymentName: 'lab-proj-full',
  accountName: ACCOUNT, projectName: 'sandbox-project', portalUrl: PORTAL_URL, expiresAt: futureIso() });
const PORTAL_HTML = '<!doctype html><title>portal fixture</title><button>Go to Foundry portal</button>';
const FOUNDRY_HTML = '<!doctype html><title>foundry fixture</title><nav><a role="tab" href="#" id="tBuild">Build</a></nav><main>Foundry</main>';
const rootOf = (pg) => pg.evaluate(() => { const r = document.getElementById('aiwb-ghost-root'); return r ? { state: r.dataset.state, step: r.dataset.step, pill: r.querySelector('.aiwb-pill')?.textContent } : null; });

try {
  const up = async (u) => fetch(u).then((r) => r.status).catch(() => 0);
  if ((await up(`${APP}/labs`)) !== 200 || (await up('http://localhost:7071/api/health')) !== 200) {
    out.NOT_VERIFIED = true; out.results.push({ id: 'precondition', ok: null, detail: 'vite :5173 and the backend :7071 must be running' });
  } else {
    const before = snapshotCount();
    if (before < 0) { out.NOT_VERIFIED = true; out.results.push({ id: 'precondition', ok: null, detail: 'blob emulator not reachable' }); }
    else {
      const { ctx, close } = await launch();
      try {
        await ctx.route('https://portal.azure.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PORTAL_HTML }));
        await ctx.route('https://ai.azure.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: FOUNDRY_HTML }));
        await ctx.route('**/api/labs/status**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ state: 'Succeeded', stage: 4, portalUrl: PORTAL_URL }) }));
        const app = await ctx.newPage();
        const uploads = [];
        app.on('response', async (r) => { if (r.url().includes('/api/proctor/snapshot') && r.request().method() === 'POST') uploads.push(r.status()); });
        const errors = [];
        app.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
        await app.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
        await app.evaluate((r) => { localStorage.clear(); localStorage.setItem('aiwb.lab.v1', r); }, rec);

        // 1. camera check with a fake camera
        await app.goto(`${APP}/setup`, { waitUntil: 'load' });
        const running = await app.waitForFunction(() => { const v = document.querySelector('video'); return !!v && v.readyState >= 2 && !!v.srcObject && v.videoWidth > 0; }, null, { timeout: 90000 }).then(() => true).catch(() => false);
        check('F1 the (fake) camera started on the camera check step', running);
        if (running) {
          await app.getByRole('button', { name: /Snapshot on flag/i }).click();
          await app.waitForTimeout(300);

          // 2. a tab switch. Try a REAL one first: open another tab and bring it to the front.
          const other = await ctx.newPage();
          await other.goto('https://portal.azure.com/#home', { waitUntil: 'load' });
          await other.bringToFront();
          await app.waitForTimeout(1500);
          let method = 'real tab switch';
          if (uploads.length === 0) {
            // The headless browser did not report the tab as hidden: send the same event the browser would.
            method = 'dispatched visibilitychange (headless did not report a real hidden tab)';
            await app.bringToFront();
            await app.addScriptTag({ content: "Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});" });
            await app.waitForTimeout(2500);
          }
          out.notes.snapshotTrigger = method;
          await app.bringToFront();
          check('F2 switching tabs uploads exactly one camera photo (201)', uploads.length === 1 && uploads[0] === 201, JSON.stringify(uploads));
          await app.waitForFunction(() => /1 uploaded/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
          check('F3 the page shows "1 uploaded"', await app.evaluate(() => /1 uploaded/.test(document.body.innerText)));
          const after = snapshotCount();
          check('F4 the photo is really in blob storage (count went up by 1)', after === before + 1, `before=${before} after=${after}`);
          await other.close();
        }

        // 3. continue to the last step and start the guided session
        for (let i = 0; i < 4; i++) { await app.getByRole('button', { name: /^continue$/i }).click(); await app.waitForTimeout(250); }
        const popup = ctx.waitForEvent('page', { timeout: 10000 });
        await app.getByRole('link', { name: /start guided session/i }).click();
        const portal = await popup.catch(() => null);
        check('F5 "Start guided session" opens the lab\'s portal page', !!portal && portal.url().includes(ACCOUNT), portal && portal.url());
        if (portal) {
          const on = await portal.waitForFunction(() => { const r = document.getElementById('aiwb-ghost-root'); return r && r.dataset.state === 'pointing' && r.querySelector('.aiwb-pill').textContent === "Click 'Go to Foundry portal'"; }, null, { timeout: 10000 }).then(() => true).catch(() => false);
          check('F6 the cursor is ON and points at "Go to Foundry portal"', on, JSON.stringify(await rootOf(portal)));
          // 4. follow it across to the Foundry portal
          await portal.click('button');
          const f = await ctx.newPage();
          await f.goto('https://ai.azure.com/', { waitUntil: 'load' });
          const build = await f.waitForFunction(() => { const r = document.getElementById('aiwb-ghost-root'); return r && r.dataset.state === 'pointing' && r.querySelector('.aiwb-pill').textContent === "Click 'Build' in the top menu"; }, null, { timeout: 10000 }).then(() => true).catch(() => false);
          check('F7 after the hop the Foundry page continues the guide at "Build"', build, JSON.stringify(await rootOf(f)));
        }
        check('F8 no page errors on the app', errors.length === 0, errors.join(' | '));
      } finally { close(); }
    }
  }
} catch (e) {
  out.results.push({ id: 'script', ok: false, detail: String(e).slice(0, 300) });
}
out.PASS = !out.NOT_VERIFIED && out.results.every((r) => r.ok === true);
console.log(JSON.stringify(out, null, 2));
process.exit(out.PASS ? 0 : out.NOT_VERIFIED ? 2 : 1);
