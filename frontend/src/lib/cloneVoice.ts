// Record the learner's voice, convert to WAV, and clone it via the backend (Fish Audio).
import { API_BASE } from './ava';

// Read aloud during recording (~12s at a normal pace; also sent as the sample's transcript).
export const CLONE_TEXT = 'Learning by doing is the best way to grow. Today I will guide you through each step, calmly and clearly, so you can build with confidence.';
export const MIN_MS = 6000;

// Starts the mic; stop() resolves with the recording. Auto-stops after maxMs via onMax.
export async function startRecording(maxMs: number, onMax: () => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const t0 = Date.now();
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  const timer = setTimeout(onMax, maxMs);
  return {
    stop: () => new Promise<{ blob: Blob; ms: number }>((resolve) => {
      clearTimeout(timer);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve({ blob: new Blob(chunks, { type: rec.mimeType }), ms: Date.now() - t0 }); };
      rec.stop();
    }),
  };
}

// Browser recordings are webm/opus; re-encode as 16-bit mono WAV, which Fish Audio takes (same format SaaSH uploads).
export async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 24000 }); // decode resamples to 24 kHz
  const pcm = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
  void ctx.close();
  const buf = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, 24000, true); buf.setUint32(28, 48000, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true);
  str(36, 'data'); buf.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([buf], { type: 'audio/wav' });
}

// Returns the new Fish Audio voice id.
export async function cloneVoice(wav: Blob): Promise<string> {
  const form = new FormData();
  form.set('voices', wav, 'sample.wav');
  form.set('texts', CLONE_TEXT);
  const r = await fetch(`${API_BASE}/api/voice-clone`, { method: 'POST', body: form });
  if (!r.ok) throw new Error('clone ' + r.status);
  return (await r.json()).voiceId;
}
