import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import { useAttentionDetection } from '../lib/useAttentionDetection';
import pageCss from './Player.css?inline';

const MEDIA = '/media/azure/foundry-agent';

type Cue = { start: number; end: number; text: string };

const toSeconds = (ts: string) => {
  const [h, m, s] = ts.replace(',', '.').split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

const parseSrt = (raw: string): Cue[] =>
  raw
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const rows = block.split('\n');
      const i = rows.findIndex((r) => r.includes('-->'));
      if (i < 0) return null;
      const [a, b] = rows[i].split('-->').map((x) => x.trim());
      return { start: toSeconds(a), end: toSeconds(b), text: rows.slice(i + 1).join(' ') };
    })
    .filter((c): c is Cue => c !== null);

const fmt = (sec: number) => {
  const n = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

export default function Player() {
  const [s, setState] = useMergeState({
    audio: 'en', subs: 'en', playing: false, done: false,
    cur: 0, dur: 0, cues: {} as Record<string, Cue[]>, tracks: {} as Record<string, string>,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const langs = [['en', 'English'], ['es', 'Español'], ['hi', 'हिन्दी'], ['ar', 'العربية']];

  const attention = useAttentionDetection();
  const { status, videoRef: camVideoRef, canvasRef: camCanvasRef, start, stop } = attention;

  // Camera runs only while the lesson video is actually playing — starts the
  // moment playback begins, stops on pause/finish or leaving the page.
  // Deferred via setTimeout(0) for the same reason as Setup.tsx: React's
  // StrictMode double-invokes this effect in dev (mount, cleanup, mount)
  // synchronously, which races start()'s internal "starting" guard against
  // the simulated unmount's stop() if called directly.
  useEffect(() => {
    if (!s.playing || s.done) {
      stop();
      return;
    }
    const timer = setTimeout(() => start(), 0);
    return () => {
      clearTimeout(timer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.playing, s.done]);
  const statusColor =
    status === 'engaged' ? '#5BE584'
    : status === 'calibrating' || status === 'loading' ? '#8FB0FF'
    : status === 'idle' || status === 'cancelling' ? '#8B8B94'
    : '#FF6B6B';

  // Load the subtitle tracks once.
  useEffect(() => {
    langs.forEach(([id]) => {
      fetch(`${MEDIA}/subs-${id}.srt`)
        .then((r) => r.text())
        .then((raw) => setState((prev) => ({ cues: { ...prev.cues, [id]: parseSrt(raw) } })))
        .catch((err) => console.error(`Failed to load ${id} subtitles`, err));
    });
  }, []);

  // The video file has no audio; the narration plays from a separate track
  // that follows the video's play/pause/seek state. Each track is fetched in
  // full and played from a blob URL so seeking and switching language never
  // wait on the network.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    langs.forEach(([id]) => {
      fetch(`${MEDIA}/audio-${id}.mp3`)
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          if (!cancelled) setState((prev) => ({ tracks: { ...prev.tracks, [id]: url } }));
        })
        .catch((err) => console.error(`Failed to load ${id} audio`, err));
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const syncAudio = () => {
    const vid = videoRef.current, a = audioRef.current;
    if (vid && a && Math.abs(a.currentTime - vid.currentTime) > 0.3) a.currentTime = vid.currentTime;
  };
  const seek = (t: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = t;
    if (audioRef.current) audioRef.current.currentTime = t;
    setState({ cur: t });
  };

  const on = 'background: #F4F4F5; color: #0B0B0D; border: 1px solid #F4F4F5; font-weight: 600';
  const off = 'background: transparent; color: #D4D4D8; border: 1px solid #33333B';
  const mk = (key: 'audio' | 'subs', list: string[][]) =>
    list.map(([id, label]) => ({ label, on: s[key] === id ? 'true' : 'false', style: s[key] === id ? on : off, pick: () => setState({ [key]: id }) }));
  const todo = 'background: #1F1F24; color: #A1A1AA';
  const cur = 'background: #3E6AE1; color: #FFFFFF';
  const cue = (s.cues[s.subs] || []).find((c) => s.cur >= c.start && s.cur < c.end);
  const pctNum = s.dur ? Math.min(100, (s.cur / s.dur) * 100) : 0;
  const vals = {
    subtitle: cue ? cue.text : '',
    showSubs: s.subs !== 'off' && !!cue,
    playing: s.playing, paused: !s.playing,
    playLabel: s.playing ? 'Pause' : 'Play',
    togglePlay: () => {
      const vid = videoRef.current;
      if (!vid) return;
      if (vid.paused) { if (s.done) seek(0); vid.play().catch(() => {}); } else vid.pause();
    },
    done: s.done,
    time: `${fmt(s.cur)} / ${fmt(s.dur)}`,
    pct: `${pctNum}%`,
    jumpEnd: () => {
      const vid = videoRef.current;
      if (!vid) return;
      vid.pause();
      seek(s.dur);
      setState({ done: true, playing: false });
    },
    rewatch: () => {
      seek(Math.max(0, s.dur - 30));
      setState({ done: false });
      videoRef.current?.play().catch(() => {});
    },
    audioOpts: mk('audio', langs),
    subOpts: mk('subs', langs.concat([['off', 'Off']])),
    azureLessons: [
      { icon: '▶', badge: cur, title: '1 · Build your first agent in Foundry', meta: `Video · ${fmt(s.dur || 198)} · playing`, href: '/learn', bg: 'background: #16161B;' },
      { icon: '?', badge: todo, title: 'Quick check', meta: 'Quiz · 3 questions', href: '/quiz', bg: '' },
      { icon: '⚗', badge: todo, title: 'Hands-on: Build an agent', meta: 'Lab · Azure AI Foundry · 25 min', href: '/labs', bg: '' },
      { icon: '◎', badge: todo, title: 'Guided session with Ava', meta: 'Voice + ghost cursor', href: '/setup', bg: '' },
    ],
    copilotLessons: [
      { icon: '·', badge: todo, title: 'Copilot Studio lessons', meta: 'Coming soon', href: '/learn', bg: '' },
    ],
  };
  const { audioOpts, azureLessons, copilotLessons, done, jumpEnd, paused, pct, playLabel, playing, rewatch, showSubs, subOpts, subtitle, time, togglePlay } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/learn" />
        <div style={{ flexGrow: "1", display: "flex", minWidth: "0" }}>
          <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", padding: "28px 40px", display: "flex", flexDirection: "column", gap: "18px", minWidth: "0", overflow: "auto" }}>
            <div style={{ fontSize: "13px", color: "#8B8B94" }}>
              <Link to="/" style={{ color: "#A1A1AA" }}>
                Azure
              </Link>
              {" "}/ AZ-900 · Foundry agents
            </div>
            <h1 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
              1 · Build your first agent in Foundry
            </h1>
            <div style={{ position: "relative", width: "100%", maxWidth: "960px", aspectRatio: "16 / 9", flexShrink: "0", borderRadius: "20px", overflow: "hidden", background: "#0E1322", border: "1px solid #1F1F24" }}>
              <video
                ref={videoRef}
                src={`${MEDIA}/video.mp4`}
                muted
                playsInline
                preload="metadata"
                onClick={togglePlay}
                onLoadedMetadata={(e) => setState({ dur: e.currentTarget.duration })}
                onTimeUpdate={(e) => { setState({ cur: e.currentTarget.currentTime }); syncAudio(); }}
                onPlay={() => { setState({ playing: true, done: false }); audioRef.current?.play().catch(() => {}); }}
                onPause={() => { setState({ playing: false }); audioRef.current?.pause(); }}
                onSeeked={syncAudio}
                onEnded={() => { audioRef.current?.pause(); setState({ done: true, playing: false }); }}
                style={{ position: "absolute", left: "0", top: "0", width: "100%", height: "100%", objectFit: "contain", background: "#0E1322", cursor: "pointer" }}
              />
              <audio
                ref={audioRef}
                src={s.tracks[s.audio]}
                preload="auto"
                onLoadedData={(e) => {
                  const vid = videoRef.current;
                  if (!vid) return;
                  e.currentTarget.currentTime = vid.currentTime;
                  if (!vid.paused) e.currentTarget.play().catch(() => {});
                }}
              />
              <div style={{ position: "absolute", right: "16px", top: "16px", width: "110px", height: "82px", borderRadius: "12px", overflow: "hidden", background: "#000000", border: "1px solid #26262C", zIndex: 2 }}>
                <video
                  ref={camVideoRef}
                  muted
                  playsInline
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                />
                <canvas
                  ref={camCanvasRef}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "scaleX(-1)" }}
                />
                <div style={{ position: "absolute", left: "6px", bottom: "6px", display: "flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "999px", background: "rgba(0,0,0,0.6)", fontSize: "10px" }}>
                  <span style={css(`width: 6px; height: 6px; border-radius: 50%; background: ${statusColor}`)} />
                  Focus
                </div>
              </div>
              {showSubs && (
                <>
                  <div style={{ position: "absolute", left: "80px", right: "80px", bottom: "76px", textAlign: "center" }}>
                    <span dir={s.subs === 'ar' ? 'rtl' : 'ltr'} style={{ display: "inline-block", padding: "8px 14px", borderRadius: "8px", background: "rgba(0,0,0,0.72)", fontSize: "20px", lineHeight: "1.4" }}>
                      {subtitle}
                    </span>
                  </div>
                </>
              )}
              <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "60px", padding: "0 20px", display: "flex", alignItems: "center", gap: "16px", background: "rgba(11,11,13,0.75)" }}>
                <button onClick={togglePlay} aria-label={playLabel} style={{ width: "36px", height: "36px", borderRadius: "10px", border: "0", background: "transparent", color: "#F4F4F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {playing && (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#F4F4F5">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    </>
                  )}
                  {paused && (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#F4F4F5">
                        <path d="M8 5l11 7-11 7z" />
                      </svg>
                    </>
                  )}
                </button>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "13px", color: "#D4D4D8" }}>
                  {time}
                </div>
                <div onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * s.dur); }} style={{ flexGrow: "1", height: "4px", borderRadius: "2px", background: "#33333B", position: "relative", cursor: "pointer" }}>
                  <div style={css(`width: ${pct}; height: 4px; border-radius: 2px; background: #F4F4F5`)} />
                  <div title="Quiz" style={{ position: "absolute", right: "-2px", top: "-4px", width: "12px", height: "12px", borderRadius: "50%", background: "#3E6AE1", border: "2px solid #0E1322" }} />
                </div>
                <button onClick={jumpEnd} style={{ height: "32px", padding: "0 12px", borderRadius: "8px", border: "1px solid #33333B", background: "transparent", color: "#D4D4D8", fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }}>
                  Skip to end
                </button>
              </div>
              {done && (
                <>
                  <div style={{ position: "absolute", inset: "0", background: "rgba(11,11,13,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "28px" }}>
                    <div style={{ width: "620px", padding: "24px 28px", borderRadius: "22px", background: "rgba(28,28,33,0.9)", border: "1px solid #33333B", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", gap: "20px", animation: "rise 0.28s ease-out" }}>
                      <div style={{ flexGrow: "1" }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#5BE584" }}>
                          VIDEO COMPLETE
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: "600", marginTop: "6px" }}>
                          Quick check · 3 questions · about 2 min
                        </div>
                        <div style={{ fontSize: "13px", color: "#A1A1AA", marginTop: "4px" }}>
                          Pass at 80% to unlock the hands-on lab.
                        </div>
                      </div>
                      <button onClick={rewatch} className="btn ghost">
                        Rewatch 30s
                      </button>
                      <Link to="/quiz" className="btn">
                        Start quiz
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: "32px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A1A1AA" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
                  </svg>
                  Audio track
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {audioOpts.map((o, oIndex) => (
                    <Fragment key={oIndex}>
                      <button className="pill" onClick={o.pick} aria-pressed={o.on === 'true'} style={css(o.style)}>
                        {o.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#A1A1AA" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3" />
                  </svg>
                  Subtitles
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {subOpts.map((o, oIndex) => (
                    <Fragment key={oIndex}>
                      <button className="pill" onClick={o.pick} aria-pressed={o.on === 'true'} style={css(o.style)}>
                        {o.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </main>
          <aside className="no-scrollbar" style={{ width: "360px", flexShrink: "0", borderLeft: "1px solid #1F1F24", display: "flex", flexDirection: "column", overflow: "auto" }}>
            <div style={{ padding: "28px 24px 16px" }}>
              <div style={{ fontSize: "16px", fontWeight: "600" }}>
                Course content
              </div>
              <div style={{ fontSize: "13px", color: "#8B8B94", marginTop: "4px" }}>
                Azure · Copilot · 4 lessons · 1 lab
              </div>
            </div>
            <div style={{ padding: "0 24px 8px", fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#8B8B94" }}>
              AZURE
            </div>
            <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {azureLessons.map((l, lIndex) => (
                <Fragment key={lIndex}>
                  <Link to={l.href} className="row" style={css(`display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; color: #F4F4F5; ${l.bg}`)}>
                    <span style={css(`width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; ${l.badge}`)}>
                      {l.icon}
                    </span>
                    <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>
                        {l.title}
                      </span>
                      <span style={{ fontSize: "12px", color: "#8B8B94" }}>
                        {l.meta}
                      </span>
                    </span>
                  </Link>
                </Fragment>
              ))}
            </div>
            <div style={{ padding: "0 24px 8px", fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#8B8B94" }}>
              COPILOT
            </div>
            <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {copilotLessons.map((l, lIndex) => (
                <Fragment key={lIndex}>
                  <Link to={l.href} className="row" style={css(`display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; color: #F4F4F5; ${l.bg}`)}>
                    <span style={css(`width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; ${l.badge}`)}>
                      {l.icon}
                    </span>
                    <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "500" }}>
                        {l.title}
                      </span>
                      <span style={{ fontSize: "12px", color: "#8B8B94" }}>
                        {l.meta}
                      </span>
                    </span>
                  </Link>
                </Fragment>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
