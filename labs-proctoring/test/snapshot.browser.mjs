// Best-effort end-to-end check of the tab-switch snapshot on /setup with a FAKE camera and a
// MOCKED /api/proctor/snapshot. If the detection models cannot load here this reports
// NOT_VERIFIED, never a pass.
//   node labs-proctoring/test/snapshot.browser.mjs        (needs `vite dev` on :5199)
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5199/setup';
const LIVE = process.env.LIVE_BACKEND === '1'; // true: send to the REAL local backend instead of a mock

function loadChromium() {
  const base = join(homedir(), '.vscode', 'extensions');
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('danielsanmedium.dscodegpt-')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const roots = dirs.length ? [join(base, dirs[dirs.length - 1], 'standalone') + '/'] : [];
  roots.push(process.cwd() + '/');
  for (const r of roots) {
    try { const m = createRequire(r)('patchright'); if (m?.chromium) return m.chromium; } catch { /* next */ }
  }
  throw new Error('patchright not found');
}

const out = { PASS: false, NOT_VERIFIED: false, fail: [], detail: {} };
const note = (ok, msg) => { if (!ok) out.fail.push(msg); };

const browser = await loadChromium().launch({
  channel: 'chromium', headless: true,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'],
});
try {
  const ctx = await browser.newContext({ permissions: ['camera'], viewport: { width: 1400, height: 900 } });
  const posts = [];
  if (!LIVE) await ctx.route('**/api/proctor/snapshot', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ blobPath: 'proctor-snapshots/x/y/000.jpg' }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (LIVE) page.on('request', (r) => { if (r.url().includes('/api/proctor/snapshot') && r.method() === 'POST') posts.push(r.postDataJSON()); });
  await page.goto(BASE, { waitUntil: 'load' });

  // Wait for the camera to be running (models load, getUserMedia, video playing).
  const running = await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return !!v && v.readyState >= 2 && !!v.srcObject && v.videoWidth > 0;
  }, null, { timeout: 90000 }).then(() => true).catch(() => false);
  if (!running) {
    out.NOT_VERIFIED = true;
    out.detail.reason = 'camera/models did not start headless within 90 s';
  } else {
    // patchright's page.evaluate runs in an ISOLATED world, where overriding visibilityState is
    // invisible to the page's own code. A script tag runs in the page's own (main) world.
    const hide = () => page.addScriptTag({
      content: "Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});" +
        "document.dispatchEvent(new Event('visibilitychange'));" +
        "Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});",
    });
    // Toggle is OFF by default: a tab switch must upload nothing.
    await hide();
    await page.waitForTimeout(800);
    note(posts.length === 0, 'uploaded with the toggle OFF');

    await page.getByRole('button', { name: /Snapshot on flag/i }).click();
    await page.waitForTimeout(300);
    await hide();
    await page.waitForFunction(() => /uploaded/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
    note(posts.length === 1, 'expected exactly one upload with the toggle ON, got ' + posts.length);
    if (posts[0]) {
      out.detail.body = { keys: Object.keys(posts[0]).sort(), reason: posts[0].reason, imagePrefix: String(posts[0].image).slice(0, 23), imageChars: String(posts[0].image).length };
      note(posts[0].reason === 'tab-switch', 'wrong reason');
      note(/^data:image\/jpeg;base64,/.test(posts[0].image), 'image is not a JPEG data URL');
      note(/^[A-Za-z0-9-]{8,64}$/.test(posts[0].learnerId) && /^[A-Za-z0-9-]{8,64}$/.test(posts[0].sessionId), 'ids do not match the backend pattern');
    }
    out.detail.pageText = await page.evaluate(() => (document.body.innerText.match(/\d+ tab-switch snapshot[^.]*\./) || [''])[0]);
    note(/1 uploaded/.test(out.detail.pageText), 'page does not show the upload status: ' + out.detail.pageText);

    // Same learner id on a second capture, same session id.
    await page.waitForTimeout(200);
    await hide();
    await page.waitForTimeout(800);
    note(posts.length === 2 && posts[0].learnerId === posts[1].learnerId && posts[0].sessionId === posts[1].sessionId, 'learner/session ids not stable across captures');
  }
  note(errors.length === 0, 'page errors: ' + errors.join(' | ').slice(0, 300));
  out.PASS = !out.NOT_VERIFIED && out.fail.length === 0;
} catch (e) {
  out.fail.push('script error: ' + String(e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.PASS ? 0 : out.NOT_VERIFIED ? 2 : 1);
