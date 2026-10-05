// Fetches the guide's voice for content.js. Runs with the extension's own permissions (host_permissions),
// so the Azure page's CORS rules do not apply, and the audio comes back as a data: URL.
const API_OK = /^(https:\/\/[\w-]+\.azurewebsites\.net|http:\/\/localhost:\d+)$/;

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
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
