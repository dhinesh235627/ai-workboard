// /labs provisioning scenarios against `vite dev` with MOCKED /provision and /status (no Azure).
//   node <browser-automation>/browser.mjs http://localhost:5199/labs --script <this file>
const BASE = process.env.BASE_URL || 'http://localhost:5199/labs';
const KEY = 'aiwb.lab.v1';
const future = (ms) => new Date(Date.now() + (ms || 2 * 3600 * 1000)).toISOString();

export default async function run(page) {
  const browser = page.context().browser();
  const fail = [];
  const note = (ok, msg) => { if (!ok) fail.push(msg); };
  const consoleErrors = [];

  // New isolated context with mocked API. `opts.status` / `opts.provisionDelay` customise behaviour.
  async function scenario(opts = {}, initScript = null) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
    if (initScript) await ctx.addInitScript(initScript);
    const log = { posts: [], statuses: [] };
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    await ctx.route('**/api/labs/provision', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      log.posts.push(route.request().postDataJSON());
      if (opts.provisionDelay) await new Promise((r) => setTimeout(r, opts.provisionDelay));
      if (opts.provisionStatus && opts.provisionStatus !== 200) {
        return route.fulfill({ status: opts.provisionStatus, contentType: 'application/json', headers: cors, body: JSON.stringify({ state: 'failed', error: 'x' }) });
      }
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ deploymentName: 'lab-proj-mock', accountName: 'labfoundrymock', projectName: 'sandbox-project', expiresAt: future(opts.expiresInMs), platform: 'foundry' }),
      });
    });
    await ctx.route('**/api/labs/status**', async (route) => {
      log.statuses.push(route.request().url());
      const r = typeof opts.status === 'function' ? opts.status(log.statuses.length) : (opts.status || { status: 200, body: { state: 'Running', stage: 1 } });
      await route.fulfill({ status: r.status, contentType: 'application/json', headers: cors, body: JSON.stringify(r.body) });
    });
    const pg = await ctx.newPage();
    pg.on('console', (m) => { if (m.type() === 'error' && !/status request failed|Failed to check lab status|Failed to start provisioning|status 503|status 500|Failed to load resource: the server responded with a status of (503|404|409|500)|net::ERR_CONNECTION_REFUSED|WebSocket connection to 'ws:\/\/localhost:(5173|5199)/.test(m.text())) consoleErrors.push(m.text()); });
    pg.on('pageerror', (e) => consoleErrors.push(String(e)));
    await pg.goto(BASE, { waitUntil: 'load' });
    return { ctx, pg, log };
  }
  const btn = (pg, re) => pg.getByRole('button', { name: re });
  const visible = (pg, re) => btn(pg, re).isVisible().catch(() => false);
  const stored = (pg) => pg.evaluate((k) => localStorage.getItem(k), KEY);
  const distinctOps = (log) => new Set(log.posts.map((p) => p.operationId)).size;
  const results = {};

  // 1. provision -> reload -> same lab restored, NO second POST, no provision button
  {
    const { ctx, pg, log } = await scenario();
    await btn(pg, /provision my environment/i).click();
    await btn(pg, /provisioning/i).waitFor({ timeout: 5000 });
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'polling'), KEY, { timeout: 5000 });
    const before = log.posts.length;
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    results.reload = {
      posts: log.posts.length, provisionVisible: await visible(pg, /provision my environment/i),
      provisioningVisible: await visible(pg, /provisioning/i), polledLab: log.statuses.some((u) => u.includes('deploymentName=lab-proj-mock')),
    };
    note(before === 1 && log.posts.length === 1, 'reload sent a second POST /provision');
    note(!results.reload.provisionVisible, 'provision button came back after reload');
    note(results.reload.provisioningVisible, 'restored lab not shown as provisioning');
    note(results.reload.polledLab, 'polling did not resume for the saved lab');
    await ctx.close();
  }

  // 2. reload WHILE the POST is pending -> re-POST carries the SAME operationId, one lab
  {
    const { ctx, pg, log } = await scenario({ provisionDelay: 1500 });
    await btn(pg, /provision my environment/i).click();
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'requesting'), KEY, { timeout: 3000 });
    await pg.reload({ waitUntil: 'load' });
    // The old tab's heartbeat must go stale (6 s) before the reloaded tab takes the request over.
    await pg.waitForTimeout(9500);
    results.pendingReload = { posts: log.posts.length, distinctOperationIds: distinctOps(log) };
    note(log.posts.length >= 2, 'pending reload did not re-send the saved operation');
    note(distinctOps(log) === 1, 'pending reload created a DIFFERENT operation: ' + distinctOps(log));
    note(await visible(pg, /provisioning/i) || log.statuses.length > 0, 'resumed lab never reached polling');
    await ctx.close();
  }

  // 3. two tabs: a second tab adopts the lab and never provisions; racing clicks -> one operation
  {
    const { ctx, pg, log } = await scenario({ provisionDelay: 800 });
    const pg2 = await ctx.newPage();
    await pg2.goto(BASE, { waitUntil: 'load' });
    await Promise.all([
      btn(pg, /provision my environment/i).click().catch(() => {}),
      btn(pg2, /provision my environment/i).click().catch(() => {}),
    ]);
    await pg.waitForTimeout(2500);
    results.twoTabs = { posts: log.posts.length, distinctOperationIds: distinctOps(log), tab2ShowsProvision: await visible(pg2, /provision my environment/i) };
    note(distinctOps(log) === 1, 'two tabs racing created ' + distinctOps(log) + ' operations');
    note(log.posts.length === 1, 'two racing tabs sent ' + log.posts.length + ' POST /provision requests (must be exactly 1)');
    note(!results.twoTabs.tab2ShowsProvision, 'second tab still offers provisioning');
    // A third tab opened later never provisions either.
    const pg3 = await ctx.newPage();
    await pg3.goto(BASE, { waitUntil: 'load' });
    await pg3.waitForTimeout(800);
    note(!(await visible(pg3, /provision my environment/i)), 'third tab offers provisioning');
    note(distinctOps(log) === 1 && log.posts.length === 1, 'third tab sent another POST (' + log.posts.length + ' total)');
    await ctx.close();
  }

  // 4. platform tabs: Foundry -> Copilot -> Foundry keeps the lab; Copilot cannot provision meanwhile
  {
    const { ctx, pg, log } = await scenario();
    await btn(pg, /provision my environment/i).click();
    await btn(pg, /provisioning/i).waitFor({ timeout: 5000 });
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'polling'), KEY, { timeout: 5000 });
    await pg.getByRole('button', { name: /Copilot Studio/ }).click();
    await pg.waitForTimeout(300);
    const copilot = {
      provisionVisible: await visible(pg, /provision my environment/i),
      provisionEnabled: await btn(pg, /provision my environment/i).isEnabled().catch(() => false),
      explains: await pg.getByText(/already have an active lab on Azure AI Foundry/i).isVisible().catch(() => false),
    };
    await pg.getByRole('button', { name: /Azure AI Foundry/ }).first().click();
    await pg.waitForTimeout(500);
    results.platformSwitch = { copilot, backOnFoundryProvisioning: await visible(pg, /provisioning/i), posts: log.posts.length, recordKept: !!(await stored(pg)) };
    note(!copilot.provisionEnabled, 'Copilot tab allowed a second provision while a lab is active');
    note(copilot.explains, 'Copilot tab does not explain the active lab');
    note(results.platformSwitch.backOnFoundryProvisioning, 'switching back lost the lab');
    note(log.posts.length === 1 && results.platformSwitch.recordKept, 'platform switching created a lab or erased the record');
    await ctx.close();
  }

  // 5. a late response for an old operation is ignored (another tab took the shared record)
  {
    const { ctx, pg, log } = await scenario({ provisionDelay: 2500 });
    const pg2 = await ctx.newPage();
    await pg2.goto(BASE, { waitUntil: 'load' });
    await btn(pg, /provision my environment/i).click();
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'requesting'), KEY, { timeout: 3000 });
    // Meanwhile the shared record is replaced by a different operation (as if another tab claimed B).
    await pg2.evaluate(([k, exp]) => localStorage.setItem(k, JSON.stringify({
      opId: 'op-OTHER0000', plat: 'foundry', phase: 'polling', createdAt: Date.now(),
      deploymentName: 'lab-other', accountName: 'acctother', projectName: 'sandbox-project', expiresAt: exp,
    })), [KEY, future()]);
    await pg.waitForTimeout(4200); // A's POST resolves after the record changed
    const rec = JSON.parse((await stored(pg)) || '{}');
    results.stale = { recordOp: rec.opId, polledOld: log.statuses.some((u) => u.includes('lab-proj-mock')), polledOther: log.statuses.some((u) => u.includes('lab-other')) };
    note(rec.opId === 'op-OTHER0000', 'a late result for the old operation overwrote the newer record');
    note(!results.stale.polledOld, 'a late result for the old operation started polling its lab');
    await ctx.close();
  }

  // 6. 503 keeps the lab and offers no Retry / new provision
  {
    const { ctx, pg } = await scenario({ status: { status: 503, body: { state: 'unavailable', retryable: true } } });
    await btn(pg, /provision my environment/i).click();
    await pg.getByText(/Reconnecting to Azure/i).waitFor({ timeout: 8000 });
    results.transient = {
      retry: await visible(pg, /retry|start a new lab/i), provision: await visible(pg, /provision my environment/i), recordKept: !!(await stored(pg)),
    };
    note(!results.transient.retry && !results.transient.provision, '503 offered a button that could start another lab');
    note(results.transient.recordKept, '503 dropped the saved lab');
    await ctx.close();
  }

  // 7. 404 missing clears the record and allows a new lab
  {
    const { ctx, pg } = await scenario({ status: { status: 404, body: { state: 'missing' } } });
    await btn(pg, /provision my environment/i).click();
    await pg.getByText(/no longer exists/i).waitFor({ timeout: 8000 });
    results.missing = { startNew: await visible(pg, /start a new lab/i), recordCleared: (await stored(pg)) === null };
    note(results.missing.startNew && results.missing.recordCleared, '404 missing did not clear the lab and offer a new one');
    await ctx.close();
  }

  // 8. unverified (record gone, resource still there) keeps the lab and blocks another
  {
    const { ctx, pg } = await scenario({ status: { status: 200, body: { state: 'unverified', stage: 1, resourceExists: true } } });
    await btn(pg, /provision my environment/i).click();
    await pg.waitForTimeout(3500);
    results.unverified = { provisioning: await visible(pg, /provisioning/i), provision: await visible(pg, /provision my environment/i), recordKept: !!(await stored(pg)) };
    note(results.unverified.provisioning && !results.unverified.provision && results.unverified.recordKept, 'unverified lab was dropped or allowed a second lab');
    await ctx.close();
  }

  // 9. an expired saved lab is cleared on load
  {
    const { ctx, pg, log } = await scenario();
    await pg.evaluate(([k, exp]) => localStorage.setItem(k, JSON.stringify({ opId: 'op-EXPIRED00', plat: 'foundry', phase: 'polling', createdAt: Date.now() - 9e6, deploymentName: 'x', accountName: 'a', projectName: 'p', expiresAt: exp })), [KEY, new Date(Date.now() - 1000).toISOString()]);
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForTimeout(800);
    results.expired = { provision: await visible(pg, /provision my environment/i), recordCleared: (await stored(pg)) === null, polled: log.statuses.length };
    note(results.expired.provision && results.expired.recordCleared && results.expired.polled === 0, 'expired lab not cleared on load');
    await ctx.close();
  }

  // 11. Azure reports the deployment Failed (409): terminal, record cleared, a new lab is offered, no retry loop
  {
    const { ctx, pg, log } = await scenario({ provisionStatus: 409 });
    await btn(pg, /provision my environment/i).click();
    await pg.getByText(/deployment failed/i).waitFor({ timeout: 6000 });
    await pg.waitForTimeout(800);
    results.failedDeployment = { startNew: await visible(pg, /start a new lab/i), retrySame: await visible(pg, /retry \(same lab\)/i), recordCleared: (await stored(pg)) === null, posts: log.posts.length };
    note(results.failedDeployment.startNew && !results.failedDeployment.retrySame && results.failedDeployment.recordCleared, 'a failed deployment locked the learner out instead of offering a new lab');
    note(log.posts.length === 1, 'a failed deployment was re-sent');
    // and a new lab can really be started afterwards
    await btn(pg, /start a new lab/i).click();
    await pg.waitForTimeout(800);
    note(log.posts.length === 2 && distinctOps(log) === 2, 'starting a new lab after a failure did not send a NEW operation');
    await ctx.close();
  }

  // 12. a READY lab still expires while the page stays open
  {
    const { ctx, pg } = await scenario({ expiresInMs: 4000, status: { status: 200, body: { state: 'Succeeded', stage: 4, portalUrl: 'https://portal.azure.com/x' } } });
    await btn(pg, /provision my environment/i).click();
    await pg.getByText(/Ready · expires/i).waitFor({ timeout: 6000 });
    await pg.getByText(/Your lab has expired/i).waitFor({ timeout: 9000 }).catch(() => {});
    results.readyExpiry = { expiredShown: await pg.getByText(/Your lab has expired/i).isVisible().catch(() => false), startNew: await visible(pg, /start a new lab/i), recordCleared: (await stored(pg)) === null };
    note(results.readyExpiry.expiredShown && results.readyExpiry.startNew && results.readyExpiry.recordCleared, 'a Ready lab never expired on the open page');
    await ctx.close();
  }

  // 13. the status server keeps answering 500 (config/credential problem): stop, keep the lab, say so
  {
    const { ctx, pg } = await scenario({ status: { status: 500, body: { error: 'Failed to read status' } } });
    await btn(pg, /provision my environment/i).click();
    await pg.getByText(/Can't check your lab right now/i).waitFor({ timeout: 15000 }).catch(() => {});
    results.serverError = { stuckShown: await pg.getByText(/Can't check your lab right now/i).isVisible().catch(() => false), provision: await visible(pg, /provision my environment|start a new lab|retry/i), recordKept: !!(await stored(pg)) };
    note(results.serverError.stuckShown && !results.serverError.provision && results.serverError.recordKept, 'persistent 500 looped on "Reconnecting" or offered another lab');
    await ctx.close();
  }

  // 14. two tabs waiting on a request whose owner tab closed: exactly ONE takes it over
  {
    const { ctx, pg, log } = await scenario({ provisionDelay: 14000 });
    await btn(pg, /provision my environment/i).click();
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'requesting'), KEY, { timeout: 3000 });
    const b = await ctx.newPage(); await b.goto(BASE, { waitUntil: 'load' });
    const c = await ctx.newPage(); await c.goto(BASE, { waitUntil: 'load' });
    await pg.waitForTimeout(1500);
    note(log.posts.length === 1, 'waiting tabs sent a POST while the owner was alive (' + log.posts.length + ')');
    await pg.close(); // the owner dies: its heartbeat stops
    await b.waitForTimeout(10500);
    results.takeover = { posts: log.posts.length, distinctOperationIds: distinctOps(log) };
    note(log.posts.length === 2 && distinctOps(log) === 1, 'takeover after owner death should send exactly one more POST, got total ' + log.posts.length);
    await ctx.close();
  }

  // 15. leaving /labs while the POST is pending must not leave a second, orphaned poller behind
  {
    const { ctx, pg, log } = await scenario({ provisionDelay: 2500 });
    await btn(pg, /provision my environment/i).click();
    await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').phase === 'requesting'), KEY, { timeout: 3000 });
    await pg.evaluate(() => { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await pg.waitForTimeout(3500); // the POST resolves while the page is unmounted
    await pg.evaluate(() => { history.pushState({}, '', '/labs'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await pg.waitForTimeout(500);
    const before = log.statuses.length;
    await pg.waitForTimeout(8000);
    const polls = log.statuses.length - before;
    results.unmountPoll = { pollsIn8s: polls, posts: log.posts.length };
    note(polls <= 6, 'status is polled by more than one poller after leaving and returning (' + polls + ' polls in 8 s)');
    note(log.posts.length <= 2, 'leaving the page created extra POSTs: ' + log.posts.length);
    await ctx.close();
  }

  // 10. fail closed: Web Locks missing, and storage writes throwing -> provisioning disabled, no POST
  for (const [name, script] of [
    ['noLocks', () => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); }],
    ['throwingStorage', () => { Storage.prototype.setItem = function () { throw new DOMException('denied', 'QuotaExceededError'); }; }],
  ]) {
    const { ctx, pg, log } = await scenario({}, script);
    await pg.waitForTimeout(500);
    const enabled = await btn(pg, /provision my environment/i).isEnabled().catch(() => false);
    const warns = await pg.getByText(/can't safely keep track of your lab/i).isVisible().catch(() => false);
    await btn(pg, /provision my environment/i).click({ force: true, timeout: 1000 }).catch(() => {});
    await pg.waitForTimeout(500);
    results[name] = { enabled, warns, posts: log.posts.length };
    note(!enabled && warns && log.posts.length === 0, name + ': provisioning was not disabled / a POST was sent');
    await ctx.close();
  }

  note(consoleErrors.length === 0, 'console errors: ' + consoleErrors.join(' | ').slice(0, 400));
  return { PASS: fail.length === 0, fail, results, consoleErrors };
}
