// Tier A: targeting / navigation LOGIC, against test/fixture.html.
// Claims only that content.js behaves correctly when loaded into a page. It does NOT prove
// Chrome loads the extension (see verify-ext.mjs) or that selectors match the live portal.
//
// Run:
//   node <browser-automation>/browser.mjs "file:///<abs>/test/fixture.html" --script <abs>/test/verify.mjs

const BASE = 'file:///C:/dhinesh/Dhinesh/Dhinesh/ai_workboard/ghost-cursor-extension/test/fixture.html';

const STEP_LABELS = [
  "Click '+ New agent'",
  "Click the 'Agent name' field",
  "Open the 'Model' list",
  "Click the 'Instructions' box",
  "Click 'Try in playground'",
];
const STEP_TARGETS = ['#t1', '#t2', '#t3', '#t4', '#t5'];
const DECOYS = ['#oldDup', '#hiddenDup', '#decoyNone', '#decoyVis', '#decoyOpacity', '#decoyLabel'];

const R = '#aiwb-ghost-root';

export default async function run(page) {
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 900 });

  const fail = [];
  const note = (ok, msg) => { if (!ok) fail.push(msg); };

  const state = () => page.evaluate((r) => {
    const el = document.querySelector(r);
    return el ? { state: el.dataset.state, step: el.dataset.step, nav: Number(el.dataset.navCount) } : null;
  }, R);

  const waitState = (want, ms = 4000) =>
    page.waitForFunction(([r, w]) => document.querySelector(r)?.dataset.state === w, [R, want], { timeout: ms });

  // Poll until the 0.9s glide has settled on the target (or 3s pass), then report the offset.
  // A fixed sleep was flaky under load.
  const ringVsTarget = async (sel) => {
    let last;
    for (let i = 0; i < 30; i++) {
      last = await ringOffset(sel);
      if (last.dx <= 8 && last.dy <= 8) break;
      await page.waitForTimeout(100);
    }
    return last;
  };
  const ringOffset = (sel) => page.evaluate(([r, s]) => {
    const ring = document.querySelector(r + ' .aiwb-ring').getBoundingClientRect();
    const t = document.querySelector(s).getBoundingClientRect();
    return {
      dx: Math.abs(ring.left + ring.width / 2 - (t.left + t.width / 2)),
      dy: Math.abs(ring.top + ring.height / 2 - (t.top + t.height / 2)),
    };
  }, [R, sel]);

  // ---- A1-A4, A6, A7: full five-step sequence --------------------------------
  await page.goto(BASE, { waitUntil: 'load' });
  const sequence = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(([r, n]) => {
      const el = document.querySelector(r);
      return el && el.dataset.state === 'pointing' && el.dataset.step === String(n);
    }, [R, i], { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200); // let the 0.9s glide settle
    const { dx, dy } = await ringVsTarget(STEP_TARGETS[i]);
    const pillText = await page.evaluate((r) => document.querySelector(r + ' .aiwb-pill').textContent, R);
    const st = await state();
    sequence.push({ step: i, state: st && st.state, dx: Math.round(dx), dy: Math.round(dy), pillText });
    note(st && st.state === 'pointing' && st.step === String(i), 'step ' + i + ' not pointing');
    note(dx <= 8 && dy <= 8, 'step ' + i + ' cursor off target by ' + Math.round(dx) + ',' + Math.round(dy));
    note(pillText === STEP_LABELS[i], 'step ' + i + ' pill is "' + pillText + '"');
    // The cursor must not sit on any decoy.
    for (const d of DECOYS) {
      const r = await page.evaluate(([root, s]) => {
        const ring = document.querySelector(root + ' .aiwb-ring').getBoundingClientRect();
        const el = document.querySelector(s).getBoundingClientRect();
        return el.width > 0 && Math.abs(ring.left + ring.width / 2 - (el.left + el.width / 2)) <= 8 &&
          Math.abs(ring.top + ring.height / 2 - (el.top + el.height / 2)) <= 8;
      }, [R, d]);
      note(!r, 'step ' + i + ' cursor landed on decoy ' + d);
    }
    await page.dispatchEvent(STEP_TARGETS[i], 'click'); // A4: using the target advances
  }
  await waitState('done', 2000).catch(() => {});
  const finalState = await state();
  note(finalState && finalState.state === 'done', 'sequence did not finish in "done"');

  // ---- A8: navigation, on a fresh load ---------------------------------------
  await page.goto(BASE, { waitUntil: 'load' });
  await waitState('pointing');
  const nav = {};
  let before = (await state()).nav;
  await page.evaluate(() => { location.hash = '#a'; });                         // hashchange
  await page.waitForFunction(([r, n]) => Number(document.querySelector(r).dataset.navCount) > n, [R, before], { timeout: 2000 }).catch(() => {});
  nav.hashchange = (await state()).nav > before;
  const bannerOn = await page.evaluate((r) => document.querySelector(r + ' .aiwb-banner').classList.contains('aiwb-on'), R);
  note(bannerOn, 'navigation banner not visible after hashchange');
  before = (await state()).nav;
  await page.evaluate(() => { history.back(); });                               // popstate
  await page.waitForFunction(([r, n]) => Number(document.querySelector(r).dataset.navCount) > n, [R, before], { timeout: 2000 }).catch(() => {});
  nav.popstate = (await state()).nav > before;
  before = (await state()).nav;
  // Page-originated pushState: fires no hashchange/popstate and mutates no DOM, so only
  // URL polling can see it.
  await page.evaluate(() => { history.pushState({}, '', '#pushed'); });
  await page.waitForFunction(([r, n]) => Number(document.querySelector(r).dataset.navCount) > n, [R, before], { timeout: 2000 }).catch(() => {});
  nav.pushState = (await state()).nav > before;
  note(nav.hashchange, 'hashchange not detected');
  note(nav.popstate, 'popstate not detected');
  note(nav.pushState, 'DOM-free pushState not detected');

  // ---- A5: late target, deadline 2s ------------------------------------------
  const t0 = Date.now();
  await page.goto(BASE + '?delay=1', { waitUntil: 'domcontentloaded' });
  await waitState('waiting', 1500).catch(() => {});
  const sawWaiting = (await state()).state === 'waiting';
  await waitState('pointing', 2500).catch(() => {});
  const lateElapsed = Date.now() - t0;
  const lateState = (await state()).state;
  note(sawWaiting, 'delayed target: never showed waiting');
  note(lateState === 'pointing' && lateElapsed <= 2000, 'delayed target resolved late/never: ' + lateState + ' after ' + lateElapsed + 'ms');

  // ---- A5b: genuinely missing target times out, then recovers ----------------
  await page.goto(BASE + '?missing=1', { waitUntil: 'load' });
  await waitState('timeout', 3000).catch(() => {});
  const missingState = (await state()).state;
  note(missingState === 'timeout', 'missing target did not report timeout: ' + missingState);
  // GC-01: the message must be genuinely visible, not just a dataset flag.
  const vis = (sel) => page.evaluate(([r, c]) => {
    const e = document.querySelector(r + ' ' + c);
    const b = e.getBoundingClientRect();
    return { op: parseFloat(getComputedStyle(e).opacity), text: e.textContent, w: b.width };
  }, [R, sel]);
  await page.waitForTimeout(400); // opacity transition
  const tv = await vis('.aiwb-status');
  note(tv.op > 0.9 && /Can't find/.test(tv.text) && tv.w > 0, 'timeout message not visible: ' + JSON.stringify(tv));
  // GC-03: navigate AFTER the first deadline has fired; a stable targetless page must time out again.
  // (A page with NOTHING nearby on screen: if a later control were visible, navigating by hand would
  // now correctly move the cursor on instead, which is tested separately as "navmove".)
  await page.goto(BASE + '?nothing=1', { waitUntil: 'load' });
  await waitState('timeout', 3500).catch(() => {});
  await page.evaluate(() => { location.hash = '#after-deadline'; });
  await page.waitForTimeout(700);
  const mid = (await state()).state;
  await waitState('timeout', 3500).catch(() => {});
  note(mid !== 'timeout', 'navigation did not restart the step deadline (state stayed ' + mid + ')');
  note((await state()).state === 'timeout' && (await state()).step === '0', 'targetless page never timed out again after navigation');
  // back to the page whose target appears later
  await page.goto(BASE + '?missing=1', { waitUntil: 'load' });
  await waitState('timeout', 3000).catch(() => {});
  await page.evaluate(() => {
    const b = document.createElement('button'); b.id = 't1'; b.textContent = '+ New agent';
    document.getElementById('slot1').appendChild(b);
  });
  await waitState('pointing', 2000).catch(() => {});
  note((await state()).state === 'pointing', 'did not recover once target appeared');

  // ---- A1: placeholder and value kinds ---------------------------------------
  await page.goto(BASE + '?kinds=1', { waitUntil: 'load' });
  await waitState('pointing');
  await page.waitForTimeout(1200);
  let k = await ringVsTarget('#kindsSearch');
  note(k.dx <= 8 && k.dy <= 8, 'placeholder kind missed target');
  await page.dispatchEvent('#kindsSearch', 'click');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '1', R, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1200);
  k = await ringVsTarget('#kindsCreate');
  note(k.dx <= 8 && k.dy <= 8, 'value kind missed target');

  // ---- identical buttons: point at the first (found live: the real Foundry page has two) ----
  await page.goto(BASE, { waitUntil: 'load' });
  await waitState('pointing');
  await page.evaluate(() => {
    const b = document.createElement('button'); b.textContent = '+ New agent'; b.id = 'dupBtn';
    document.getElementById('bladeNew').appendChild(b);
  });
  await page.waitForTimeout(700);
  const dupState = (await state()).state;
  note(dupState === 'pointing', 'two identical buttons should still point (at the first), got ' + dupState);
  const first = await ringVsTarget('#t1');
  note(first.dx <= 8 && first.dy <= 8, 'with identical buttons the cursor did not go to the first one');

  // ---- ambiguity: two fields with the SAME label in one blade must NOT be guessed -----------
  await page.goto(BASE + '?dupfield=1', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const df = await state();
  note(df.state === 'ambiguous', 'two fields with the same label were guessed instead of reported: ' + df.state);
  await page.waitForTimeout(400);
  const av = await page.evaluate((r) => {
    const e = document.querySelector(r + ' .aiwb-status');
    return { op: parseFloat(getComputedStyle(e).opacity), text: e.textContent };
  }, R);
  note(av.op > 0.9 && /More than one/.test(av.text), 'ambiguity message not visible: ' + JSON.stringify(av));

  // ---- GC-02: label association survives nested label text -------------------
  await page.goto(BASE + '?assoc=1', { waitUntil: 'load' });
  await waitState('pointing');
  await page.waitForTimeout(1200);
  const assoc = await ringVsTarget('#aName');
  note(assoc.dx <= 8 && assoc.dy <= 8, 'label for= with nested span did not resolve to #aName');

  // ---- GC-07: aria-labelledby on a non-label ancestor, control BEFORE the caption ---
  await page.goto(BASE + '?lbl7=1', { waitUntil: 'load' });
  await waitState('pointing');
  const l7 = await ringVsTarget('#lbCorrect');
  note(l7.dx <= 8 && l7.dy <= 8, 'aria-labelledby caption resolved to the wrong control (not #lbCorrect)');

  // ---- GC-08: explicit for= whose input has not rendered must wait, not borrow ----
  await page.goto(BASE + '?async8=1', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const early = (await state()).state;
  note(early === 'waiting', 'unresolved for= pointed at a neighbouring control (state ' + early + ')');
  await waitState('timeout', 3000).catch(() => {});
  note((await state()).state === 'timeout', 'unresolved for= never timed out');
  await page.evaluate(() => {
    const i = document.createElement('input'); i.id = 'n8';
    document.getElementById('slot8').appendChild(i);
  });
  await waitState('pointing', 2000).catch(() => {});
  const l8 = await ringVsTarget('#n8');
  note(l8.dx <= 8 && l8.dy <= 8, 'late-rendered #n8 not pointed at');

  // ---- GC-09: aria-label on a group points at the control inside, no ambiguity ----
  await page.goto(BASE + '?grp9=1', { waitUntil: 'load' });
  await waitState('pointing', 3000).catch(() => {});
  note((await state()).state === 'pointing', 'group + control sharing aria-label produced ' + (await state()).state);
  const l9 = await ringVsTarget('#sel9');
  note(l9.dx <= 8 && l9.dy <= 8, 'aria-label group not resolved to the control inside it');

  // ---- GC-10: words split by <br> / block boundaries --------------------------------
  await page.goto(BASE + '?br10=1', { waitUntil: 'load' });
  await waitState('pointing', 3000).catch(() => {});
  const b10 = await ringVsTarget('#br10');
  note(b10.dx <= 8 && b10.dy <= 8, 'text split by <br> did not match');
  await page.goto(BASE + '?blk10=1', { waitUntil: 'load' });
  await waitState('pointing', 3000).catch(() => {});
  const k10 = await ringVsTarget('#in10');
  note(k10.dx <= 8 && k10.dy <= 8, 'label split across block elements did not match');

  // ---- resync: ONLY an `optional` step is skipped by itself, and only after the 2 s wait --------
  await page.goto(BASE + '?skipahead=1', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const optEarly = await state();
  note(optEarly.step === '0' && optEarly.state === 'waiting', 'an optional step was skipped before the 2 s wait (control may just be slow): ' + JSON.stringify(optEarly));
  await waitState('pointing', 4500).catch(() => {});
  const sa = await state();
  note(sa.state === 'pointing' && sa.step === '1', 'an optional step was not skipped when the NEXT control is already on screen: ' + JSON.stringify(sa));
  const saOff = await ringVsTarget('#t1');
  note(saOff.dx <= 8 && saOff.dy <= 8, 'after the automatic skip the cursor is not on the next control');

  // ---- a NON-optional missing step is never skipped silently: a renamed button looks the same ----
  await page.goto(BASE + '?jump=1', { waitUntil: 'load' });
  await waitState('timeout', 4500).catch(() => {});
  await page.waitForTimeout(1800); // well past any automatic move
  const jumpState = await state();
  note(jumpState.step === '0' && jumpState.state === 'timeout', 'a non-optional missing step was skipped by itself: ' + JSON.stringify(jumpState));
  const jumpUi = await page.evaluate((r) => { const j = document.querySelector(r + ' .aiwb-jump'); const s = document.querySelector(r + ' .aiwb-skip'); return { jumpHidden: j.hidden, jumpText: j.textContent, skipHidden: s.hidden }; }, R);
  note(!jumpUi.jumpHidden && /Jump to '\+ New agent'/.test(jumpUi.jumpText) && !jumpUi.skipHidden, 'no manual Jump offered for a later control on screen: ' + JSON.stringify(jumpUi));
  await page.click(R + ' .aiwb-jump');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '1', R, { timeout: 3000 }).catch(() => {});
  await waitState('pointing', 3000).catch(() => {});
  const jOff = await ringVsTarget('#t1');
  note((await state()).step === '1' && jOff.dx <= 8 && jOff.dy <= 8, 'Jump did not land on the later control');

  // ---- an optional step must NOT skip a required step that sits between it and a visible control ----
  await page.goto(BASE + '?optjump=1', { waitUntil: 'load' });
  await waitState('timeout', 4500).catch(() => {});
  await page.waitForTimeout(2000);
  const oj = await state();
  const ojUi = await page.evaluate((r) => ({ jump: document.querySelector(r + ' .aiwb-jump').hidden, text: document.querySelector(r + ' .aiwb-jump').textContent }), R);
  note(oj.step === '0' && oj.state === 'timeout', 'an optional step jumped over a required step by itself: ' + JSON.stringify(oj));
  note(!ojUi.jump && /Jump to '\+ New agent'/.test(ojUi.text), 'the later control was not OFFERED as a manual Jump: ' + JSON.stringify(ojUi));

  // ---- dialog fallback: the label is not there, but the open dialog's text box is found ---------
  await page.goto(BASE + '?dlg=1', { waitUntil: 'load' });
  await waitState('pointing', 4000).catch(() => {});
  const dlgOff = await ringVsTarget('#dlgIn');
  note((await state()).state === 'pointing' && dlgOff.dx <= 8 && dlgOff.dy <= 8, 'dialog fallback did not find the dialog text box: ' + JSON.stringify(await state()));

  // ---- the page changed its own address and the learner did NOTHING: must NOT move ------------
  await page.goto(BASE + '?navmove=1', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '#page-did-this'; }); // scripted: no real click
  await waitState('timeout', 6000).catch(() => {});
  await page.waitForTimeout(1500);
  const auto = await state();
  note(auto.step === '0' && auto.state === 'timeout', 'a page-made address change moved the cursor on without the learner doing anything: ' + JSON.stringify(auto));

  // ---- the LEARNER really clicked and the address changed: move on to the next step ------------
  await page.goto(BASE + '?navmove=1', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#goOn'); // a real click (trusted), which changes the address
  await waitState('pointing', 8000).catch(() => {});
  const nm = await state();
  const nmOff = await ringVsTarget('#t1');
  note(nm.step === '1' && nm.state === 'pointing' && nmOff.dx <= 8 && nmOff.dy <= 8, 'cursor did not move on after the learner clicked and the page changed: ' + JSON.stringify(nm));

  // ---- it may pass over a step that is no longer reachable, but must SAY which --------------
  await page.goto(BASE + '?navfar=1', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#goOn');
  await waitState('pointing', 8000).catch(() => {});
  const nf = await state();
  const nfBanner = await page.evaluate((r) => document.querySelector(r + ' .aiwb-banner').textContent, R);
  const nfOff = await ringVsTarget('#t1');
  note(nf.step === '2' && nfOff.dx <= 8 && nfOff.dy <= 8, 'did not continue at the control that is on screen: ' + JSON.stringify(nf));
  note(/Skipped:/.test(nfBanner) && /Also not on this screen/.test(nfBanner), 'the skipped step was not named: ' + nfBanner);

  // ---- dialog fallback: ignore a non-modal flyout, a search box and a combobox ------------------
  await page.goto(BASE + '?dlghard=1', { waitUntil: 'load' });
  await waitState('pointing', 5000).catch(() => {});
  const hardOff = await ringVsTarget('#dlgReal');
  note((await state()).state === 'pointing' && hardOff.dx <= 8 && hardOff.dy <= 8, 'dialog fallback picked the wrong field (flyout / search / combobox): ' + JSON.stringify(await state()));

  // ---- a label whose control is still rendering must WAIT, not borrow another box ---------------
  await page.goto(BASE + '?dlgpend=1', { waitUntil: 'load' });
  await page.waitForTimeout(2600); // past the 2 s deadline, before the real input arrives at 3 s
  const pend = await state();
  const borrowed = await page.evaluate((r) => {
    const ring = document.querySelector(r + ' .aiwb-ring').getBoundingClientRect();
    const o = document.querySelector('#dlgOther').getBoundingClientRect();
    return Math.hypot(ring.left + ring.width / 2 - (o.left + o.width / 2), ring.top + ring.height / 2 - (o.top + o.height / 2));
  }, R);
  note(pend.state !== 'pointing' && borrowed > 20, 'the fallback borrowed another field while the real one was still rendering: ' + JSON.stringify([pend, borrowed]));
  await waitState('pointing', 4000).catch(() => {});
  const pendOff = await ringVsTarget('#pendIn');
  note(pendOff.dx <= 8 && pendOff.dy <= 8, 'did not point at the labelled input once it rendered');

  // ---- nothing nearby on screen: plain timeout, Skip only (no Jump, no Go back) ---------------
  await page.goto(BASE + '?nothing=1', { waitUntil: 'load' });
  await waitState('timeout', 4500).catch(() => {});
  const nothingUi = await page.evaluate((r) => ({ jump: document.querySelector(r + ' .aiwb-jump').hidden, back: document.querySelector(r + ' .aiwb-back').hidden, skip: document.querySelector(r + ' .aiwb-skip').hidden }), R);
  note(nothingUi.jump && nothingUi.back && !nothingUi.skip, 'with nothing nearby on screen only Skip should show: ' + JSON.stringify(nothingUi));

  // ---- the look-ahead window is 3 steps: a control 4 steps ahead is NOT used ---------------------
  await page.goto(BASE + '?farahead=1', { waitUntil: 'load' });
  await page.waitForTimeout(4200);
  const far = await state();
  const farJump = await page.evaluate((r) => document.querySelector(r + ' .aiwb-jump').hidden, R);
  note(far.step === '0' && farJump, 'a control 4 steps ahead should be ignored: ' + JSON.stringify([far, farJump]));

  // ---- resync: on a screen where an EARLIER step's control is still showing, offer "Go back" -----
  await page.goto(BASE + '?goback=1', { waitUntil: 'load' });
  await waitState('pointing');
  await page.dispatchEvent('#t1', 'click'); // step 0 done -> step 1 ("later step") cannot be found
  await waitState('timeout', 4500).catch(() => {});
  const backShown = await page.evaluate((r) => { const b = document.querySelector(r + ' .aiwb-back'); return { hidden: b.hidden, text: b.textContent }; }, R);
  note(!backShown.hidden && /Go back to '\+ New agent'/.test(backShown.text), 'no "Go back" offered when an earlier control is on screen: ' + JSON.stringify(backShown));
  await page.click(R + ' .aiwb-back');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '0', R, { timeout: 3000 }).catch(() => {});
  note((await state()).step === '0', 'Go back did not return to the earlier step');
  await waitState('pointing', 3000).catch(() => {});
  const backOff = await ringVsTarget('#t1');
  note(backOff.dx <= 8 && backOff.dy <= 8, 'after Go back the cursor is not on the earlier control');
  // and it never goes back by itself: wait, still on step 0 pointing (no ping-pong)
  await page.waitForTimeout(2500);
  note((await state()).step === '0' && (await state()).state === 'pointing', 'cursor moved by itself after Go back');

  // ---- Skip step: a missing control must never trap the learner --------------------------
  await page.goto(BASE + '?missing=1', { waitUntil: 'load' });
  await waitState('timeout', 3500).catch(() => {});
  const skipVisible = await page.evaluate((r) => !document.querySelector(r + ' .aiwb-skip').hidden, R);
  note(skipVisible, 'no Skip button while the control is missing');
  await page.click(R + ' .aiwb-skip');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '1', R, { timeout: 2000 }).catch(() => {});
  note((await state()).step === '1', 'Skip did not move to the next step');
  await waitState('pointing', 3000).catch(() => {});
  const skipHidden = await page.evaluate((r) => document.querySelector(r + ' .aiwb-skip').hidden, R);
  note(skipHidden, 'Skip button still visible while pointing');
  // the overlay must still not intercept clicks anywhere else
  const blocked = await page.evaluate((r) => getComputedStyle(document.querySelector(r)).pointerEvents, R);
  note(blocked === 'none', 'overlay root intercepts clicks');

  // ---- exact: "Create" must not grab "Create deployment" when asked to be exact -------
  await page.goto(BASE + '?exactoff=1', { waitUntil: 'load' });
  await waitState('pointing', 3000).catch(() => {});
  const eo = await ringVsTarget('#createDep');
  note(eo.dx <= 8 && eo.dy <= 8, 'without exact, the substring fallback should still work (sanity)');
  await page.goto(BASE + '?exacton=1', { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const ex = await state();
  note(ex.state === 'timeout', 'exact step pointed at a partial match instead of waiting/timing out: ' + ex.state);

  // ---- alternative wordings: the first alternative that exists is used ---------------
  await page.goto(BASE + '?alts=1', { waitUntil: 'load' });
  await waitState('pointing', 3000).catch(() => {});
  const alt = await ringVsTarget('#t5');
  note(alt.dx <= 8 && alt.dy <= 8, 'match list did not fall through to the alternative that exists');

  // ---- per-site steps with a GLOBAL order: the current step belongs to another site -> nothing here --
  await page.goto(BASE + '?hostmix=1', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  note(!(await page.evaluate(() => !!document.getElementById('aiwb-ghost-root'))), 'a step for another site was acted on here');
  await page.goto(BASE + '?hostnone=1', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  note(!(await page.evaluate(() => !!document.getElementById('aiwb-ghost-root'))), 'extension injected UI although no step belongs to this site');

  // ---- GC-04: focus alone must not advance a step ----------------------------
  await page.goto(BASE, { waitUntil: 'load' });
  await waitState('pointing');
  await page.dispatchEvent('#t1', 'click');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '1', R, { timeout: 2000 }).catch(() => {});
  await page.dispatchEvent('#t2', 'click');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '2', R, { timeout: 2000 }).catch(() => {});
  await page.focus('#t3'); // tabbing into the Model select, no click
  await page.waitForTimeout(600);
  note((await state()).step === '2', 'focus alone advanced the step (now ' + (await state()).step + ')');
  await page.dispatchEvent('#t3', 'click');
  await page.waitForFunction((r) => document.querySelector(r).dataset.step === '3', R, { timeout: 2000 }).catch(() => {});
  note((await state()).step === '3', 'click on the pointed-at select did not advance');

  // ---- A9 --------------------------------------------------------------------
  const networkRequests = requests.filter((u) => !u.startsWith('file://'));
  note(networkRequests.length === 0, 'network requests: ' + networkRequests.join(','));
  note(consoleErrors.length === 0, 'console errors: ' + consoleErrors.join(' | '));
  note(pageErrors.length === 0, 'page errors: ' + pageErrors.join(' | '));

  return { PASS: fail.length === 0, fail, sequence, nav, lateElapsed, networkRequests, consoleErrors, pageErrors };
}
