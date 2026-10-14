// Pure guided-session logic (no DOM, no chrome.* APIs) so it can be unit-tested in Node.
// Session shape in chrome.storage.local.aiwbGuide: { on, at, step, account }
//   on:      a guided session is active
//   at:      last time it was started or advanced (the expiry is sliding from here)
//   step:    GLOBAL index into the whole step list (portal.azure.com steps, then ai.azure.com steps)
//   account: the lab's account name; scopes where the very first step may start
(() => {
  const TTL_MS = 2 * 60 * 60 * 1000;

  const isLive = (session, now) => !!(session && session.on && now - session.at < TTL_MS);

  const expiresInMs = (session, now) => Math.max(0, session.at + TTL_MS - now);

  const hostOk = (step, host) => !step.host || step.host === host;

  // Which global step should THIS page act on? -1 = none (stay inactive).
  //  - a finished session shows the final message on the page that owns the last step;
  //  - a page only acts on a step written for its own site;
  //  - while nothing has been done yet (step 0) the page must be the lab's own (URL contains the
  //    account name), so a bookmarked portal home or any other tab never shows a cursor.
  function activeStep(session, steps, host, url, now) {
    if (!isLive(session, now) || !steps.length) return -1;
    const i = session.step | 0;
    if (i >= steps.length) return hostOk(steps[steps.length - 1], host) ? i : -1;
    if (i < 0 || !hostOk(steps[i], host)) return -1;
    // account === undefined only in the logic-test fixture (in-memory session). Anything real carries
    // an account, and an empty one never matches.
    if (i === 0 && session.account !== undefined) {
      const acct = String(session.account).toLowerCase();
      if (!acct || !String(url).toLowerCase().includes(acct)) return -1;
    }
    return i;
  }

  const advance = (session, to, now) => ({ ...session, step: to, at: now });

  const api = { TTL_MS, isLive, expiresInMs, activeStep, advance, hostOk };
  if (typeof window !== 'undefined') window.AIWB_GUIDE_CORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
