// Ava's teaching script (3 wordings per step, one sentence per entry) + audio player.
import { formatToSsml, type VoiceMetadata } from './ssmlBuilder';

export const SCRIPT: string[][][] = [
  [
    ['Let’s create your first agent.', 'See my blue cursor, top left of the page?', 'Click “New agent”, the dark button under the Agents heading.'],
    ['Alright, we’ll start by making an agent.', 'Follow the blue cursor up to the top left.', 'That dark button says “New agent”. Give it a click.'],
    ['First things first.', 'Right under the big Agents title, there’s a dark button.', 'Go ahead and press “New agent”.'],
  ],
  [
    ['Nice! A panel just opened on the right.', 'Now give your agent a name.', 'Click the first box, under “Agent name”, and call it “HR policy helper”.'],
    ['Good, you’re on a roll.', 'Look at the panel on the right. The cursor is on the very first box.', 'Click it, that’s where the name goes.'],
    ['Great. Over on the right-hand panel, top box.', 'That’s the name field.', 'Click it and we’ll call our agent “HR policy helper”.'],
  ],
  [
    ['Next, we choose the model.', 'The blue cursor is on the “Model” box, just under the name.', 'I’ve already deployed one in your sandbox, so just select it.'],
    ['Okay, the brain of our agent.', 'It’s the second box in the panel, right below the name.', 'Click “Model” and pick the one that’s already deployed.'],
    ['Now, which model should power it?', 'Follow me down one box, to “Model”.', 'Click it. Your sandbox model is ready and waiting.'],
  ],
  [
    ['Now for the instructions. Think of them as the agent’s playbook.', 'The cursor is on the big box in the middle of the panel.', 'Click it, and the starter text from your lab card fills in.'],
    ['You’re doing great.', 'See the large “Instructions” box? That’s where we tell the agent how to behave.', 'One click on it, and the starter text appears.'],
    ['This part is important.', 'The tall box under “Instructions” is the playbook.', 'Click it and the starter text will drop in for you.'],
  ],
  [
    ['Last one, I promise.', 'At the very bottom of the panel, there’s a dark button.', 'Click “Try in playground” and ask your agent a question.'],
    ['We’re almost there.', 'Follow the cursor all the way down to the bottom of the panel.', 'Press “Try in playground” and see your agent in action.'],
    ['Final step!', 'Bottom of the right panel, the dark “Try in playground” button.', 'Click it, then ask your agent anything about HR policy.'],
  ],
];

export const WELCOME: string[] = ['Welcome to the experiment lab! I’m Ava, and I’ll be your guide today.', 'Just follow my blue cursor, and I’ll tell you exactly what to do at every step.'];

// What the cursor is about to do -> spoken line, 3 wordings. Cursor code sends { label, action } via 'ava:cursor'.
export type CursorAction = 'click' | 'type' | 'select' | 'look';
const CUE: Record<CursorAction, string[][]> = {
  click: [['Now click “{l}”.'], ['Go ahead and click “{l}”.'], ['Next, give “{l}” a click.']],
  type: [['Click “{l}” and type your answer.'], ['Now, in “{l}”, type what you see on your lab card.'], ['Over here, “{l}”. Type it in.']],
  select: [['Now pick “{l}”.'], ['Choose “{l}” from the list.'], ['Go ahead and select “{l}”.']],
  look: [['Take a look at “{l}”.'], ['See “{l}” here? Have a quick read.'], ['Notice “{l}”. It’s important.']],
};
export const cursorLines = (label: string, action: CursorAction, variant: number) =>
  CUE[action][variant % 3].map((t) => t.replace('{l}', label));

export const DONE: string[] = ['You did it! Your agent is live.', 'Take a breath, that was a great first build.', 'One quick question before we wrap up.'];

// Each replay uses a different SaaSH teaching voice, so Talk never sounds identical.
const VOICES: VoiceMetadata[] = [
  { style: 'teacher', level: 'beginner' }, // calm, friendly, slower
  { style: 'encouraging' }, // warmer, slightly brighter
  { style: 'storytelling' }, // relaxed, longer pauses
];
const STUCK: VoiceMetadata = { style: 'empathetic', prosody: { rate: 'slow' } };

// Voice picker (Setup > Meet your guide): 0 Ava (female), 1 Leo (male), 2 team voice (cloned, Fish Audio).
export const AZURE_VOICES = ['en-US-AvaNeural', 'en-US-AndrewNeural'];
export const CLONE = 2;
// Setup's "Speaking style" chips -> SaaSH styles.
// Ava/Leo ignore emotion tags, so the difference is carried by pace, pitch and pauses (always honoured by Azure).
const STYLES: VoiceMetadata[] = [
  { style: 'encouraging', prosody: { rate: '-4%', pitch: '+4%', pause_level: 'long' } }, // warm, unhurried, upbeat
  { style: 'professional', prosody: { rate: '0%', pitch: '-4%', pause_level: 'short' } }, // level, even, matter-of-fact
  { style: 'motivational', prosody: { rate: '+16%', pitch: '+9%', pause_level: 'short' } }, // fast, bright, punchy
];
export const getPref = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
// QA/prod: API is a separate site (VITE_API_BASE_URL); local dev uses the vite /api proxy.
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';
export const setPref = (k: string, v: number | string) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode: choice just isn't remembered */ } };

