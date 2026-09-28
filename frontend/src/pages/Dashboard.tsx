import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import pageCss from './Dashboard.css?inline';

export default function Dashboard() {
  const live = 'background: rgba(48,209,88,0.14); color: #5BE584';
  const soon = 'background: #1F1F24; color: #A1A1AA';
  const vals = {
    platforms: [
      { mono: 'AF', name: 'Azure AI Foundry', status: 'Live', pill: live, meta: '6 labs · agents, RAG' },
      { mono: 'CS', name: 'Copilot Studio', status: 'Live', pill: live, meta: '4 labs · agent building' },
      { mono: 'ML', name: 'Azure Machine Learning', status: 'Live', pill: live, meta: '3 labs · endpoints' },
      { mono: 'JS', name: 'SAP Joule Studio', status: 'Next', pill: soon, meta: 'Joule for devs & consultants' },
      { mono: 'BR', name: 'AWS Bedrock', status: 'Next', pill: soon, meta: 'AgentCore labs' },
      { mono: 'CL', name: 'Claude & OpenAI certification prep', status: 'Next', pill: soon, meta: 'Exam-style practice' },
    ],
  };
  const { platforms } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", minWidth: "1440px", height: "100vh", minHeight: "900px", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/" />
        <div style={{ flexGrow: "1", display: "flex", flexDirection: "column", minWidth: "0" }}>
          <header style={{ height: "64px", flexShrink: "0", display: "flex", alignItems: "center", gap: "16px", padding: "0 48px", borderBottom: "1px solid #1F1F24" }}>
            <label htmlFor="q" style={{ display: "flex", alignItems: "center", gap: "10px", width: "420px", height: "40px", padding: "0 14px", borderRadius: "12px", background: "#151518", border: "1px solid #24242A", color: "#8B8B94", fontSize: "14px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input id="q" placeholder="Search courses, labs, platforms…" style={{ flexGrow: "1", background: "transparent", border: "0", outline: "none", color: "#F4F4F5", fontFamily: "inherit", fontSize: "14px" }} />
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "12px", color: "#8B8B94" }}>
                ⌘K
              </span>
            </label>
            <div style={{ flexGrow: "1" }} />
            <div style={{ height: "36px", padding: "0 14px", display: "flex", alignItems: "center", gap: "8px", borderRadius: "10px", background: "#151518", border: "1px solid #24242A", fontSize: "13px", color: "#D4D4D8" }}>
              [YOUR ORG] · Azure AI Track
            </div>
            <button aria-label="Notifications" style={{ width: "40px", height: "40px", borderRadius: "12px", background: "transparent", border: "1px solid #24242A", color: "#D4D4D8", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
              </svg>
            </button>
            <div aria-label="Account" style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2E3A5C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "600" }}>
              PS
            </div>
          </header>
          <main style={{ flexGrow: "1", padding: "36px 48px", display: "flex", flexDirection: "column", gap: "24px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "13px", color: "#8B8B94", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Azure AI Engineer path · Week 2 of 6
                </div>
                <h1 style={{ margin: "8px 0 0", fontSize: "40px", fontWeight: "600", letterSpacing: "-0.025em" }}>
                  Good evening, Priya.
                </h1>
              </div>
              <div style={{ fontSize: "14px", color: "#A1A1AA" }}>
                Next due:{" "}
                <span style={{ color: "#F4F4F5" }}>
                  Build an agent lab · Fri
                </span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
              <section style={{ height: "300px", borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", display: "flex", overflow: "hidden" }}>
                <div style={{ flexGrow: "1", padding: "32px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#8FB0FF" }}>
                    CONTINUE LEARNING
                  </div>
                  <h2 style={{ margin: "0", fontSize: "30px", fontWeight: "600", letterSpacing: "-0.02em", lineHeight: "1.15" }}>
                    Build your first agent in Azure AI Foundry
                  </h2>
                  <div style={{ fontSize: "14px", color: "#A1A1AA" }}>
                    Lesson 4 of 12 · 8 min left · Audio English · Subtitles Español
                  </div>
                  <div style={{ height: "4px", borderRadius: "2px", background: "#26262C", marginTop: "4px" }}>
                    <div style={{ width: "38%", height: "4px", borderRadius: "2px", background: "#F4F4F5" }} />
                  </div>
                  <div style={{ flexGrow: "1" }} />
                  <div style={{ display: "flex", gap: "12px" }}>
                    <Link to="/learn" className="btn">
                      Resume lesson
                    </Link>
                    <Link to="/labs" className="btn ghost">
                      Start hands-on lab
                    </Link>
                  </div>
                </div>
                <Link to="/learn" aria-label="Play lesson preview" style={{ width: "360px", flexShrink: "0", background: "#0E1322", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", borderLeft: "1px solid #1F1F24", color: "#F4F4F5" }}>
                  <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="#F4F4F5">
                      <path d="M8 5l11 7-11 7z" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "13px", color: "#A1A1AA" }}>
                    04:12 / 12:30
                  </div>
                </Link>
              </section>
              <section style={{ height: "300px", boxSizing: "border-box", borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", padding: "28px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  Guided session readiness
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.6">
                    <rect x="3" y="6" width="13" height="12" rx="3" />
                    <path d="M16 10l5-3v10l-5-3" />
                  </svg>
                  <span style={{ flexGrow: "1" }}>
                    Camera · focus &amp; presence
                  </span>
                  <span style={{ color: "#30D158" }}>
                    Ready
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.6">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                  <span style={{ flexGrow: "1" }}>
                    Microphone &amp; voice guide
                  </span>
                  <span style={{ color: "#30D158" }}>
                    Ready
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.6">
                    <rect x="3" y="4" width="18" height="12" rx="2" />
                    <path d="M8 20h8M12 16v4" />
                  </svg>
                  <span style={{ flexGrow: "1" }}>
                    Desktop companion · screen share
                  </span>
                  <span style={{ color: "#FF9F0A" }}>
                    Not set up
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "#8B8B94", lineHeight: "1.5" }}>
                  Camera frames are processed on your device. No video is uploaded and we never infer emotions.
                </div>
                <div style={{ flexGrow: "1" }} />
                <Link to="/setup" className="btn ghost">
                  Run 2-minute setup
                </Link>
              </section>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "24px" }}>
              <div style={{ padding: "22px 24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24" }}>
                <div style={{ fontSize: "13px", color: "#A1A1AA" }}>
                  Mastery
                </div>
                <div style={{ fontSize: "34px", fontWeight: "600", letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                  82%
                </div>
              </div>
              <div style={{ padding: "22px 24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24" }}>
                <div style={{ fontSize: "13px", color: "#A1A1AA" }}>
                  Labs completed
                </div>
                <div style={{ fontSize: "34px", fontWeight: "600", letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                  3{" "}
                  <span style={{ fontSize: "20px", color: "#8B8B94" }}>
                    / 8
                  </span>
                </div>
              </div>
              <div style={{ padding: "22px 24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24" }}>
                <div style={{ fontSize: "13px", color: "#A1A1AA" }}>
                  Learning streak
                </div>
                <div style={{ fontSize: "34px", fontWeight: "600", letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                  6{" "}
                  <span style={{ fontSize: "20px", color: "#8B8B94" }}>
                    days
                  </span>
                </div>
              </div>
              <div style={{ padding: "22px 24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24" }}>
                <div style={{ fontSize: "13px", color: "#A1A1AA" }}>
                  Focus during sessions
                </div>
                <div style={{ fontSize: "34px", fontWeight: "600", letterSpacing: "-0.02em", marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                  91%
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "600", letterSpacing: "-0.01em" }}>
                AI platform library
              </h2>
              <Link to="/labs" style={{ fontSize: "14px" }}>
                View all labs
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "16px" }}>
              {platforms.map((p, pIndex) => (
                <Fragment key={pIndex}>
                  <Link to="/labs" className="card" style={{ padding: "18px", borderRadius: "18px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "12px", color: "#F4F4F5" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#1F2436", color: "#B9CEFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "700" }}>
                        {p.mono}
                      </div>
                      <span style={css(`font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 999px; ${p.pill}`)}>
                        {p.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: "600", lineHeight: "1.25" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                      {p.meta}
                    </div>
                  </Link>
                </Fragment>
              ))}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
