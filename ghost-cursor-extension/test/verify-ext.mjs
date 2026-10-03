// Tier B: does Chrome actually load the unpacked extension, and is it scoped correctly?
// Tier A cannot answer this because it injects content.js itself.
//
// Run:  node test/verify-ext.mjs
//
// Not covered (needs an authenticated portal.azure.com session): that the selectors in
// steps.js match today's live portal. That stays a manual gate.

import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadChromium() {
  const base = join(homedir(), '.vscode', 'extensions');
  const dirs = existsSync(base)
    ? readdirSync(base).filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  const roots = dirs.length ? [join(base, dirs[dirs.length - 1], 'standalone') + '/'] : [];
  roots.push(process.cwd() + '/');
  for (const r of roots) {
    try {
      const m = createRequire(r)('patchright');
      if (m?.chromium) return m.chromium;
    } catch { /* try next */ }
  }
  throw new Error('patchright not found');
}

const results = [];
const check = (id, ok, detail = '') => results.push({ id, ok: !!ok, detail });

// ---- B1-B3: manifest, static ------------------------------------------------
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const cs = manifest.content_scripts || [];
check('B1a manifest_version is 3', manifest.manifest_version === 3);
check('B1b Azure content script matches exactly portal.azure.com + ai.azure.com',
  cs.length === 2 && JSON.stringify(cs[0].matches) === JSON.stringify(['https://portal.azure.com/*', 'https://ai.azure.com/*']),
  JSON.stringify(cs.map((c) => c.matches)));
check('B1d bridge script only on the app origins, document_start, bridge.js only',
  cs.length === 2 && JSON.stringify(cs[1].js) === JSON.stringify(['bridge.js']) && cs[1].run_at === 'document_start' &&
  JSON.stringify(cs[1].matches) === JSON.stringify(['http://localhost:5173/*', 'https://ai-workboard-qa.azurewebsites.net/*', 'https://ai-workboard.azurewebsites.net/*']),
  JSON.stringify(cs[1]));
check('B1c only the storage permission; no host_permissions, no background, no tabs',
  JSON.stringify(manifest.permissions) === JSON.stringify(['storage']) && !manifest.host_permissions && !manifest.background);
const declared = cs.flatMap((c) => [...(c.js || []), ...(c.css || [])]);
const missing = declared.filter((f) => !existsSync(join(EXT, f)));
check('B2 every declared js/css file exists', declared.length > 0 && missing.length === 0, missing.join(','));
const js = cs[0]?.js || [];
check('B3 steps.js and guide-core.js are listed before content.js',
  js.indexOf('steps.js') >= 0 && js.indexOf('guide-core.js') > js.indexOf('steps.js') && js.indexOf('content.js') > js.indexOf('guide-core.js'), js.join(','));

