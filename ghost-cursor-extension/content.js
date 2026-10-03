// Ghost cursor content script. Runs in Chrome's isolated world, so it must not rely on
// patching page APIs: navigation is detected by watching the resulting URL.
//
// It is INACTIVE until the AI Workboard app starts a guided session (see bridge.js): "Open portal
// only" must just open Azure, and ordinary Azure browsing must never show a cursor.
//
// One session, one GLOBAL step counter (chrome.storage.local.aiwbGuide.step) shared by every Azure
// tab. Each tab acts only on the current step and only if that step belongs to its own site
// (portal.azure.com or ai.azure.com). Finishing a step writes step+1, so the portal tab goes idle
// and the Foundry tab picks up, and a page reload resumes at the same step. The session ends only
// when the LAST step is done, on "End guide", when the app sends "off", or 2 hours after the last
// progress. The pure rules live in guide-core.js.
(() => {
  const GUIDE_KEY = 'aiwbGuide';
  const core = window.AIWB_GUIDE_CORE;
  const ALL = window.AIWB_STEPS || [];
  if (!core || !ALL.length) return;
  const store = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null;

  let session = null; // the shared session (from storage; in-memory only in the logic test fixture)
  let runner = null;  // this tab's overlay, if it is the one that should act
  let ttlTimer = 0;
  let navPoll = 0;
  let seenHref = location.href;

  const commit = (next) => { session = next; if (store) store.set({ [GUIDE_KEY]: next }); apply(); };
  const hooks = {
    advance: (to) => commit(core.advance(session, to, Date.now())),
    end: () => commit({ on: false }),
  };

  // The portal is a single-page app: moving to another resource changes the URL without reloading
  // this script. Whether this page is the lab's own page (step 0) depends on the URL, so it must be
  // re-checked on every in-place navigation, in both directions (leave the lab page -> go idle;
  // arrive at the lab page -> start). The poll only runs while a session is on.
  function onUrlChange() {
    if (location.href === seenHref) return;
    seenHref = location.href;
    apply();
  }
  window.addEventListener('hashchange', onUrlChange);
  window.addEventListener('popstate', onUrlChange);

  function apply() {
    clearTimeout(ttlTimer);
    clearInterval(navPoll);
    seenHref = location.href;
    const now = Date.now();
    if (core.isLive(session, now)) navPoll = setInterval(onUrlChange, 300);
    const idx = core.activeStep(session, ALL, location.hostname, location.href, now);
    if (idx < 0) { if (runner) { runner.destroy(); runner = null; } return; }
    // The limit also applies to a tab that is already running, and slides with progress.
    ttlTimer = setTimeout(apply, core.expiresInMs(session, now) + 50);
    if (!runner) runner = run(ALL, idx, hooks);
    else runner.setIndex(idx);
  }

  if (!store) { // no extension APIs (the logic-test fixture): always on, in memory
    session = { on: true, at: Date.now(), step: 0 };
    apply();
    return;
  }
  store.get(GUIDE_KEY, (r) => { session = (r && r[GUIDE_KEY]) || null; apply(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[GUIDE_KEY]) return;
    session = changes[GUIDE_KEY].newValue || null;
    apply();
  });

  // Returns { setIndex, destroy }. STEPS is the whole global list; startIndex is the global step.
  function run(STEPS, startIndex, hooks) {
  if (document.getElementById('aiwb-ghost-root')) return null;
  let alive = true;
  const wording = (step) => [].concat(step.match);

  const BLADE = '.blade,[role=dialog],dialog,[data-blade]';
  const CONTROLS = 'input,textarea,select,button,[role=combobox],[role=textbox],[contenteditable=true]';
  const TIMEOUT_MS = 2000;
  const NAV_POLL_MS = 300;
  const NAV_SHOW_MS = 3000;

  let index = startIndex;
  let stepStart = Date.now();
  let target = null;
  let lastHref = location.href;
  let navCount = 0;
  let navTimer = 0;
  let deadlineTimer = 0;
  let raf = 0;

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  // ---- DOM ----------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'aiwb-ghost-root';
  root.innerHTML =
    '<div class="aiwb-cursor"><div class="aiwb-ring"></div>' +
    '<svg class="aiwb-arrow" viewBox="0 0 22 22"><path d="M2 2l6.5 17 2.6-7.2L18.5 9z" fill="#3E6AE1" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
    '<div class="aiwb-pill"></div></div><div class="aiwb-banner"></div>' +
    '<div class="aiwb-status"><span class="aiwb-status-text"></span><button type="button" class="aiwb-skip" hidden>Skip step</button></div>' +
    '<button type="button" class="aiwb-end">End guide</button>';
  document.documentElement.appendChild(root);
  const cursor = root.querySelector('.aiwb-cursor');
  const pill = root.querySelector('.aiwb-pill');
  const banner = root.querySelector('.aiwb-banner');
  const status = root.querySelector('.aiwb-status');
  const statusText = root.querySelector('.aiwb-status-text');
  const skipBtn = root.querySelector('.aiwb-skip');
  const endBtn = root.querySelector('.aiwb-end');
  root.dataset.navCount = '0';

  // ---- visibility ---------------------------------------------------------
  // True when the element is actually rendered. Opacity is checked on every ancestor
  // because it hides a whole subtree without affecting layout.
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (getComputedStyle(el).visibility === 'hidden') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  }

  // Text the learner can actually see. innerText keeps opacity:0 text, so walk the
  // nodes and drop any hidden subtree ourselves.
  // maxChars (optional): the most non-space characters that can still matter. A match needs the
  // text to EQUAL the wanted text, so once an element's text is longer than that it cannot match:
  // give up immediately (null) instead of style-checking its whole subtree. Wrappers high in the
  // page (everything contains the label) are therefore skipped cheaply.
  function visibleText(el, maxChars) {
    let out = '';
    let count = 0;
    let over = false;
    const walk = (n) => {
      if (over) return;
      if (n.nodeType === 3) {
        out += n.nodeValue;
        if (maxChars !== undefined) {
          count += n.nodeValue.replace(/\s+/g, '').length;
          if (count > maxChars) over = true;
        }
        return;
      }
      if (n.nodeType !== 1) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
      // <br> and block-level boundaries are rendered word breaks; text nodes alone lose them.
      if (n.tagName === 'BR') { out += ' '; return; }
      const block = !/^inline/.test(cs.display);
      if (block) out += ' ';
      for (const c of n.childNodes) walk(c);
      if (block) out += ' ';
    };
    walk(el);
    return over ? null : norm(out);
  }

  // ---- resolution ---------------------------------------------------------
  // Cheap pre-check before any getComputedStyle work: the element's raw text, with all whitespace
  // removed on both sides, must contain the wanted text. textContent is a superset of the rendered
  // text (and <br>/block breaks only add whitespace), so this never drops a real match, but it
  // skips the expensive visibility walk for the vast majority of the page.
  const squash = (x) => x.replace(/\s+/g, '').toLowerCase();
  const mayContain = (el, want) => squash(el.textContent || '').includes(squash(want));

  // exact: only an exact match counts. Without it a short word like "Create" would also match
  // "Create deployment" when the real button is absent.
  function bestByText(els, want, exact) {
    const scored = els
      .filter((el) => mayContain(el, want))
      .filter(isVisible)
      .map((el) => {
        const t = visibleText(el, exact ? squash(want).length : undefined);
        if (t === null) return [el, 0];
        return [el, t === want ? 2 : !exact && t.includes(want) ? 1 : 0];
      })
      .filter(([, s]) => s);
    const top = Math.max(0, ...scored.map(([, s]) => s));
    return scored.filter(([, s]) => s === top).map(([el]) => el);
  }

  const toControl = (el) => (!el ? null : el.matches(CONTROLS) ? el : el.querySelector(CONTROLS));
  const visibleKids = (el) => [...el.children].filter(isVisible).length;

  // Returns { el } for a found control, { missing: true } when an explicit association exists
  // but its control is not on the page yet (the caller must keep waiting, not guess), or
  // null when the node carries no explicit association at all.
  function explicitControl(node) {
    let found = false;
    const forId = node.getAttribute && node.getAttribute('for');
    if (forId) {
      found = true;
      const el = toControl(document.getElementById(forId));
      if (el) return { el };
    }
    if (node.id) {
      const refs = [...document.querySelectorAll('[aria-labelledby~="' + CSS.escape(node.id) + '"]')];
      if (refs.length) {
        found = true;
        const el = refs.map(toControl).find((c) => c && isVisible(c));
        if (el) return { el };
      }
    }
    const inside = node.querySelector && node.querySelector(CONTROLS);
    if (inside && node.tagName === 'LABEL') return { el: inside };
    return found ? { missing: true } : null;
  }

  // Position-based fallback, bounded to the label's own field: the first sibling after the
  // label's outermost sole wrapper that is or holds a control, stopping at any other visible
  // text so a neighbouring field's control is never borrowed.
  function positionalControl(labelEl) {
    let w = labelEl;
    while (w.parentElement && w.parentElement !== document.body && visibleKids(w.parentElement) === 1) {
      w = w.parentElement;
    }
    for (let sib = w.nextElementSibling; sib; sib = sib.nextElementSibling) {
      if (!isVisible(sib)) continue;
      const c = toControl(sib);
      if (c && isVisible(c)) return c;
      if (visibleText(sib)) return null;
    }
    return null;
  }

  // For a matched text leaf: honour explicit associations on the leaf and on every ancestor
  // that carries the same text (e.g. <label for><span>text</span></label>), then fall back.
  function controlFor(leaf) {
    const want = visibleText(leaf);
    for (let n = leaf; n && n !== document.body; n = n.parentElement) {
      if (n !== leaf && visibleText(n, squash(want).length) !== want) break;
      const hit = explicitControl(n);
      if (hit) return hit;
    }
    const el = positionalControl(leaf);
    return el ? { el } : null;
  }

  // Try each alternative wording in order; the first that finds something wins.
  function candidates(step) {
    for (const w of wording(step)) {
      const found = candidatesFor(step.kind, norm(w), !!step.exact);
      if (found.length) return found;
    }
    return [];
  }

  function candidatesFor(kind, want, exact) {
    switch (kind) {
      case 'text':
        return bestByText([...document.querySelectorAll('button,a,[role=button],[role=link],[role=tab],[role=menuitem]')], want, exact);
      case 'placeholder':
        return [...document.querySelectorAll('input,textarea')]
          .filter((el) => isVisible(el) && norm(el.getAttribute('placeholder') || '').includes(want));
      case 'value':
        return [...document.querySelectorAll('input[type=submit],input[type=button]')]
          .filter((el) => isVisible(el) && norm(el.value || '').includes(want));
      case 'label': {
        const all = [...document.querySelectorAll('label,legend,span,div,p,th,td,h3,h4')]
          .filter((el) => mayContain(el, want))
          .filter(isVisible);
        const wantLen = squash(want).length;
        const exact = all.filter((el) => visibleText(el, wantLen) === want);
        // Keep the innermost element carrying the label text.
        const leaves = exact.filter((el) => !exact.some((o) => o !== el && el.contains(o)));
        const hits = leaves.map(controlFor).filter(Boolean);
        const byLabel = hits.map((h) => h.el).filter(Boolean);
        // aria-label can sit on a wrapper (role=group); point at the control inside, never the wrapper.
        const byAria = [...document.querySelectorAll('[aria-label]')]
          .filter((el) => isVisible(el) && norm(el.getAttribute('aria-label')) === want)
          .map(toControl);
        const merged = [...new Set([...byLabel, ...byAria])].filter((el) => el && isVisible(el));
        // An explicit association whose control has not rendered yet means "wait", not "borrow".
        if (!merged.length && hits.some((h) => h.missing)) return [];
        return merged;
      }
      default:
        return [];
    }
  }

  // Returns { el } | { ambiguous: true } | null.
  function resolve(step) {
    let found = candidates(step);
    if (found.length > 1) {
      // The portal stacks blades; the newest one is last in the document.
      const boxOf = (el) => el.closest(BLADE) || document.body;
      const boxes = [...new Set(found.map(boxOf))];
      const top = boxes.reduce((a, b) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a));
      found = found.filter((el) => boxOf(el) === top);
    }
    // Several visible buttons/links with the SAME text (the real Foundry resource page has "Go to
    // Foundry portal" in both the toolbar and a "Get started" panel) all do the same thing, so
    // point at the first one. Form fields are different: two fields with the same label are
    // genuinely ambiguous, so those still report it instead of guessing.
    if (found.length > 1 && step.kind === 'text') found = [found[0]];
    if (found.length === 1) return { el: found[0] };
    return found.length ? { ambiguous: true } : null;
  }

  // ---- render -------------------------------------------------------------
  function say(text, state) {
    pill.textContent = text;
    // The pill rides on the cursor, which is hidden whenever there is no target, so
    // anything that is not "pointing" is also shown in a fixed, always-visible bar.
    statusText.textContent = state === 'pointing' ? '' : text;
    status.classList.toggle('aiwb-on', state !== 'pointing');
    // If a control is missing, ambiguous, or Microsoft renamed it, the learner must never be stuck:
    // offer to move on to the next step.
    skipBtn.hidden = state === 'pointing' || state === 'done';
    root.dataset.state = state;
    root.dataset.step = String(index);
  }

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    cursor.style.transform = 'translate(' + (r.left + r.width / 2) + 'px,' + (r.top + r.height / 2) + 'px)';
  }

  function refresh() {
    raf = 0;
    if (!alive) return;
    lastRefreshAt = performance.now();
    if (index >= STEPS.length) return;
    const step = STEPS[index];
    const hit = resolve(step);
    if (hit && hit.el) {
      target = hit.el;
      cursor.classList.add('aiwb-on');
      say(step.label, 'pointing');
      place();
    } else if (hit) {
      target = null;
      cursor.classList.remove('aiwb-on');
      say("More than one '" + wording(step)[0] + "' on screen - can't tell which", 'ambiguous');
    } else {
      target = null;
      cursor.classList.remove('aiwb-on');
      const late = Date.now() - stepStart >= TIMEOUT_MS;
      say(late ? "Can't find '" + wording(step)[0] + "' on this page" : 'Looking for ' + wording(step)[0] + '...',
        late ? 'timeout' : 'waiting');
    }
  }

  // Re-resolving walks the page, so never more than about every 120 ms however busy the page is.
  let lastRefreshAt = 0;
  let refreshTimer = 0;
  function schedule() {
    if (!alive || raf || refreshTimer) return;
    const wait = Math.max(0, 120 - (performance.now() - lastRefreshAt));
    if (wait === 0) raf = requestAnimationFrame(refresh);
    else refreshTimer = window.setTimeout(() => { refreshTimer = 0; raf = requestAnimationFrame(refresh); }, wait);
  }

  function startStep(i) {
    index = i;
    stepStart = Date.now();
    target = null;
    if (index >= STEPS.length) {
      cursor.classList.remove('aiwb-on');
      say('All steps complete', 'done');
      // Leave the message up for a moment, then end the session.
      setTimeout(() => { if (alive && index >= STEPS.length) hooks.end(); }, 6000);
      return;
    }
    refresh();
    armDeadline();
  }

  // Re-evaluate at the deadline so a missing target flips from waiting to timeout. Every
  // reset of stepStart must re-arm it, or a page change after the first deadline never times out.
  function armDeadline() {
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(schedule, TIMEOUT_MS + 50);
  }

  // ---- advance ------------------------------------------------------------
  function onUse(e) {
    if (!target || !target.contains(e.target)) return;
    // Only a click counts: focus alone (tabbing past, programmatic focus) must not advance.
    // The index guard drops duplicate or stale deliveries.
    const at = index;
    setTimeout(() => { if (alive && index === at) hooks.advance(at + 1); }, 0);
  }
  document.addEventListener('click', onUse, true);
  endBtn.addEventListener('click', () => hooks.end());
  skipBtn.addEventListener('click', () => {
    const at = index;
    setTimeout(() => { if (alive && index === at) hooks.advance(at + 1); }, 0);
  });

  // ---- navigation ---------------------------------------------------------
  function onNavigate() {
    if (!alive || location.href === lastHref) return;
    lastHref = location.href;
    navCount += 1;
    root.dataset.navCount = String(navCount);
    banner.textContent = 'Page changed - finding your next step...';
    banner.classList.add('aiwb-on');
    clearTimeout(navTimer);
    navTimer = setTimeout(() => banner.classList.remove('aiwb-on'), NAV_SHOW_MS);
    stepStart = Date.now();
    armDeadline();
    schedule();
  }
  const navTick = setInterval(onNavigate, NAV_POLL_MS);
  window.addEventListener('hashchange', onNavigate);
  window.addEventListener('popstate', onNavigate);

  // ---- keep in sync with the page ----------------------------------------
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);

  startStep(startIndex);

  // Remove everything this run added, so ending a session leaves the page exactly as it was.
  const destroy = () => {
    alive = false;
    clearInterval(navTick);
    clearTimeout(deadlineTimer);
    clearTimeout(refreshTimer);
    clearTimeout(navTimer);
    if (raf) cancelAnimationFrame(raf);
    mutations.disconnect();
    document.removeEventListener('click', onUse, true);
    window.removeEventListener('hashchange', onNavigate);
    window.removeEventListener('popstate', onNavigate);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    root.remove();
  };
  // The shared step changed (here or in another tab): follow it, unless we are already there.
  const setIndex = (i) => { if (alive && i !== index) startStep(i); };
  return { setIndex, destroy };
  }
})();
