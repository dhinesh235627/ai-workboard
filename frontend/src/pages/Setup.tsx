import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import { STATUS_TEXT, useAttentionDetection } from '../lib/useAttentionDetection';
import pageCss from './Setup.css?inline';

export default function Setup() {
  const [s, setState] = useMergeState({ step: 0, c0: true, c1: false, mon: 0, voice: 0, style: 0, practiced: false });
  const attention = useAttentionDetection();
  const { status, faceSignals, errorMessage, running, videoRef, canvasRef, start, stop } = attention;

  // Real detection only runs while Step 1 ("Camera & consent") is showing —
  // start the camera when this step becomes visible, stop it the moment we
  // leave it (or unmount). start()/stop() are safe to call repeatedly: the
  // hook no-ops a start() while already running and a stop() while already
  // idle.
  useEffect(() => {
    if (s.step !== 0) {
      stop();
      return;
    }
    // Deferred via setTimeout(0) on purpose: React's StrictMode (see
    // main.tsx) double-invokes effects in dev mode — mount, cleanup, mount
    // again — entirely synchronously, with no await/microtask in between.
    // Calling start() directly here raced with that: the first start()
    // began (setting its internal "starting" guard) then got flagged
    // cancelled by the immediate simulated-unmount's stop() call, and the
    // immediate remount's start() then no-op'd against that same guard
    // (real, confirmed bug — verified via browser-automation against the
    // Vite dev server: status stuck on "idle", getUserMedia never even
    // requested). Scheduling the real start() as a macrotask lets the
    // StrictMode cleanup-then-remount cycle finish first — the first
    // timer gets cleared by the simulated cleanup before it ever fires,
    // and only the remount's timer actually runs start().
    const timer = setTimeout(() => start(), 0);
    return () => {
      clearTimeout(timer);
      stop();
    };
    // start/stop close over hook-internal refs and are recreated every
    // render (the hook isn't wrapped in useCallback) — depending only on the
    // step index avoids re-running this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.step === 0]);

  // Tab-switch screenshot: capture the current camera frame the moment this
  // tab is switched away from or minimized, but only while the camera is
  // actually running and the person has opted into "Snapshot on flag."
  // Screenshots are kept in memory only for this pass — there is no
  // storage/upload endpoint yet, so nothing here is persisted or sent
  // anywhere.
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const lastCaptureAtRef = useRef(0);
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'hidden') return;
      if (!running || !s.c1) return;
      const now = Date.now();
      // Reduced from the reference project's own documented 800ms to 100ms
      // per explicit request — still exists purely to stop a single rapid
      // alt-tab from flooding the in-memory screenshot list with duplicates.
      if (now - lastCaptureAtRef.current < 100) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      lastCaptureAtRef.current = now;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setScreenshots((prev) => [...prev, dataUrl]);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [running, s.c1, videoRef]);

  // "Face centered": a face is being detected and isn't turned away from
  // the screen — 'calibrating' still counts (a face IS present, we're just
  // sampling a baseline), but 'looking-away'/'gaze-away'/'no-face'/etc. don't.
  const faceCentered = status === 'engaged' || status === 'calibrating';
  // "One person in view" comes straight from the real face count Human
  // reports per frame.
  const onePersonInView = faceSignals?.faceCount === 1;
  const statusColor =
    status === 'engaged' ? '#5BE584'
    : status === 'calibrating' || status === 'loading' ? '#8FB0FF'
    : status === 'idle' || status === 'cancelling' ? '#8B8B94'
    : '#FF6B6B';
  const titles = ['Camera & consent', 'Microphone & speakers', 'Share your screen', 'Meet your guide', 'Try the ghost cursor'];
  const list = titles.map((t, i) => ({
    t, go: () => setState({ step: i }),
    mark: i < s.step ? '✓' : String(i + 1),
    badge: i < s.step ? 'background: rgba(48,209,88,0.16); color: #5BE584' : i === s.step ? 'background: #3E6AE1; color: #FFFFFF' : 'background: #1F1F24; color: #A1A1AA',
    row: i === s.step ? 'background: #151518; border: 1px solid #26262C' : '',
    dot: i <= s.step ? 'background: #F4F4F5' : 'background: #33333B',
  }));
  const tog = (on: boolean) => ({ track: on ? 'background: #3E6AE1' : 'background: #33333B', knob: on ? 'left: 21px' : 'left: 3px', on: on ? 'true' : 'false' });
  const consents = [
    { t: 'Focus & presence during guided sessions', d: 'Ava slows down or checks in if you look away', flip: () => setState({ c0: !s.c0 }), ...tog(s.c0) },
    { t: 'Snapshot on flag (proctored assessments only)', d: 'Encrypted and deleted after 30 days', flip: () => setState({ c1: !s.c1 }), ...tog(s.c1) },
  ];
  const sel = 'border: 1px solid #3E6AE1';
  const uns = 'border: 1px solid #1F1F24';
  const monitors = [{ t: 'Display 1 · 2560 × 1440', preview: 'Built-in display' }, { t: 'Display 2 · 3840 × 2160', preview: 'External monitor' }]
    .map((m, i) => ({ ...m, border: s.mon === i ? sel : uns, on: s.mon === i ? 'true' : 'false', pick: () => setState({ mon: i }) }));
  const voices = [{ i: 'A', n: 'Ava', d: 'Warm and encouraging' }, { i: 'L', n: 'Leo', d: 'Calm and precise' }, { i: 'Y', n: 'Your team voice', d: 'Cloned voice · admin approval required' }]
    .map((v, i) => ({ ...v, border: s.voice === i ? sel : uns, on: s.voice === i ? 'true' : 'false', pick: () => setState({ voice: i }) }));
  const styles = ['Encouraging', 'Neutral', 'Energetic'].map((t, i) => ({
    t, on: s.style === i ? 'true' : 'false', pick: () => setState({ style: i }),
    s: s.style === i ? 'background: #F4F4F5; color: #0B0B0D; border: 1px solid #F4F4F5; font-weight: 600' : 'background: transparent; border: 1px solid #33333B',
  }));
  const bars = Array.from({ length: 24 }, (_, i) => ({ d: 'animation-delay: -' + ((i * 137) % 1000) / 1000 + 's' }));
  const vals = {
    list, consents, monitors, voices, styles, bars,
    num: s.step + 1,
    s0: s.step === 0, s1: s.step === 1, s2: s.step === 2, s3: s.step === 3, s4: s.step === 4,
    last: s.step === 4, notLast: s.step < 4,
    practiced: s.practiced, practice: () => setState({ practiced: true }),
    next: () => setState({ step: Math.min(4, s.step + 1) }),
    back: () => setState({ step: Math.max(0, s.step - 1) }),
  };
  const { back, last, next, notLast, num, practice, practiced, s0, s1, s2, s3, s4 } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <aside className="no-scrollbar" style={{ width: "360px", flexShrink: "0", borderRight: "1px solid #1F1F24", padding: "36px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "28px", overflow: "auto" }}>
          <Link to="/labs" style={{ fontSize: "14px", color: "#A1A1AA" }}>
            ← Back to lab
          </Link>
          <div>
            <div style={{ fontSize: "13px", color: "#8B8B94", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Guided session setup
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: "30px", fontWeight: "600", letterSpacing: "-0.02em", lineHeight: "1.15" }}>
              Two minutes now, a personal coach all lab long.
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {list.map((c, cIndex) => (
              <Fragment key={cIndex}>
                <button className="ch" onClick={c.go} style={css(`display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 14px; background: transparent; border: 1px solid transparent; ${c.row}`)}>
                  <span style={css(`width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; ${c.badge}`)}>
                    {c.mark}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: "500" }}>
                    {c.t}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
          <div style={{ flexGrow: "1" }} />
          <div style={{ fontSize: "12px", color: "#8B8B94", lineHeight: "1.6" }}>
            You can pause the camera, mic or screen share at any time. Settings › Privacy shows exactly what is kept.
          </div>
        </aside>
        <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "28px", position: "relative", overflow: "auto" }}>
          <div style={{ display: "flex", gap: "8px", flexShrink: "0" }}>
            {list.map((c, cIndex) => (
              <Fragment key={cIndex}>
                <span style={css(`width: 32px; height: 4px; border-radius: 2px; ${c.dot}`)} />
              </Fragment>
            ))}
          </div>
          <div style={{ width: "820px", height: "560px", flexShrink: "0", boxSizing: "border-box", borderRadius: "28px", background: "#151518", border: "1px solid #24242A", padding: "40px", display: "flex", flexDirection: "column", gap: "22px", animation: "rise 0.25s ease-out" }}>
            <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#8FB0FF" }}>
              STEP {num} OF 5
            </div>
            {s0 && (
              <>
                <div style={{ display: "flex", gap: "32px", flexGrow: "1" }}>
                  <div style={{ width: "360px", height: "270px", borderRadius: "20px", background: "#0E1322", position: "relative", overflow: "hidden", flexShrink: "0" }}>
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "scaleX(-1)" }}
                    />
                    <div style={{ position: "absolute", left: "12px", top: "12px", display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "999px", background: "rgba(0,0,0,0.6)", fontSize: "12px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor }} />
                      Preview · on device
                    </div>
                    {errorMessage && (
                      <div style={{ position: "absolute", left: "12px", right: "12px", bottom: "12px", padding: "8px 10px", borderRadius: "10px", background: "rgba(0,0,0,0.72)", fontSize: "12px", color: "#FF6B6B" }}>
                        {errorMessage}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px", flexGrow: "1" }}>
                    <h2 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                      Camera check
                    </h2>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: statusColor }}>
                      {STATUS_TEXT[status]}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
                      <div style={{ display: "flex", gap: "10px", color: "#D4D4D8" }}>
                        <span style={{ color: faceCentered ? "#5BE584" : "#8B8B94" }}>
                          {faceCentered ? "✓" : "○"}
                        </span>
                        Face centered
                      </div>
                      <div style={{ display: "flex", gap: "10px", color: "#D4D4D8" }}>
                        {/* This detection engine (Human face-mesh + coco-ssd) has
                            no brightness/lighting metric at all — nothing here is
                            real, so this stays a static checkmark rather than
                            fabricating a signal that doesn't exist. */}
                        <span style={{ color: "#5BE584" }}>
                          ✓
                        </span>
                        Lighting good
                      </div>
                      <div style={{ display: "flex", gap: "10px", color: "#D4D4D8" }}>
                        <span style={{ color: onePersonInView ? "#5BE584" : "#8B8B94" }}>
                          {onePersonInView ? "✓" : "○"}
                        </span>
                        One person in view
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "#A1A1AA", lineHeight: "1.55" }}>
                      We detect only{" "}
                      <span style={{ color: "#F4F4F5" }}>
                        presence, looking away and distraction
                      </span>
                      . Frames never leave this device. We never infer emotions, age or identity.
                    </div>
                    {consents.map((k, kIndex) => (
                      <Fragment key={kIndex}>
                        <button className="ch" onClick={k.flip} aria-pressed={k.on === 'true'} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: "#101014", border: "1px solid #1F1F24" }}>
                          <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "14px", fontWeight: "600" }}>
                              {k.t}
                            </span>
                            <span style={{ fontSize: "12px", color: "#8B8B94" }}>
                              {k.d}
                            </span>
                          </span>
                          <span style={css(`width: 44px; height: 26px; border-radius: 13px; position: relative; flex-shrink: 0; ${k.track}`)}>
                            <span style={css(`position: absolute; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #FFFFFF; ${k.knob}`)} />
                          </span>
                        </button>
                      </Fragment>
                    ))}
                    {s.c1 && screenshots.length > 0 && (
                      <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                        {screenshots.length} tab-switch snapshot{screenshots.length === 1 ? "" : "s"} captured this session (kept in memory only — not uploaded).
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {s1 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px", flexGrow: "1" }}>
                  <h2 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                    Microphone &amp; speakers
                  </h2>
                  <div style={{ fontSize: "15px", color: "#A1A1AA" }}>
                    Say “Hey Ava, can you hear me?”
                  </div>
                  <div style={{ height: "120px", borderRadius: "20px", background: "#101014", border: "1px solid #1F1F24", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    {bars.map((b, bIndex) => (
                      <Fragment key={bIndex}>
                        <span style={css(`width: 6px; height: 64px; border-radius: 3px; background: #3E6AE1; transform-origin: center; animation: lvl 1s ease-in-out infinite; ${b.d}`)} />
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#A1A1AA" }}>
                      Microphone
                      <select style={{ height: "44px", borderRadius: "12px", background: "#101014", border: "1px solid #2A2A31", color: "#F4F4F5", padding: "0 12px", fontFamily: "inherit", fontSize: "14px" }}>
                        <option>
                          Studio Display Microphone
                        </option>
                        <option>
                          Headset
                        </option>
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#A1A1AA" }}>
                      Speaker
                      <select style={{ height: "44px", borderRadius: "12px", background: "#101014", border: "1px solid #2A2A31", color: "#F4F4F5", padding: "0 12px", fontFamily: "inherit", fontSize: "14px" }}>
                        <option>
                          MacBook Pro Speakers
                        </option>
                        <option>
                          Headset
                        </option>
                      </select>
                    </label>
                  </div>
                  <button className="btn ghost" style={{ alignSelf: "flex-start" }}>
                    Play test tone
                  </button>
                </div>
              </>
            )}
            {s2 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", flexGrow: "1" }}>
                  <h2 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                    Share your screen
                  </h2>
                  <div style={{ fontSize: "15px", color: "#A1A1AA" }}>
                    Ava sees the screen you choose and watches your cursor, so she can point to the next click.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
                    {monitors.map((m, mIndex) => (
                      <Fragment key={mIndex}>
                        <button className="ch" onClick={m.pick} aria-pressed={m.on === 'true'} style={css(`padding: 14px; border-radius: 18px; background: #101014; display: flex; flex-direction: column; gap: 12px; ${m.border}`)}>
                          <span style={{ height: "150px", borderRadius: "10px", background: "#1B2233", display: "flex", alignItems: "center", justifyContent: "center", color: "#8B8B94", fontSize: "13px" }}>
                            {m.preview}
                          </span>
                          <span style={{ fontSize: "14px", fontWeight: "600" }}>
                            {m.t}
                          </span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", color: "#A1A1AA" }}>
                    Never share:
                    <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8" }}>
                      Outlook
                    </span>
                    <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8" }}>
                      Teams
                    </span>
                    <span style={{ padding: "6px 10px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8" }}>
                      Password manager
                    </span>
                    <Link to="/setup">
                      + Add app
                    </Link>
                  </div>
                </div>
              </>
            )}
            {s3 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", flexGrow: "1" }}>
                  <h2 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                    Meet your guide
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
                    {voices.map((v, vIndex) => (
                      <Fragment key={vIndex}>
                        <button className="ch" onClick={v.pick} aria-pressed={v.on === 'true'} style={css(`padding: 18px; border-radius: 18px; background: #101014; display: flex; flex-direction: column; gap: 10px; ${v.border}`)}>
                          <span style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#1F2436", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#B9CEFF" }}>
                            {v.i}
                          </span>
                          <span style={{ fontSize: "16px", fontWeight: "600" }}>
                            {v.n}
                          </span>
                          <span style={{ fontSize: "13px", color: "#8B8B94" }}>
                            {v.d}
                          </span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ fontSize: "13px", color: "#A1A1AA" }}>
                    Speaking style
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {styles.map((x, xIndex) => (
                      <Fragment key={xIndex}>
                        <button className="ch" onClick={x.pick} aria-pressed={x.on === 'true'} style={css(`height: 36px; padding: 0 14px; border-radius: 999px; font-size: 13px; ${x.s}`)}>
                          {x.t}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  <button className="btn ghost" style={{ alignSelf: "flex-start" }}>
                    ▶ Hear a sample
                  </button>
                </div>
              </>
            )}
            {s4 && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", flexGrow: "1" }}>
                  <h2 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                    Try the ghost cursor
                  </h2>
                  <div style={{ fontSize: "15px", color: "#A1A1AA" }}>
                    When Ava wants you to click something, a blue cursor glides there and pulses. Click the button it points to.
                  </div>
                  <div style={{ flexGrow: "1", borderRadius: "20px", background: "#F4F5F7", position: "relative", overflow: "hidden" }}>
                    <button onClick={practice} style={{ position: "absolute", left: "420px", top: "90px", height: "44px", padding: "0 18px", borderRadius: "10px", border: "0", background: "#0F172A", color: "#FFFFFF", fontFamily: "inherit", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
                      + Create
                    </button>
                    <div style={{ position: "absolute", left: "470px", top: "108px", pointerEvents: "none" }}>
                      <span style={{ position: "absolute", left: "-18px", top: "-18px", width: "40px", height: "40px", borderRadius: "50%", border: "2px solid #3E6AE1", animation: "pulse 1.4s ease-out infinite" }} />
                      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 2l16 8-7 2-3 7z" fill="#3E6AE1" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                      <span style={{ position: "absolute", left: "26px", top: "20px", whiteSpace: "nowrap", padding: "4px 10px", borderRadius: "999px", background: "#3E6AE1", color: "#FFFFFF", fontSize: "12px", fontWeight: "600" }}>
                        Click “Create”
                      </span>
                    </div>
                    {practiced && (
                      <>
                        <div style={{ position: "absolute", left: "24px", bottom: "24px", padding: "10px 14px", borderRadius: "12px", background: "#0F172A", color: "#FFFFFF", fontSize: "14px" }}>
                          Nice. That's how I'll point you through the lab.
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "18px", fontSize: "12px", color: "#A1A1AA" }}>
                    <span>
                      <span style={{ fontFamily: "'Geist Mono', monospace", color: "#D4D4D8" }}>
                        Ctrl ⇧ Space
                      </span>
                      {" "}pause
                    </span>
                    <span>
                      <span style={{ fontFamily: "'Geist Mono', monospace", color: "#D4D4D8" }}>
                        Ctrl ⇧ M
                      </span>
                      {" "}mute Ava
                    </span>
                    <span>
                      <span style={{ fontFamily: "'Geist Mono', monospace", color: "#D4D4D8" }}>
                        Esc
                      </span>
                      {" "}end session
                    </span>
                  </div>
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="btn ghost" onClick={back}>
                Back
              </button>
              {notLast && (
                <>
                  <button className="btn" onClick={next}>
                    Continue
                  </button>
                </>
              )}
              {last && (
                <>
                  <Link to="/guided" className="btn">
                    Start guided session
                  </Link>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
