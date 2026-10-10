// The guide's voice: slow, soft, human. Turns a few sentences into one clip via the app's /api/tts
// (which talks to the audio-mcp container; the key and token never reach the browser). Fetching is done by
// background.js, because an Azure page may not call another site directly.
// All three voices speak through Fish Audio now (Azure TTS was removed); Ava/Leo are Fish's built-in defaults,
// same ids as frontend/src/lib/ava.ts's FISH_VOICES. Fish takes plain text, not SSML - see that file's note
// on the pacing this drops.
// window.AIWB_VOICE = { speak(lines, cfg, onBlocked), warm(lines, cfg), stop(), toggleMute(), isMuted() }
(() => {
  const FISH_VOICES = ['c2623f0c075b4492ac367989aee1576f', '47eec8ee3b7941b58ef57b1b7294202e'];

  // cfg = the session: { api, voice (0 Ava, 1 Leo, 2 cloned), cloneId }
  function request(lines, cfg) {
    if (!cfg || !cfg.api) return null;
    const voiceId = cfg.voice === 2 ? (cfg.cloneId || undefined) : (FISH_VOICES[cfg.voice] || FISH_VOICES[0]);
    const body = { text: lines.join(' ').replace(/[“”"]/g, ''), voiceId };
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

  // The offscreen player (see background.js) speaks without needing a click in this tab; true when it took the clip.
  const remote = (m) => new Promise((res) => {
    try { chrome.runtime.sendMessage(m, (r) => res(!chrome.runtime.lastError && !!(r && r.ok))); } catch { res(false); }
  });

  function stop() { gen++; audio.pause(); remote({ type: 'aiwb:stop' }); }

  async function speak(lines, cfg, onBlocked) {
    stop();
    const req = request(lines, cfg);
    if (muted || !req) return;
    const g = gen;
    try {
      const url = await load(req);
      if (g !== gen || muted) return;
      if (await remote({ type: 'aiwb:play', url })) return;
      if (g !== gen || muted) return;
      audio.src = url; // offscreen player unavailable: play in the page (may need a click first)
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

  window.AIWB_VOICE = { speak, warm, stop, toggleMute, isMuted: () => muted };
})();