// Lab-tuned on top of SaaSH's builder: the words the learner must find on screen are slowed,
// stressed and fenced by tiny pauses; instruction sentences leave time to act before the next one.
const ACTION = /\b(click|type|select|pick|choose|press|open|paste)\b/i;
export function ssml(text: string, variant: number, slow = false, voiceName = AZURE_VOICES[0], style: number | null = null) {
  const meta = slow ? STUCK : style !== null ? STYLES[style] : VOICES[variant % VOICES.length];
  const out = formatToSsml(text, { voiceName, ...meta })
    .replace(/“([^”]+)”/g, '<break time="180ms"/><prosody rate="-15%"><emphasis level="moderate">$1</emphasis></prosody><break time="220ms"/>');
  const gap = ACTION.test(text) ? (slow ? 1100 : 800) : 0; // time to act on the instruction
  return gap ? out.replace('</prosody></mstts:express-as>', `<break time="${gap}ms"/></prosody></mstts:express-as>`) : out;
}

export class Ava {
  private audio = new Audio();
  private cache = new Map<string, string>();
  private gen = 0;
  private paused = false;
  private busy = false;
  private wake?: () => void;
  private endRes?: () => void;
  onPause?: (p: boolean) => void;
  // Chosen on the Setup page and remembered; Guided reads the same choice.
  voice = Number(getPref('ava.voice')) || 0;
  style: number | null = getPref('ava.style') === null ? null : Number(getPref('ava.style'));
  cloneId: string | null = getPref('ava.cloneId'); // Fish Audio model made from the learner's own recording

  private async url(text: string, variant: number, slow: boolean) {
    const clone = this.voice === CLONE;
    // Azure voices take SSML; the cloned voice (Fish Audio) takes plain text.
    const body = clone ? { text: text.replace(/[“”]/g, ''), clone: true, voiceId: this.cloneId ?? undefined } : { ssml: ssml(text, variant, slow, AZURE_VOICES[this.voice] ?? AZURE_VOICES[0], this.style) };
    const key = JSON.stringify(body);
    let u = this.cache.get(key);
    if (!u) {
      const r = await fetch(`${API_BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key });
      if (!r.ok || !r.headers.get('content-type')?.startsWith('audio')) throw new Error('tts ' + r.status); // e.g. SPA fallback html
      u = URL.createObjectURL(await r.blob());
      this.cache.set(key, u);
    }
    return u;
  }

  stop() {
    this.gen++;
    this.busy = false;
    this.audio.pause();
    this.wake?.();
    this.endRes?.();
  }

  // Speaks sentences in order; onLine fires as each one starts. A new speak() cancels the old one.
  // delayMs: hold the first sentence until the cursor has arrived (audio is fetched meanwhile, so it starts instantly on arrival).
  async speak(lines: string[], variant: number, slow: boolean, onLine: (t: string) => void, onEnd: () => void, delayMs = 0) {
    this.stop();
    this.setPaused(false); // a new line always starts playing
    const g = this.gen;
    const t0 = performance.now();
    try {
      for (const [i, t] of lines.entries()) {
        const u = await this.url(t, variant, slow);
        if (g !== this.gen) return;
        const wait = i === 0 ? delayMs - (performance.now() - t0) : 0;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (g !== this.gen) return;
        onLine(t); // transcript shows a sentence exactly when it is spoken
        this.audio.src = u;
        this.busy = true;
        for (;;) {
          while (this.paused) await new Promise<void>((r) => (this.wake = r));
          if (g !== this.gen) return;
          try { await this.audio.play(); break; } catch {
            // Autoplay blocked (page opened with no click yet): start on the first click/tap/key anywhere, then retry.
            await new Promise<void>((r) => {
              const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); r(); };
              addEventListener('pointerdown', go); addEventListener('keydown', go);
            });
            if (g !== this.gen) return;
          }
        }
        await new Promise<void>((r) => { this.endRes = r; this.audio.onended = () => r(); });
        if (g !== this.gen) return;
        this.busy = false;
        await new Promise((r) => setTimeout(r, t.endsWith('?') ? 1200 : 450)); // teaching pause between sentences
        if (g !== this.gen) return;
      }
    } catch {
      onLine('(Ava’s voice is unavailable right now.)'); // '(' prefix marks an error line for callers
    }
    if (g === this.gen) onEnd();
  }

  private setPaused(p: boolean) {
    this.paused = p;
    this.onPause?.(p);
  }

  toggle() {
    if (this.paused) {
      this.setPaused(false);
      this.wake?.();
      if (this.busy && this.audio.paused) this.audio.play().catch(() => {});
    } else {
      this.setPaused(true);
      this.audio.pause();
    }
  }
}
