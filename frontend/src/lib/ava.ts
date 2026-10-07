// Ava's teaching script (3 wordings per step, one sentence per entry) + audio player.

export const SCRIPT: string[][][] = [
  [
    ['Okay, let’s create your very first agent.', 'See my blue cursor, top left of the page?', 'Click “New agent”, the dark button under the Agents heading.'],
    ['Alright, we’ll start by making an agent, nice and slow.', 'Follow the blue cursor up to the top left.', 'That dark button says “New agent”. Give it a gentle click.'],
    ['Hmm, first things first.', 'Right under the big Agents title, there’s a dark button.', 'Go ahead and press “New agent”. Take your time.'],
  ],
  [
    ['Oh, nice! A panel just opened on the right.', 'Now, let’s give your agent a name.', 'Click the first box, under “Agent name”, and call it “HR policy helper”.'],
    ['Great, you’re doing so well.', 'Look at the panel on the right. The cursor is on the very first box.', 'Click it, that’s where the name goes.'],
    ['Lovely. Over on the right-hand panel, top box.', 'That’s the name field.', 'Click it, and we’ll call our agent “HR policy helper”.'],
  ],
  [
    ['Okay, next, we choose the model.', 'The blue cursor is on the “Model” box, just under the name.', 'I’ve already deployed one in your sandbox, so just select it.'],
    ['Hmm, now the brain of our agent.', 'It’s the second box in the panel, right below the name.', 'Click “Model”, and pick the one that’s already deployed.'],
    ['Now, which model should power it?', 'Follow me down one box, to “Model”.', 'Click it. Your sandbox model is ready and waiting for you.'],
  ],
  [
    ['Oh, now for the important part, the instructions. Think of them as your agent’s little playbook.', 'The cursor is on the big box in the middle of the panel.', 'Click it, and the starter text from your lab card fills in.'],
    ['You’re doing great.', 'See the large “Instructions” box? That’s where we tell the agent how to behave.', 'One click on it, and the starter text appears.'],
    ['Hmm, this part is important, but don’t worry, it’s easy.', 'The tall box under “Instructions” is the playbook.', 'Click it, and the starter text will drop in for you.'],
  ],
  [
    ['Last one, I promise. Look how far you’ve come.', 'At the very bottom of the panel, there’s a dark button.', 'Click “Try in playground”, and ask your agent a question.'],
    ['Okay, we’re almost there.', 'Follow the cursor all the way down to the bottom of the panel.', 'Press “Try in playground”, and see your agent in action.'],
    ['Final step, and you’re doing wonderfully.', 'Bottom of the right panel, the dark “Try in playground” button.', 'Click it, then ask your agent anything about HR policy.'],
  ],
];

export const WELCOME: string[] = ['Hi there, welcome to the experiment lab. I’m Ava, and I’m so glad you’re here.', 'Take a slow breath. Just follow my blue cursor, and I’ll tell you exactly what to do, one little click at a time.'];

// What the cursor is about to do -> spoken line, 3 wordings. Cursor code sends { label, action } via 'ava:cursor'.
export type CursorAction = 'click' | 'type' | 'select' | 'look';
const CUE: Record<CursorAction, string[][]> = {
  click: [['Now click “{l}”. Take your time.'], ['Go ahead and click “{l}”.'], ['Next, give “{l}” a gentle click.']],
  type: [['Click “{l}” and type your answer.'], ['Now, in “{l}”, type what you see on your lab card.'], ['Over here, “{l}”. Type it in, no rush.']],
  select: [['Now pick “{l}”.'], ['Choose “{l}” from the list.'], ['Go ahead and select “{l}”.']],
  look: [['Take a look at “{l}”.'], ['See “{l}” here? Have a quick read.'], ['Notice “{l}”. It’s important.']],
};
export const cursorLines = (label: string, action: CursorAction, variant: number) =>
  CUE[action][variant % 3].map((t) => t.replace('{l}', label));