// ---- local http server ------------------------------------------------------
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>t</title><button>+ New agent</button>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Playwright's own launcher never connects when an extension is loaded here, so start
// Chromium directly and attach over CDP.
function chromeExe() {
  const base = join(homedir(), 'AppData', 'Local', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const d of dirs.reverse()) {
    const exe = join(base, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('chromium not found');
}

let browserLog = '';

async function withExtension(dir, fn) {
  const chromium = loadChromium();
  const dbgPort = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(chromeExe(), [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'aiwb-prof-'))}`,
    `--disable-extensions-except=${dir}`, `--load-extension=${dir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (d) => { browserLog += d.toString(); });
  try {
    let browser;
    for (let i = 0; i < 60 && !browser; i++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${dbgPort}`); }
      catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    if (!browser) throw new Error('could not attach to Chromium');
    const ctx = browser.contexts()[0];
    return await fn(ctx);
  } finally { proc.kill(); }
}

const errors = [];
// portal.azure.com: the resource page, whose only job is to send the learner across.
const PORTAL_PAGE =
  '<!doctype html><title>portal fixture</title><button>Go to Foundry portal</button>';

// ai.azure.com shaped like the Microsoft Learn "Create a new agent" flow: top-nav Build tab ->
// New agent -> "Create an agent" dialog (Agent name + Create) -> Playground (Instructions).
const FOUNDRY_PAGE = `<!doctype html><title>foundry fixture</title>
<style>body{font:14px sans-serif;margin:0} nav{display:flex;gap:16px;padding:12px;background:#eee} [hidden]{display:none!important}
.dlg{border:1px solid #888;padding:16px;width:320px;margin:20px} .row{margin:12px 0;display:flex;flex-direction:column;gap:6px} input,textarea{padding:8px}</style>
<nav><a role="tab" href="#" id="tHome">Home</a><a role="tab" href="#" id="tBuild">Build</a><a role="tab" href="#" id="tModels">Models</a></nav>
<main>
  <section id="home">Welcome to Foundry</section>
  <section id="build" hidden><h2>Agents</h2><button id="bNew">New agent</button>
    <div id="menu" hidden><button id="bBuild">Build an agent</button><button id="bCode">Code an agent</button></div></section>
  <!-- A dialog whose name box has NO "Agent name" label (the real wording was never seen): only the
       dialog fallback can find it. -->
  <section id="dialog" hidden class="dlg" role="dialog" aria-modal="true"><h3>Create an agent</h3>
    <div class="row"><span>Choose a name</span><input id="agentName" placeholder="my-agent"></div>
    <button id="bCreate">Create</button></section>
  <!-- Shaped like the REAL agent screen seen on QA: Model row, Instructions box with its placeholder,
       Save, chat box, and a left-menu "Knowledge" that goes to another page and must never be a target. -->
  <section id="play" hidden><h3>test</h3>
    <div class="row"><div id="mdl" role="combobox" tabindex="0">Model: gpt-5 <small>Global Standard deployment</small></div></div>
    <div class="row"><h4>Instructions</h4><textarea id="instr" rows="4" placeholder="Write your prompt here to give your agent instructions."></textarea></div>
    <div class="row"><button id="bKnow">Add knowledge</button></div>
    <div class="row"><button id="bSave">Save</button></div>
    <div class="row"><input id="chat" placeholder="Message the agent..."></div></section>
</main>
<aside style="position:absolute;right:8px;top:60px"><a href="#" role="link" id="navKnow">Knowledge</a></aside>
<script>
  const show = (id) => { for (const s of document.querySelectorAll('section')) s.hidden = s.id !== id; };
  document.getElementById('tBuild').onclick = (e) => { e.preventDefault(); show('build'); };
  document.getElementById('bNew').onclick = () => { document.getElementById('menu').hidden = false; };
  document.getElementById('bBuild').onclick = () => show('dialog');
  // Like the real portal, creating the agent moves to a new address (the agent screen).
  document.getElementById('bCreate').onclick = () => { show('play'); location.hash = '#/agents/test/playground'; };
</script>`;
try {
  // One session with the UNCHANGED extension.
  await withExtension(EXT, async (ctx) => {
    const unfulfilled = [];
    await ctx.route('https://portal.azure.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PORTAL_PAGE }));
    await ctx.route('https://ai.azure.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: FOUNDRY_PAGE }));
    // An app-origin page: the bridge only runs on the app's origins, so this is where a guided session is started.
    await ctx.route('http://localhost:5173/__arm', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>app' }));
    ctx.on('requestfailed', (r) => unfulfilled.push(r.url()));

    const LAB = 'https://portal.azure.com/#@t/resource/subscriptions/s/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/labfoundrytest/overview';
    const ACCOUNT = 'labfoundrytest';
    const rootState = (pg) => pg.evaluate(() => { const r = document.getElementById('aiwb-ghost-root'); return r ? { state: r.dataset.state, step: r.dataset.step, pill: r.querySelector('.aiwb-pill')?.textContent } : null; });
    const goneWithin = (pg, ms) => pg.waitForFunction(() => !document.getElementById('aiwb-ghost-root'), null, { timeout: ms }).then(() => true).catch(() => false);
    const appears = (pg, ms) => pg.waitForSelector('#aiwb-ghost-root', { timeout: ms }).then(() => true).catch(() => false);
    const pointsAt = (pg, text, ms = 6000) => pg.waitForFunction((t) => { const r = document.getElementById('aiwb-ghost-root'); return r && r.dataset.state === 'pointing' && r.querySelector('.aiwb-pill').textContent === t; }, text, { timeout: ms }).then(() => true).catch(() => false);

    // The app page: where "Start guided session" / "Open portal only" talk to the extension.
    const app = await ctx.newPage();
    await app.goto('http://localhost:5173/__arm', { waitUntil: 'load' });
    await app.waitForTimeout(500);
    const marker = await app.evaluate(() => document.documentElement.dataset.aiwbExt || null);
    check('B1e the bridge marks the app page so the app can detect the extension', marker === manifest.version, String(marker));
    // This is the app's own event contract (window, JSON string detail), sent from the page's world.
    const sendGuide = (on, account = '') => app.addScriptTag({ content: `window.dispatchEvent(new CustomEvent('aiwb:guide', { detail: JSON.stringify({ on: ${on}, account: ${JSON.stringify(account)} }) }));` }).then(() => app.waitForTimeout(500));

    // B5: a non-portal origin gets nothing injected.
    const other = await ctx.newPage();
    other.on('pageerror', (e) => errors.push(String(e)));
    await other.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await other.waitForTimeout(1200);
    check('B5 nothing injected on a non-portal origin', !(await other.evaluate(() => !!document.getElementById('aiwb-ghost-root'))));

    // B10: UNARMED = "Open portal only": the lab's own portal page and a bookmarked home show NOTHING.
    const lab = await ctx.newPage();
    lab.on('pageerror', (e) => errors.push(String(e)));
    await lab.goto(LAB, { waitUntil: 'load' });
    const home = await ctx.newPage();
    await home.goto('https://portal.azure.com/#home', { waitUntil: 'load' });
    await lab.waitForTimeout(2500);
    check('B10 unarmed: no overlay on the lab page or on portal home (this is "Open portal only")',
      !(await rootState(lab)) && !(await rootState(home)), JSON.stringify([await rootState(lab), await rootState(home)]));

    // B11: arming starts the ALREADY-OPEN lab page without a reload; B12: portal home stays idle (scoped to the lab).
    await sendGuide(true, ACCOUNT);
    const started = await appears(lab, 6000);
    const pointing = started && (await pointsAt(lab, "Click 'Go to Foundry portal'", 4000));
    const ringW = started ? await lab.evaluate(() => document.querySelector('#aiwb-ghost-root .aiwb-ring')?.offsetWidth) : null;
    check('B6a unchanged extension, once armed, starts on the lab page WITHOUT a reload and finds the target', pointing, JSON.stringify(await rootState(lab)));
    check('B6b manifest CSS applied (ring offsetWidth is 44px)', ringW === 44, String(ringW));
    check('B12 an unrelated portal page (home) stays idle even while a session is on', !(await rootState(home)), JSON.stringify(await rootState(home)));

    // B13 (G1): finishing the portal's only step must NOT end the session. The portal tab goes idle,
    // and more than 6 s later the Foundry tab still starts at Build.
    await lab.click('button');
    const portalIdle = await goneWithin(lab, 4000);
    check('B13a after the click the portal tab goes idle (its step is done)', portalIdle);
    await lab.waitForTimeout(7000);
    const f = await ctx.newPage();
    f.on('pageerror', (e) => errors.push(String(e)));
    await f.goto('https://ai.azure.com/', { waitUntil: 'load' });
    check('B13b >6 s later a Foundry page still resumes the session at Build (portal tab did not end it)', await pointsAt(f, "Click 'Build' in the top menu", 6000), JSON.stringify(await rootState(f)));

    // B8: the REAL steps.js drives the whole Foundry flow.
    const FLOW = [
      ['#tBuild', "Click 'Build' in the top menu"],
      ['#bNew', "Click 'New agent'"],
      ['#bBuild', "Choose 'Build an agent' from the menu"],
      ['#agentName', 'Type a name for your agent, for example HR policy helper'],
      ['#bCreate', "Click 'Create'"],
      ['#mdl', 'Check the Model: pick the deployed gpt-4o-mini'],
      ['#instr', "Click 'Instructions' and paste the starter text from your lab card"],
      ['#bKnow', 'Add the HR policy file (Tools / Knowledge section of this agent)'],
      ['#bSave', "Click 'Save'"],
      ['#chat', 'Type a question here to test your agent'],
    ];
    const seen = [];
    for (let i = 0; i < FLOW.length; i++) {
      const [sel, expectedLabel] = FLOW[i];
      await pointsAt(f, expectedLabel, 6000);
      let off = { dx: 999, dy: 999 };
      for (let k = 0; k < 40; k++) {
        off = await f.evaluate(([x]) => {
          const ring = document.querySelector('#aiwb-ghost-root .aiwb-ring').getBoundingClientRect();
          const t = document.querySelector(x).getBoundingClientRect();
          return { dx: Math.abs(ring.left + ring.width / 2 - (t.left + t.width / 2)), dy: Math.abs(ring.top + ring.height / 2 - (t.top + t.height / 2)) };
        }, [sel]);
        if (off.dx <= 8 && off.dy <= 8) break;
        await f.waitForTimeout(100);
      }
      const pill = await f.evaluate(() => document.querySelector('#aiwb-ghost-root .aiwb-pill').textContent);
      seen.push({ step: i, pill, dx: Math.round(off.dx), dy: Math.round(off.dy) });
      await f.click(sel); // a real click advances the shared step
    }
    const okFlow = seen.every((x, i) => x.pill === FLOW[i][1] && x.dx <= 8 && x.dy <= 8);
    check('B8 real steps drive the whole Foundry flow on ai.azure.com (Build, New agent, the Build-an-agent menu, ... chat), continuing from the portal step', okFlow, JSON.stringify(seen));
    await f.waitForFunction(() => document.getElementById('aiwb-ghost-root')?.dataset.state === 'done', null, { timeout: 4000 }).catch(() => {});
    check('B8b the flow ends in the done state', (await rootState(f))?.state === 'done');
    // After the LAST global step the session ends everywhere (~6 s), and a new Foundry page shows nothing.
    check('B14a the finished session removes the overlay', await goneWithin(f, 9000));
    const f2 = await ctx.newPage();
    await f2.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await f2.waitForTimeout(1500);
    check('B14b a Foundry page opened after the session ended shows nothing', !(await rootState(f2)));

    // B15: reload mid-flow resumes at the SAME step (progress lives in storage).
    await sendGuide(true, ACCOUNT);
    const lab2 = await ctx.newPage();
    await lab2.goto(LAB, { waitUntil: 'load' });
    await appears(lab2, 6000);
    await lab2.click('button');
    const f3 = await ctx.newPage();
    await f3.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await pointsAt(f3, "Click 'Build' in the top menu", 6000);
    await f3.click('#tBuild');
    await pointsAt(f3, "Click 'New agent'", 6000);
    await f3.reload({ waitUntil: 'load' });
    // The fixture resets to its home view on reload (the real Foundry keeps the view in the address), so
    // the proof is the STEP the cursor resumed at: global step 2 = "New agent", not 0 or 1 ("Build").
    await appears(f3, 6000);
    await f3.waitForTimeout(2600);
    const resumed = await rootState(f3);
    check('B15 a full reload mid-flow resumes at step "New agent" (global step 2), not at the start',
      !!resumed && resumed.step === '2' && /New agent/.test(resumed.pill || ''), JSON.stringify(resumed));

    // B16: End guide removes the overlay and the session is off for new pages.
    await f3.click('#aiwb-ghost-root .aiwb-end');
    check('B16a End guide removes the overlay', await goneWithin(f3, 4000));
    const f4 = await ctx.newPage();
    await f4.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await f4.waitForTimeout(1500);
    check('B16b after End guide a new Foundry page shows nothing', !(await rootState(f4)));

    // B17: the app sends "off" (Open portal only): an overlay that is showing disappears at once.
    await sendGuide(true, ACCOUNT);
    const lab3 = await ctx.newPage();
    await lab3.goto(LAB, { waitUntil: 'load' });
    check('B17a armed again: overlay is back on the lab page', await appears(lab3, 6000));
    await sendGuide(false);
    check('B17b "off" from the app removes it', await goneWithin(lab3, 4000));

    // B18 (GI-1): the portal is a single-page app. Moving to another page in the SAME tab must drop the
    // step-0 cursor, and coming back to the lab page must bring it back (no reload either way).
    await sendGuide(true, ACCOUNT);
    const nav = await ctx.newPage();
    await nav.goto(LAB, { waitUntil: 'load' });
    check('B18a armed lab page shows the cursor', await appears(nav, 6000));
    await nav.evaluate(() => { location.hash = '#home'; });
    check('B18b navigating in place to the portal home removes it', await goneWithin(nav, 4000), JSON.stringify(await rootState(nav)));
    await nav.evaluate((u) => { location.href = u; }, LAB);
    check('B18c navigating back in place to the lab page starts it again', await appears(nav, 6000));

    // B19 (GI-2): an "on" without the lab's account (or a legacy string) must NOT show a cursor anywhere.
    await sendGuide(false);
    await app.addScriptTag({ content: `window.dispatchEvent(new CustomEvent('aiwb:guide', { detail: JSON.stringify({ on: true }) }));` });
    await app.waitForTimeout(600);
    await app.addScriptTag({ content: `window.dispatchEvent(new CustomEvent('aiwb:guide', { detail: 'on' }));` });
    await app.waitForTimeout(600);
    const bare = await ctx.newPage();
    await bare.goto('https://portal.azure.com/#home', { waitUntil: 'load' });
    const bare2 = await ctx.newPage();
    await bare2.goto(LAB, { waitUntil: 'load' });
    await bare2.waitForTimeout(2500);
    check('B19 a bare "on" (no account / legacy string) shows nothing on the portal home or the lab page', !(await rootState(bare)) && !(await rootState(bare2)), JSON.stringify([await rootState(bare), await rootState(bare2)]));

    // B20 (GI-6b): two Foundry tabs follow the one shared step.
    await sendGuide(true, ACCOUNT);
    const lab4 = await ctx.newPage();
    await lab4.goto(LAB, { waitUntil: 'load' });
    await appears(lab4, 6000);
    await lab4.click('button');
    const fa = await ctx.newPage(); await fa.goto('https://ai.azure.com/', { waitUntil: 'load' });
    const fb = await ctx.newPage(); await fb.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await pointsAt(fa, "Click 'Build' in the top menu", 6000);
    await pointsAt(fb, "Click 'Build' in the top menu", 6000);
    await fa.click('#tBuild');
    await fb.waitForTimeout(1500);
    const sb = await rootState(fb);
    check('B20 a second Foundry tab follows the shared step (Build clicked in tab A -> tab B is on step 2)', !!sb && sb.step === '2', JSON.stringify(sb));
    await sendGuide(false);

    // B21: THE USER'S SCREENSHOT. The learner is on the Agents list, the cursor has drifted (steps were
    // skipped) and says "Can't find 'Model'". It must offer "Go back to 'New agent'" and that must work.
    await sendGuide(true, ACCOUNT);
    const lab5 = await ctx.newPage();
    await lab5.goto(LAB, { waitUntil: 'load' });
    await appears(lab5, 6000);
    await lab5.click('button');
    const g = await ctx.newPage();
    await g.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await pointsAt(g, "Click 'Build' in the top menu", 6000);
    await g.click('#tBuild');
    await pointsAt(g, "Click 'New agent'", 6000);
    await g.evaluate(() => { document.getElementById('bNew').style.display = 'none'; }); // the dropdown button is not found
    for (let i = 0; i < 4; i++) { // the learner presses Skip step four times: New agent, menu, Agent name, Create
      await g.waitForFunction(() => document.getElementById('aiwb-ghost-root')?.dataset.state === 'timeout', null, { timeout: 8000 }).catch(() => {});
      await g.click('#aiwb-ghost-root .aiwb-skip');
      await g.waitForTimeout(300);
    }
    await g.evaluate(() => { document.getElementById('bNew').style.display = ''; }); // New agent is on the screen again
    await g.waitForFunction(() => { const b = document.querySelector('#aiwb-ghost-root .aiwb-back'); return b && !b.hidden; }, null, { timeout: 9000 }).catch(() => {});
    const drift = await g.evaluate(() => ({
      step: document.getElementById('aiwb-ghost-root').dataset.step,
      text: document.querySelector('#aiwb-ghost-root .aiwb-status-text').textContent,
      back: document.querySelector('#aiwb-ghost-root .aiwb-back').textContent,
    }));
    check('B21a drifted to the Model step: "Can\'t find \'Model\'" and "Go back to \'New agent\'" is offered',
      drift.step === '6' && /Can't find 'Model:'/.test(drift.text) && /Go back to 'New agent'/.test(drift.back), JSON.stringify(drift));
    await g.click('#aiwb-ghost-root .aiwb-back');
    check('B21b clicking it returns to "New agent" and points at it', await pointsAt(g, "Click 'New agent'", 6000), JSON.stringify(await rootState(g)));
    await sendGuide(false);

    // B22: THE SECOND SCREENSHOT. The learner creates the agent BY HAND (types a name, clicks Create)
    // without clicking the name box the cursor points at. The page moves to the agent screen; the
    // cursor must notice and move on to the agent-screen steps instead of staying on "Agent name".
    await sendGuide(true, ACCOUNT);
    const lab6 = await ctx.newPage();
    await lab6.goto(LAB, { waitUntil: 'load' });
    await appears(lab6, 6000);
    await lab6.click('button');
    const h = await ctx.newPage();
    await h.goto('https://ai.azure.com/', { waitUntil: 'load' });
    await pointsAt(h, "Click 'Build' in the top menu", 6000);
    await h.click('#tBuild');
    await pointsAt(h, "Click 'New agent'", 6000);
    await h.click('#bNew');
    await pointsAt(h, "Choose 'Build an agent' from the menu", 6000);
    await h.click('#bBuild');
    // The dialog's name box has no "Agent name" label: the dialog fallback must still find it.
    check('B22a a dialog whose name box is not labelled "Agent name" is still found (dialog fallback)',
      await pointsAt(h, 'Type a name for your agent, for example HR policy helper', 6000), JSON.stringify(await rootState(h)));
    await h.fill('#agentName', 'test');
    await h.click('#bCreate'); // by hand: the cursor never saw the name box being clicked
    const moved = await pointsAt(h, 'Check the Model: pick the deployed gpt-4o-mini', 12000);
    check('B22b after creating the agent by hand the cursor moves on to the agent-screen steps (does not stay on "Agent name")', moved, JSON.stringify(await rootState(h)));
    const trap = await h.evaluate(() => {
      const r = document.getElementById('aiwb-ghost-root').getBoundingClientRect ? null : null;
      const ring = document.querySelector('#aiwb-ghost-root .aiwb-ring').getBoundingClientRect();
      const k = document.getElementById('navKnow').getBoundingClientRect();
      return Math.hypot(ring.left + ring.width / 2 - (k.left + k.width / 2), ring.top + ring.height / 2 - (k.top + k.height / 2));
    });
    check('B22c the cursor is not on the left-menu "Knowledge" link', trap > 40, String(trap));
    await sendGuide(false);

    check('B6c nothing left the machine (no failed/unfulfilled requests)', unfulfilled.filter((u) => !u.includes('localhost:5173')).length === 0, unfulfilled.join(','));
  });
  check('B4 browser reported no extension load error',
    !/failed to load extension|manifest (is not valid|file is missing)|could not load/i.test(browserLog),
    browserLog.slice(0, 300));
} catch (e) {
  // Environment problem, not an extension verdict: reported as NOT VERIFIED and it fails the run.
  results.push({ id: 'B4-B17 browser load checks', ok: null, detail: 'NOT VERIFIED - ' + String(e).slice(0, 300) });
} finally {
  server.close();
}

check('B7 no page errors', errors.length === 0, errors.join(' | '));

// PASS requires every check to have run and succeeded; an unverified browser check is a failure.
const ok = (prefix) => results.some((r) => r.id.startsWith(prefix) && r.ok === true);
// Positive evidence the UNCHANGED extension loads: it injected and styled on the real match
// origin (B6a/B6b), with no load error (B4), and stayed out of a non-portal origin (B5).
const loadVerified = ok('B6a') && ok('B6b') && ok('B5') && ok('B4') && ok('B10') && ok('B13b');
const pass = results.every((r) => r.ok === true) && loadVerified;
console.log(JSON.stringify({ PASS: pass, loadVerified, results }, null, 2));
process.exit(pass ? 0 : 1);
