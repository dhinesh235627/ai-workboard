// Fetches the guide's voice for content.js. Runs with the extension's own permissions (host_permissions),
// so the Azure page's CORS rules do not apply, and the audio comes back as a data: URL.
const API_OK = /^(https:\/\/[\w-]+\.azurewebsites\.net|http:\/\/localhost:\d+)$/;

// Playback: tabs ask for play/stop; the offscreen page (offscreen.js) is the single speaker. Only the tab
// that started the current clip may stop it, so a tab going idle never cuts off the next tab's first line.
let owner = -1;
const off = (msg) => chrome.runtime.sendMessage({ type: 'aiwb:off', ...msg });
async function play(tab, url) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Speak the guide in a tab that has not been clicked yet' }).catch(() => {});
  }
  owner = tab;
  await off({ url });
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && (m.type === 'aiwb:play' || m.type === 'aiwb:stop')) {
    const tab = sender.tab ? sender.tab.id : -2;
    (async () => {
      if (m.type === 'aiwb:play') await play(tab, m.url);
      else if (tab === owner && (await chrome.offscreen.hasDocument())) { owner = -1; await off({}); }
      reply({ ok: true });
    })().catch(() => reply({ ok: false }));
    return true;
  }
  if (!m || m.type !== 'aiwb:tts') return;
  (async () => {
    if (!API_OK.test(m.api)) throw new Error('api not allowed');
    const r = await fetch(m.api + '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m.body) });
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('audio')) throw new Error('tts ' + r.status);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    reply({ url: 'data:audio/mpeg;base64,' + btoa(bin) });
  })().catch((e) => reply({ error: String(e) }));
  return true; // reply is async
});
