import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './Quiz.css?inline';

export default function Quiz() {
  const Q = [
    { text: 'In Azure AI Foundry, what defines how an agent behaves and responds?', opts: ['The resource group name', 'Its instructions', 'The deployment region', 'The pricing tier'], a: 1, why: 'Instructions work like the agent’s system prompt: they shape its tone and scope, and which tools it reaches for.', at: '03:40' },
    { text: 'Which component lets an agent act beyond generating text?', opts: ['Temperature', 'Tokens', 'Tools', 'Tags'], a: 2, why: 'Tools (search, code, APIs, MCP servers) let the agent take actions and fetch data.', at: '07:15' },
    { text: 'Before an agent can answer, what must exist in your project?', opts: ['A virtual machine', 'A DNS zone', 'An App Service plan', 'A model deployment'], a: 3, why: 'The agent calls a deployed model. Your lab environment pre-deploys one for you.', at: '09:02' },
  ];
  const [s, setState] = useMergeState({ i: 0, sel: null as number | null, answered: false, score: 0, finished: false });
  const q = Q[s.i];
  const keys = ['A', 'B', 'C', 'D'];
  const opts = q.opts.map((t, k) => {
    let style = 'background: #16161B; border: 1px solid #26262C;';
    let tag = ''; let tagStyle = '';
    if (!s.answered && s.sel === k) style = 'background: #182038; border: 1px solid #3E6AE1;';
    if (s.answered && k === q.a) { style = 'background: rgba(48,209,88,0.10); border: 1px solid #30D158;'; tag = 'Correct'; tagStyle = 'color: #5BE584'; }
    if (s.answered && s.sel === k && k !== q.a) { style = 'background: rgba(255,69,58,0.10); border: 1px solid #FF453A;'; tag = 'Your answer'; tagStyle = 'color: #FF8A80'; }
    return { key: keys[k], text: t, style, tag, tagStyle, pick: () => { if (!s.answered) setState({ sel: k }); } };
  });
  const pct = Math.round((s.score / 3) * 100);
  const C = 2 * Math.PI * 60;
  const vals = {
    q, opts, num: s.i + 1,
    inQuiz: !s.finished, finished: s.finished,
    answered: s.answered, canCheck: !s.answered,
    dots: [0, 1, 2].map((d) => ({ style: d < s.i || (d === s.i && s.answered) ? 'background: #F4F4F5' : d === s.i ? 'background: #3E6AE1' : 'background: #33333B' })),
    check: () => { if (s.sel === null) return; setState({ answered: true, score: s.score + (s.sel === q.a ? 1 : 0) }); },
    nextLabel: s.i < 2 ? 'Next question' : 'See results',
    next: () => { if (s.i < 2) setState({ i: s.i + 1, sel: null, answered: false }); else setState({ finished: true }); },
    retry: () => setState({ i: 0, sel: null, answered: false, score: 0, finished: false }),
    scoreText: pct + '%',
    ring: (C * pct / 100).toFixed(1) + ' ' + C.toFixed(1),
    verdict: pct >= 80 ? 'Mastered. Nicely done.' : 'Almost there. Review and retry.',
  };
  const { answered, canCheck, check, dots, finished, inQuiz, next, nextLabel, num, retry, ring, scoreText, verdict } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#0B0B0D" }}>
        <div style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", opacity: "0.18" }}>
          <div style={{ width: "1100px", height: "620px", borderRadius: "24px", background: "#0E1322" }} />
        </div>
        <div style={{ position: "absolute", top: "28px", left: "40px", right: "40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/learn" style={{ fontSize: "14px", color: "#A1A1AA" }}>
            ← Back to lesson
          </Link>
          <div style={{ fontSize: "13px", color: "#8B8B94" }}>
            Lesson 4 · Agent instructions &amp; tools
          </div>
        </div>
        <div style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="no-scrollbar" style={{ width: "720px", maxWidth: "92vw", maxHeight: "92vh", overflow: "auto", boxSizing: "border-box", padding: "40px", borderRadius: "28px", background: "rgba(28,28,33,0.92)", border: "1px solid #2E2E36", backdropFilter: "blur(24px)", display: "flex", flexDirection: "column", gap: "22px" }}>
            {inQuiz && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", color: "#8FB0FF" }}>
                      QUICK CHECK · QUESTION {num} OF 3
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {dots.map((d, dIndex) => (
                        <Fragment key={dIndex}>
                          <span style={css(`width: 28px; height: 4px; border-radius: 2px; ${d.style}`)} />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <h1 style={{ margin: "0", fontSize: "26px", fontWeight: "600", letterSpacing: "-0.015em", lineHeight: "1.3" }}>
                    {q.text}
                  </h1>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {opts.map((o, oIndex) => (
                      <Fragment key={oIndex}>
                        <button className="opt" onClick={o.pick} style={css(`min-height: 58px; padding: 0 18px; border-radius: 14px; display: flex; align-items: center; gap: 14px; font-size: 16px; color: #F4F4F5; ${o.style}`)}>
                          <span style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#26262C", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Geist Mono', monospace", fontSize: "13px", color: "#D4D4D8" }}>
                            {o.key}
                          </span>
                          <span style={{ flexGrow: "1" }}>
                            {o.text}
                          </span>
                          <span style={css(`font-size: 13px; font-weight: 600; ${o.tagStyle}`)}>
                            {o.tag}
                          </span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  {answered && (
                    <>
                      <div style={{ padding: "16px 18px", borderRadius: "14px", background: "#16161B", border: "1px solid #26262C", fontSize: "14px", lineHeight: "1.55", color: "#D4D4D8" }}>
                        {q.why}{" "}
                        <Link to="/learn">
                          Rewatch at {q.at}
                        </Link>
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                    {canCheck && (
                      <>
                        <button className="btn" onClick={check}>
                          Check answer
                        </button>
                      </>
                    )}
                    {answered && (
                      <>
                        <button className="btn" onClick={next}>
                          {nextLabel}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
            {finished && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px", textAlign: "center", padding: "8px 0" }}>
                  <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
                    <circle cx="70" cy="70" r="60" fill="none" stroke="#26262C" strokeWidth="10" />
                    <circle cx="70" cy="70" r="60" fill="none" stroke="#30D158" strokeWidth="10" strokeLinecap="round" strokeDasharray={ring} transform="rotate(-90 70 70)" />
                    <text x="70" y="80" textAnchor="middle" fontSize="30" fontWeight="600" fill="#F4F4F5" fontFamily="Geist, sans-serif">
                      {scoreText}
                    </text>
                  </svg>
                  <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                    {verdict}
                  </h1>
                  <div style={{ fontSize: "15px", color: "#A1A1AA", maxWidth: "460px", lineHeight: "1.5" }}>
                    The hands-on lab is unlocked. Build the agent for real, with Ava guiding you by voice.
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                    <button className="btn ghost" onClick={retry}>
                      Retry quiz
                    </button>
                    <Link to="/labs" className="btn">
                      Launch hands-on lab
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
