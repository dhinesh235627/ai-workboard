import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './Player.css?inline';

export default function Player() {
  const [s, setState] = useMergeState({ audio: 'en', subs: 'es', playing: true, done: false });
  const lines: Record<string, string> = {
    en: 'An agent combines a model, instructions and tools to complete a task.',
    es: 'Un agente combina un modelo, instrucciones y herramientas para completar una tarea.',
    hi: 'एक एजेंट किसी कार्य को पूरा करने के लिए मॉडल, निर्देश और टूल्स को जोड़ता है।',
    de: 'Ein Agent kombiniert ein Modell, Anweisungen und Tools, um eine Aufgabe zu erledigen.',
    ja: 'エージェントは、モデル・指示・ツールを組み合わせてタスクを実行します。',
  };
  const langs = [['en', 'English'], ['es', 'Español'], ['hi', 'हिन्दी'], ['de', 'Deutsch'], ['ja', '日本語']];
  const on = 'background: #F4F4F5; color: #0B0B0D; border: 1px solid #F4F4F5; font-weight: 600';
  const off = 'background: transparent; color: #D4D4D8; border: 1px solid #33333B';
  const mk = (key: 'audio' | 'subs', list: string[][]) =>
    list.map(([id, label]) => ({ label, on: s[key] === id ? 'true' : 'false', style: s[key] === id ? on : off, pick: () => setState({ [key]: id }) }));
  const doneBadge = 'background: rgba(48,209,88,0.14); color: #5BE584';
  const todo = 'background: #1F1F24; color: #A1A1AA';
  const cur = 'background: #3E6AE1; color: #FFFFFF';
  const vals = {
    subtitle: lines[s.subs] || '',
    showSubs: s.subs !== 'off',
    playing: s.playing, paused: !s.playing,
    playLabel: s.playing ? 'Pause' : 'Play',
    togglePlay: () => setState({ playing: !s.playing }),
    done: s.done,
    time: s.done ? '12:30 / 12:30' : '04:12 / 12:30',
    pct: s.done ? '100%' : '34%',
    jumpEnd: () => setState({ done: true, playing: false }),
    rewatch: () => setState({ done: false, playing: true }),
    audioOpts: mk('audio', langs),
    subOpts: mk('subs', langs.concat([['off', 'Off']])),
    lessons: [
      { icon: '✓', badge: doneBadge, title: '1 · What is an agent?', meta: 'Video · 9 min', href: '/learn', bg: '' },
      { icon: '✓', badge: doneBadge, title: '2 · Models in Foundry', meta: 'Video · 11 min', href: '/learn', bg: '' },
      { icon: '✓', badge: doneBadge, title: 'Quick check', meta: 'Quiz · 100%', href: '/quiz', bg: '' },
      { icon: '▶', badge: cur, title: '4 · Agent instructions & tools', meta: 'Video · 12 min · playing', href: '/learn', bg: 'background: #16161B;' },
      { icon: '?', badge: todo, title: 'Quick check', meta: 'Quiz · 3 questions', href: '/quiz', bg: '' },
      { icon: '⚗', badge: todo, title: 'Hands-on: Build an agent', meta: 'Lab · Azure AI Foundry · 25 min', href: '/labs', bg: '' },
      { icon: '◎', badge: todo, title: 'Guided session with Ava', meta: 'Voice + ghost cursor', href: '/setup', bg: '' },
      { icon: '5', badge: todo, title: '5 · Grounding with your data', meta: 'Video · 14 min', href: '/learn', bg: '' },
    ],
  };
  const { audioOpts, done, jumpEnd, lessons, paused, pct, playLabel, playing, rewatch, showSubs, subOpts, subtitle, time, togglePlay } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/learn" />
        <div style={{ flexGrow: "1", display: "flex", minWidth: "0" }}>
          <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", padding: "28px 40px", display: "flex", flexDirection: "column", gap: "18px", minWidth: "0", overflow: "auto" }}>
            <div style={{ fontSize: "13px", color: "#8B8B94" }}>
              <Link to="/" style={{ color: "#A1A1AA" }}>
                Azure AI Foundry Agents
              </Link>
              {" "}/ Section 2 · Build
            </div>
            <h1 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.02em" }}>
              4 · Agent instructions &amp; tools
            </h1>
            <div style={{ position: "relative", width: "960px", height: "540px", flexShrink: "0", borderRadius: "20px", overflow: "hidden", background: "#0E1322", border: "1px solid #1F1F24" }}>
              <div style={{ position: "absolute", left: "0", top: "0", width: "960px", height: "460px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "28px" }}>
                <div style={{ fontSize: "14px", letterSpacing: "0.14em", color: "#8FB0FF", fontWeight: "600" }}>
                  CORE IDEA
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "22px", fontWeight: "500" }}>
                  <div style={{ padding: "18px 24px", borderRadius: "16px", background: "#182038", border: "1px solid #2B3656" }}>
                    Model
                  </div>
                  <span style={{ color: "#8B8B94" }}>
                    +
                  </span>
                  <div style={{ padding: "18px 24px", borderRadius: "16px", background: "#182038", border: "1px solid #2B3656" }}>
                    Instructions
                  </div>
                  <span style={{ color: "#8B8B94" }}>
                    +
                  </span>
                  <div style={{ padding: "18px 24px", borderRadius: "16px", background: "#182038", border: "1px solid #2B3656" }}>
                    Tools
                  </div>
                  <span style={{ color: "#8B8B94" }}>
                    =
                  </span>
                  <div style={{ padding: "18px 24px", borderRadius: "16px", background: "#F4F4F5", color: "#0B0B0D", fontWeight: "600" }}>
                    Agent
                  </div>
                </div>
              </div>
              {showSubs && (
                <>
                  <div style={{ position: "absolute", left: "80px", right: "80px", bottom: "76px", textAlign: "center" }}>
                    <span style={{ display: "inline-block", padding: "8px 14px", borderRadius: "8px", background: "rgba(0,0,0,0.72)", fontSize: "20px", lineHeight: "1.4" }}>
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
                <div style={{ flexGrow: "1", height: "4px", borderRadius: "2px", background: "#33333B", position: "relative" }}>
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
                12 lessons · 3 labs · 38% complete
              </div>
            </div>
            <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {lessons.map((l, lIndex) => (
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
