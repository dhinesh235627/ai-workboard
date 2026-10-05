// The guide's one speaker. An extension page is not subject to the autoplay block that silences a
// freshly opened Azure tab, so the voice plays here; background.js relays play/stop from the tabs.
const a = new Audio();
chrome.runtime.onMessage.addListener((m) => {
  if (!m || m.type !== 'aiwb:off') return;
  if (m.url) { a.src = m.url; a.play().catch(() => {}); } else a.pause();
});
