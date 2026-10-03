// Runs only on the AI Workboard app. Two jobs, nothing else:
//  1. mark the page so the app can tell the extension is installed (data-aiwb-ext="<version>");
//  2. start or end a guided session when the app says so. The app dispatches, on window:
//       new CustomEvent("aiwb:guide", { detail: JSON.stringify({ on: true, account: "<lab account>" }) })
// The cursor itself (content.js) stays completely inactive on Azure pages until a session has been
// started, so it never appears while you simply browse Azure.
(() => {
  const KEY = 'aiwbGuide';
  document.documentElement.dataset.aiwbExt = chrome.runtime.getManifest().version;
  window.addEventListener('aiwb:guide', (e) => {
    let p;
    try { p = JSON.parse(e.detail); } catch { p = { on: e.detail === 'on' }; }
    // "on" is only honoured WITH the lab's account name: it scopes where the very first step may
    // start. Anything else (legacy string, missing or empty account) is treated as "off", so a bare
    // "on" can never make the cursor appear on every portal page.
    const account = p && typeof p.account === 'string' ? p.account.trim().slice(0, 80) : '';
    if (!p || !p.on || !account) { chrome.storage.local.set({ [KEY]: { on: false } }); return; }
    chrome.storage.local.set({ [KEY]: { on: true, at: Date.now(), step: 0, account } });
  });
})();
