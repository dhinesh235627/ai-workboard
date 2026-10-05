// The guide's voice: slow, soft, human. Turns a few sentences into one clip via the app's /api/tts
// (which talks to the audio-mcp container; the key and token never reach the browser). Fetching is done by
// background.js, because an Azure page may not call another site directly.
// window.AIWB_VOICE = { speak(lines, cfg, onBlocked), warm(lines, cfg), stop(), toggleMute(), isMuted() }
(() => {
  const AZURE_VOICES = ['en-US-AvaNeural', 'en-US-AndrewNeural'];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Same delivery as the clip we liked: Ava, slower than normal and a touch warm. The stressed words get a
  // tiny pause on each side and an emphasis tag only (no second slow-down, it made them sound stretched);
  // "Ohh" and "…" are written as "Oh" and a comma, which Azure reads more naturally.
  const plain = (l) => l.replace(/…/g, ',').replace(/Ohh/g, 'Oh').replace(/Mm-hm/g, 'Mm hm').replace(/,\s*([.!?])/g, '$1');
  function toSsml(lines, voiceName) {
    const body = lines.map((l) => esc(plain(l)).replace(/[“"]([^”"]+)[”"]/g, '<break time="150ms"/><emphasis level="moderate">$1</emphasis><break time="150ms"/>')).join('<break time="450ms"/>');
    return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">' +
      '<voice name="' + voiceName + '"><prosody rate="-16%" pitch="+3%">' + body + '</prosody></voice></speak>';
  }

  // cfg = the session: { api, voice (0 Ava, 1 Leo, 2 cloned), cloneId }
  function request(lines, cfg) {
    if (!cfg || !cfg.api) return null;
    const body = cfg.voice === 2
      ? { text: lines.join(' ').replace(/[“”"]/g, ''), clone: true, voiceId: cfg.cloneId || undefined }
      : { ssml: toSsml(lines, AZURE_VOICES[cfg.voice] || AZURE_VOICES[0]) };
    return { api: cfg.api, body };
  }

  const cache = new Map(); // JSON(body) -> Promise<dataUrl>
  function load(req) {
    const key = JSON.stringify(req.body);
    if (!cache.has(key)) {
      const p = new Promise((resolve, reject) =>
        chrome.runtime.sendMessage({ type: 'aiwb:tts', api: req.api, body: req.body }, (r) => (r && r.url ? resolve(r.url) : reject(new Error((r && r.error) || 'tts failed')))));
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return cache.get(key);
  }

  const audio = new Audio();
  let gen = 0;
  let muted = false;
  try { chrome.storage.local.get('aiwbMute', (r) => { muted = !!(r && r.aiwbMute); }); } catch { /* no storage: voice stays on */ }

  function stop() { gen++; audio.pause(); }

  async function speak(lines, cfg, onBlocked) {
    stop();
    const req = request(lines, cfg);
    if (muted || !req) return;
    const g = gen;
    try {
      const url = await load(req);
      if (g !== gen || muted) return;
      audio.src = url;
      try { await audio.play(); } catch {
        // Autoplay blocked (no click on this page yet): start on the first click or key, if still current.
        if (onBlocked) onBlocked();
        const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (g === gen && !muted) audio.play().catch(() => {}); };
        addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
      }
    } catch { /* voice unavailable: the written guide still works */ }
  }

  // Fetch the next clip while the learner is busy with this one, so it starts the moment the cursor moves.
  function warm(lines, cfg) { const req = lines && request(lines, cfg); if (req) load(req).catch(() => {}); }

  function toggleMute() {
    muted = !muted;
    try { chrome.storage.local.set({ aiwbMute: muted }); } catch { /* not remembered */ }
    if (muted) stop();
    return muted;
  }

  window.AIWB_VOICE = { speak, warm, stop, toggleMute, isMuted: () => muted, toSsml };
})();
