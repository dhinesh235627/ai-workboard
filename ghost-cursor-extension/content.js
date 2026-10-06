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

  // ---- voice (voice.js): each moment is spoken once, however often the page re-renders -------------
  const V = window.AIWB_VOICE;
  const SPEAK = window.AIWB_SPEAK || [];
  const LINES = window.AIWB_LINES || {};
  const said = new Set(); // what was spoken during this step (cleared when a step starts)
  const voiceSay = (key, lines) => {
    if (!V || !lines || said.has(key)) return;
    said.add(key);
    V.speak(lines, session, () => {
      banner.textContent = 'Click anywhere on the page to hear my voice';
      banner.classList.add('aiwb-on');
      setTimeout(() => banner.classList.remove('aiwb-on'), NAV_SHOW_MS + 3000);
    });
  };

  // ---- nudge: the step is pointed at but not done 15 s after the guide stopped talking -> say it again,
  // in a different sentence, and pulse the cursor. At most AIWB_NUDGE[i].length times per step, then quiet.
  // Any real click or keypress restarts the 15 s (the learner is busy, e.g. typing the agent name).
  const NUDGE = window.AIWB_NUDGE || [];
  const NUDGE_MS = 15000;
  // ponytail: speech length is estimated (slow voice ~450 ms a word), so the wait starts after the guide
  // has finished talking; use the audio's real 'ended' event if the estimate ever cuts a sentence off.
  const talkMs = (lines) => (lines || []).join(' ').split(/\s+/).length * 450;
  let nudgeTimer = 0;
  let nudgeFor = -1;
  let nudged = 0;
  function armNudge(wait) {
    clearTimeout(nudgeTimer);
    const next = NUDGE[index] && NUDGE[index][nudged];
    nudgeTimer = next ? setTimeout(nudge, wait) : 0;
    if (next && V) V.warm([next], session);
  }
  function nudge() {
    nudgeTimer = 0;
    if (!alive || index >= STEPS.length) return;
    // Not pointing right now (page still loading) or another tab is in front: wait another round.
    if (!target || document.visibilityState !== 'visible') { armNudge(NUDGE_MS); return; }
    const line = NUDGE[index][nudged++];
    voiceSay('n' + index + '.' + nudged, [line]);
    cursor.classList.remove('aiwb-nudge');
    void cursor.offsetWidth; // restart the pulse animation
    cursor.classList.add('aiwb-nudge');
    armNudge(NUDGE_MS + talkMs([line]));
  }

  const BLADE = '.blade,[role=dialog],dialog,[data-blade]';
  const CONTROLS = 'input,textarea,select,button,[role=combobox],[role=textbox],[contenteditable=true]';
  const TIMEOUT_MS = 2000;
  const NAV_POLL_MS = 300;
  const NAV_SHOW_MS = 3000;

  let index = startIndex;
  let stepStart = Date.now();
  let actedAt = 0; // last REAL click/keypress by the learner in this page (never a scripted one)
  // When the STEP began. Separate from stepStart, which navigation resets to restart the 2 s wait:
  // the "you already did it" evidence must survive that reset.
  let stepBeganAt = Date.now();
  let stepHref = location.href; // where the page was when this step began: a change means the learner moved on
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
    '<div class="aiwb-status"><span class="aiwb-status-text" role="status" aria-live="polite"></span><button type="button" class="aiwb-back" hidden></button><button type="button" class="aiwb-jump" hidden></button><button type="button" class="aiwb-skip" hidden>Skip step</button></div>' +
    '<button type="button" class="aiwb-mute">Voice on</button><button type="button" class="aiwb-end">End guide</button>';
  document.documentElement.appendChild(root);
  const cursor = root.querySelector('.aiwb-cursor');
  const pill = root.querySelector('.aiwb-pill');
  const banner = root.querySelector('.aiwb-banner');
  const status = root.querySelector('.aiwb-status');
  const statusText = root.querySelector('.aiwb-status-text');
  const skipBtn = root.querySelector('.aiwb-skip');
  const backBtn = root.querySelector('.aiwb-back');
  const jumpBtn = root.querySelector('.aiwb-jump');
  let backTo = -1;
  let jumpTo = -1;
  const endBtn = root.querySelector('.aiwb-end');
  const muteBtn = root.querySelector('.aiwb-mute');
  const showMute = () => { muteBtn.textContent = V && V.isMuted() ? 'Voice off' : 'Voice on'; };
  muteBtn.hidden = !V;
  muteBtn.addEventListener('click', () => { V.toggleMute(); showMute(); });
  if (V) setTimeout(showMute, 300); // the saved choice loads asynchronously
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
    const best = scored.filter(([, s]) => s === top).map(([el]) => el);
    // A "contains" match can hit a long summary line as well as the control itself ("Model: gpt-5" in a
    // header vs the picker). The shortest visible text is the closest thing to the control.
    if (top === 1 && best.length > 1) {
      return best.slice().sort((a, b) => visibleText(a).length - visibleText(b).length);
    }
    return best;
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
  let pendingAssoc = false; // a label matched but its control has not rendered yet: wait, do not borrow
  function candidates(step) {
    pendingAssoc = false;
    for (const w of wording(step)) {
      const found = candidatesFor(step.kind, norm(w), !!step.exact);
      if (found.length) return found;
    }
    // A structural fallback (e.g. "the text box of the open dialog") is a LAST resort: only once the
    // wait is over, and never while an explicit association is merely pending, or it would borrow the
    // wrong field in the frame before the real one renders.
    if (step.fallback && !pendingAssoc && Date.now() - stepStart >= TIMEOUT_MS) {
      const found = candidatesFor(step.fallback, '', !!step.exact);
      if (found.length) return found;
    }
    return [];
  }

  function candidatesFor(kind, want, exact) {
    switch (kind) {
      case 'text':
        return bestByText([...document.querySelectorAll('button,a,[role=button],[role=link],[role=tab],[role=menuitem],[role=combobox]')], want, exact);
      case 'dialoginput': {
        // The first ordinary text box of the top-most MODAL dialog. Non-modal flyouts and notification
        // panes are excluded, and so are search, combobox, read-only and disabled fields.
        const boxes = [...document.querySelectorAll('[role=dialog]:not([aria-modal=false]),dialog[open],[aria-modal=true]')]
          .filter(isVisible);
        if (!boxes.length) return [];
        // A <dialog open> is in the browser's top layer, so it wins over anything else; otherwise the
        // last one in the document is the newest.
        const topLayer = boxes.filter((b) => b.tagName === 'DIALOG' && b.hasAttribute('open'));
        const box = (topLayer.length ? topLayer : boxes).pop();
        const fields = [...box.querySelectorAll('input,textarea')].filter((el) => {
          if (!isVisible(el) || el.readOnly || el.disabled) return false;
          if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-expanded')) return false;
          const t = (el.getAttribute('type') || 'text').toLowerCase();
          return el.tagName === 'TEXTAREA' || ['text', 'search', 'email', 'url', ''].includes(t) ? t !== 'search' : false;
        });
        return fields.slice(0, 1);
      }
      case 'placeholder': {
        // A modern chat composer is usually an editable div, not an <input>, and its placeholder can
        // live in aria-placeholder / data-placeholder / aria-label instead of the placeholder
        // attribute. Match any of them, on any editable control.
        const ATTRS = ['placeholder', 'aria-placeholder', 'data-placeholder', 'aria-label'];
        const editable = [...document.querySelectorAll('input,textarea,[contenteditable=true],[contenteditable=""],[role=textbox],[role=searchbox]')];
        const direct = editable.filter((el) => isVisible(el) && ATTRS.some((a) => norm(el.getAttribute(a) || '').includes(want)));
        if (direct.length) return direct;
        // Some composers paint the hint as a separate element over the editable area; in that case
        // point at the nearest editable ancestor or sibling of that hint.
        // The hint usually carries a trailing ellipsis ("Message the agent..."), so compare by
        // containment, capped so a whole page section cannot qualify as "the hint".
        const hint = [...document.querySelectorAll('div,span,p,label')].filter((el) => {
          if (!isVisible(el) || !mayContain(el, want)) return false;
          const t = visibleText(el, squash(want).length + 12);
          return !!t && t.includes(want);
        });
        for (const h of hint) {
          const near = h.closest('input,textarea,[contenteditable=true],[contenteditable=""],[role=textbox]')
            || h.parentElement?.querySelector('input,textarea,[contenteditable=true],[contenteditable=""],[role=textbox]')
            || h.closest('form,div')?.querySelector('input,textarea,[contenteditable=true],[contenteditable=""],[role=textbox]');
          if (near && isVisible(near)) return [near];
        }
        return [];
      }
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
        if (!merged.length && hits.some((h) => h.missing)) { pendingAssoc = true; return []; }
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
    backBtn.hidden = !(state === 'timeout' && backTo >= 0);
    jumpBtn.hidden = !(state === 'timeout' && jumpTo >= 0);
    root.dataset.state = state;
    root.dataset.step = String(index);
  }

  let scrolledFor = -1;
  function place() {
    if (!target) return;
    // A long page (the agent screen) can hold the target below the fold: bring it into view once per
    // step, so the cursor is never pointing at something the learner cannot see.
    let r = target.getBoundingClientRect();
    const off = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
    if (off && scrolledFor !== index) {
      scrolledFor = index;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      r = target.getBoundingClientRect();
    }
    cursor.style.transform = 'translate(' + (r.left + r.width / 2) + 'px,' + (r.top + r.height / 2) + 'px)';
  }

  // When the current step cannot be found, look at the nearby steps of this site: is the control of a
  // later (ahead) or an earlier (back) one on screen? The answer is cached for 1.5 s so a page that
  // keeps changing does not re-resolve up to 9 steps on every update.
  let lookCache = { at: 0, i: -1, href: '', res: null };
  let lookTimer = 0;
  function lookAround(i) {
    // Keyed by the address too: an SPA route change (pushState fires no event) must not be answered
    // from a cache filled on the previous page.
    if (lookCache.i === i && lookCache.href === location.href && lookCache.res && performance.now() - lookCache.at < 1500) return lookCache.res;
    // The wording shown to the learner is the control's own visible text when it has one.
    const find = (j) => {
      if (!core.hostOk(STEPS[j], location.hostname)) return null;
      const el = (resolve(STEPS[j]) || {}).el;
      if (!el) return null;
      // A button's own text as the learner sees it (original capitalisation). For form fields the
      // element is the input, whose text is its options or what the learner typed: use the step wording.
      const t = STEPS[j].kind === 'text' ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
      return { index: j, name: t && t.length < 40 ? t : wording(STEPS[j])[0] };
    };
    let ahead = null;
    for (let j = i + 1; j <= Math.min(i + 3, STEPS.length - 1) && !ahead; j++) ahead = find(j);
    let back = null;
    for (let k = i - 1; k >= Math.max(0, i - 5) && !back; k--) back = find(k);
    lookCache = { at: performance.now(), i, href: location.href, res: { ahead, back } };
    return lookCache.res;
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
      voiceSay('p' + index, SPEAK[index] || [step.label]);
      if (nudgeFor !== index) { nudgeFor = index; nudged = 0; armNudge(NUDGE_MS + talkMs(SPEAK[index] || [step.label])); }
      if (V) V.warm(SPEAK[index + 1], session);
    } else if (hit) {
      target = null;
      cursor.classList.remove('aiwb-on');
      say("More than one '" + wording(step)[0] + "' on screen - can't tell which", 'ambiguous');
      voiceSay('a' + index, LINES.ambiguous);
    } else {
      target = null;
      cursor.classList.remove('aiwb-on');
      const late = Date.now() - stepStart >= TIMEOUT_MS;
      backTo = -1;
      jumpTo = -1;
      let hint = '';
      if (late) {
        const around = lookAround(index);
        // The answer is cached for 1.5 s; make sure it is looked at again when it expires, even if the
        // page has stopped changing by then (otherwise a stale "nothing nearby" could stay up).
        const age = performance.now() - lookCache.at;
        clearTimeout(lookTimer);
        if (age < 1500) lookTimer = setTimeout(schedule, 1500 - age + 50);
        // Only a step marked `optional` (a menu that may or may not be there) moves on by itself, and
        // only when the very next control is already on screen. Anything else could silently skip a
        // step the learner still has to do (a renamed button looks exactly like a missing one), so
        // it is offered as a button instead.
        // ...and only when every step in between is optional too: otherwise a required control that is
        // merely renamed, still loading or ambiguous (so "not found") would be skipped unnoticed.
        const between = STEPS.slice(index + 1, around.ahead ? around.ahead.index : index + 1);
        if (step.optional && around.ahead && between.every((s) => s.optional)) { hooks.advance(around.ahead.index); return; }
        // The learner did THIS step by hand. All of the following must hold, or we only offer the
        // buttons below: a real click/keypress happened in this page during this step; the address
        // changed since the step began; this tab is the visible one (a stale background tab must never
        // move the shared step); the very NEXT step (never further: a renamed or still-loading control
        // looks exactly like a missing one) is on screen; and it is still there on a fresh check, not
        // just in the 1.5 s cache.
        if (around.ahead && actedAt > stepBeganAt &&
            location.href !== stepHref && document.visibilityState === 'visible' &&
            (resolve(STEPS[around.ahead.index]) || {}).el) {
          // Never silent: name every step being passed over, so a renamed control is visible as a
          // skip the learner can question, not something that quietly disappears.
          const passed = STEPS.slice(index, around.ahead.index).map((s) => wording(s)[0]);
          voiceSay('k' + index, LINES.skipped);
          banner.textContent = 'You already did that - moving on. Skipped: ' + passed.join(', ');
          banner.classList.add('aiwb-on');
          clearTimeout(navTimer);
          navTimer = setTimeout(() => banner.classList.remove('aiwb-on'), NAV_SHOW_MS + 3000);
          hooks.advance(around.ahead.index);
          return;
        }
        if (around.ahead) {
          jumpTo = around.ahead.index;
          jumpBtn.textContent = "Jump to '" + around.ahead.name + "'";
          hint = ' A later step is on this screen.';
        }
        // An EARLIER step's control is on screen: the learner is probably on a previous screen (a step
        // was skipped). Offered, never automatic: an automatic move back could loop.
        if (around.back) {
          backTo = around.back.index;
          backBtn.textContent = "Go back to '" + around.back.name + "'";
          hint += ' An earlier step is still on this screen.';
        }
      }
      say(late ? "Can't find '" + wording(step)[0] + "' on this page." + hint : 'Looking for ' + wording(step)[0] + '...',
        late ? 'timeout' : 'waiting');
      if (late) voiceSay('t' + index, LINES.timeout);
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
    stepBeganAt = stepStart;
    stepHref = location.href;
    target = null;
    said.clear();
    clearTimeout(nudgeTimer);
    nudgeTimer = 0;
    nudgeFor = -1;
    cursor.classList.remove('aiwb-nudge');
    if (index >= STEPS.length) {
      cursor.classList.remove('aiwb-on');
      say('All steps complete', 'done');
      voiceSay('d', LINES.done);
      // Leave the message up while the closing words are spoken, then end the session.
      setTimeout(() => { if (alive && index >= STEPS.length) hooks.end(); }, 16000);
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
  const onUserAct = (e) => {
    if (!e.isTrusted) return;
    actedAt = Date.now();
    if (nudgeTimer) armNudge(NUDGE_MS);
  };
  document.addEventListener('click', onUserAct, true);
  document.addEventListener('keydown', onUserAct, true);
  document.addEventListener('click', onUse, true);
  endBtn.addEventListener('click', () => hooks.end());
  backBtn.addEventListener('click', () => {
    const at = index, to = backTo;
    setTimeout(() => { if (alive && index === at && to >= 0) hooks.advance(to); }, 0);
  });
  jumpBtn.addEventListener('click', () => {
    const at = index, to = jumpTo;
    setTimeout(() => { if (alive && index === at && to >= 0) hooks.advance(to); }, 0);
  });
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
    lookCache = { at: 0, i: -1, href: '', res: null }; // a new page: whatever was nearby before is not any more
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
    if (V) V.stop();
    clearInterval(navTick);
    clearTimeout(deadlineTimer);
    clearTimeout(nudgeTimer);
    clearTimeout(refreshTimer);
    clearTimeout(lookTimer);
    clearTimeout(navTimer);
    if (raf) cancelAnimationFrame(raf);
    mutations.disconnect();
    document.removeEventListener('click', onUse, true);
    document.removeEventListener('click', onUserAct, true);
    document.removeEventListener('keydown', onUserAct, true);
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