export const DONE: string[] = ['You did it! Oh, I’m so proud of you.', 'Your agent is alive, and you built it yourself. Take a breath, that was a wonderful first build.', 'One quick question before we wrap up.'];

// Delivery: the clip we approved. Ava, slower than normal and a touch warm. Each replay shifts the pace a
// little, so Talk never sounds identical; "stuck" is slower and gentler still.
type Pace = { rate: string; pitch: string };
const VARIANTS: Pace[] = [{ rate: '-16%', pitch: '+3%' }, { rate: '-18%', pitch: '+5%' }, { rate: '-14%', pitch: '+1%' }];
const STUCK: Pace = { rate: '-24%', pitch: '+2%' };

// Voice picker (Setup > Meet your guide): 0 Ava (female), 1 Leo (male), 2 team voice (cloned, Fish Audio).
export const AZURE_VOICES = ['en-US-CoraMultilingualNeural', 'en-US-BrandonMultilingualNeural'];
export const CLONE = 2;
// Setup's "Speaking style" chips -> SaaSH styles.
// Ava/Leo ignore emotion tags, so the difference is carried by pace, pitch and pauses (always honoured by Azure).
const STYLES: Pace[] = [
  { rate: '-18%', pitch: '+4%' }, // warm, unhurried, upbeat
  { rate: '-8%', pitch: '0%' }, // level, even, matter-of-fact
  { rate: '-2%', pitch: '+7%' }, // brighter, livelier
];
// Setup's style chips also change the words: 0 encouraging (warm, confident praise), 1 neutral (as written), 2 energetic (human reactions).
const FLAVOR: string[][] = [
  ['Great job so far, you’ve got this.', 'You’re doing really well.', 'Don’t worry, you’re stronger than this step.', 'That’s the spirit, keep going.'],
  [],
  ['Huhh, okay!', 'Wow, nice!', 'Hmm, okay, so…', 'Okay okay okay!', 'Whoa, look at that!', 'Alright, huhh, let’s go!'],
];
const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const flavor = (text: string, style: number | null) => {
  const opts = style === null ? [] : FLAVOR[style] ?? [];
  const h = hash(text);
  // Opener picked by text hash: varies between lines, but same text -> same opener (cache-friendly).
  return opts.length ? `${opts[h % opts.length]} ${text}` : text;
};
export const getPref =(k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
// QA/prod: API is a separate site (VITE_API_BASE_URL); local dev uses the vite /api proxy.
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';
export const setPref = (k: string, v: number | string) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode: choice just isn't remembered */ } };

// The words the learner must find on screen are stressed and fenced by tiny pauses (emphasis only: a second
// slow-down made them sound stretched); instruction sentences leave time to act before the next one.
// "…" and "Ohh" are sent as a comma and "Oh", which Azure reads more naturally.
const ACTION = /\b(click|type|select|pick|choose|press|open|paste)\b/i;
const plain = (t: string) => t.replace(/…/g, ',').replace(/Ohh/g, 'Oh').replace(/,\s*([.!?])/g, '$1');
export function ssml(text: string, variant: number, slow = false, voiceName = AZURE_VOICES[0], style: number | null = null) {
  const p = slow ? STUCK : style !== null ? STYLES[style] : VARIANTS[variant % VARIANTS.length];
  const body = plain(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/“([^”]+)”/g, '<break time="150ms"/><emphasis level="moderate">$1</emphasis><break time="150ms"/>');
  const gap = ACTION.test(text) ? (slow ? 1100 : 800) : 0; // time to act on the instruction
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voiceName}"><prosody rate="${p.rate}" pitch="${p.pitch}">${body}${gap ? `<break time="${gap}ms"/>` : ''}</prosody></voice></speak>`;
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

  private async url(text: string, variant: number, slow: boolean, first = false) {
    if (first && !slow) text = flavor(text, this.style); // opener once per speak(), on the first line only
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
        const u = await this.url(t, variant, slow, i === 0);
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
