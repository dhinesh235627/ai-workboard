import { Fragment, useEffect, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './Guided.css?inline';

export default function Guided() {
  const [s, setState] = useMergeState({
    step: 0, mx: null as number | null, my: null as number | null,
    listening: false, stuck: false, replay: false, pick: null as number | null,
  });
  const replayTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(replayTimer.current), []);
  const T = [
    { x: 302, y: 148, label: 'Click “New agent”', say: 'Let’s create your first agent. See my blue cursor? Click “New agent”.', hint: 'It’s the dark button just under the “Agents” heading, top left of the page.', t: 'Create a new agent' },
    { x: 850, y: 164, label: 'Name it here', say: 'Nice! Now give it a name. “HR policy helper” works well.', hint: 'Click the first box in the panel on the right, under “Agent name”.', t: 'Name the agent' },
    { x: 850, y: 248, label: 'Pick the model', say: 'Next, choose the model. I’ve already deployed one in your sandbox, so just select it.', hint: 'The “Model” box sits right under the name.', t: 'Select the deployed model' },
    { x: 850, y: 392, label: 'Paste instructions', say: 'Instructions are your agent’s playbook. Paste the starter text from your lab card.', hint: 'The big box under “Instructions”. One click fills it with the starter text.', t: 'Write instructions' },
    { x: 850, y: 722, label: 'Try it', say: 'Last one. Open it in the playground and ask it a question.', hint: 'The dark button at the bottom of the panel.', t: 'Test in playground' },
  ];
  const done = s.step >= 5;
  const cur = T[Math.min(s.step, 4)];
  const adv = (i: number) => () => { if (s.step === i) setState({ step: i + 1, stuck: false }); };
  let gx = cur.x - 6, gy = cur.y - 4;
  if (s.replay) { gx = s.mx === null ? 240 : s.mx; gy = s.my === null ? 520 : s.my; }
  const gTrans = s.replay ? 'transition: none;' : 'transition: left 0.9s cubic-bezier(0.22,1,0.36,1), top 0.9s cubic-bezier(0.22,1,0.36,1);';
  let trackState = 'waiting';
  if (s.mx !== null && s.my !== null) {
    const d = Math.hypot(s.mx - cur.x, s.my - cur.y);
    trackState = d < 60 ? 'on target ✓' : d < 260 ? 'getting close' : 'off track · follow blue';
  }
  const steps = T.map((x, i) => ({
    t: x.t, mark: i < s.step ? '✓' : '',
    text: i <= s.step ? 'color: #F4F4F5' : 'color: #8B8B94',
    dot: i < s.step ? 'background: #30D158; color: #0B0B0D' : i === s.step ? 'border: 2px solid #3E6AE1' : 'border: 2px solid #33333B',
  }));
  const speaking = !s.listening;
  const bars = Array.from({ length: 10 }, (_, i) => ({
    s: speaking ? 'background: #8FB0FF; animation: wave 0.9s ease-in-out infinite; animation-delay: -' + ((i * 173) % 900) / 1000 + 's' : 'background: #33333B; transform: scaleY(0.3)',
  }));
  const cardOpts = ['A bigger model', 'Its instructions and the knowledge file', 'The playground settings'];
  const card = cardOpts.map((t, i) => {
    let st = 'background: #101014; border: 1px solid #26262C';
    if (s.pick !== null && i === 1) st = 'background: rgba(48,209,88,0.10); border: 1px solid #30D158';
    else if (s.pick === i) st = 'background: rgba(255,69,58,0.10); border: 1px solid #FF453A';
    return { t, s: st, pick: () => setState({ pick: i }) };
  });
  const vals = {
    stepNum: Math.min(s.step + 1, 5),
    track: (e: MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect(); const k = 1040 / r.width;
      setState({ mx: Math.round((e.clientX - r.left) * k), my: Math.round((e.clientY - r.top) * k) });
    },
    ux: s.mx === null ? 0 : s.mx + 16, uy: s.my === null ? 0 : s.my + 18,
    uVis: s.mx === null ? 'display: none' : '',
    trackState,
    gx, gy, gTrans, gVis: done ? 'display: none' : '',
    target: cur.label,
    hit0: adv(0), hit1: adv(1), hit2: adv(2), hit3: adv(3), hit4: adv(4),
    formOpen: s.step >= 1,
    agentListText: done ? 'HR policy helper · Active' : 'No agents yet',
    nameVal: s.step >= 2 ? 'HR policy helper' : 'e.g. HR policy helper', nameStyle: s.step >= 2 ? 'color: #111827' : 'color: #9CA3AF',
    modelVal: s.step >= 3 ? 'claude-sonnet · deployed' : 'Select a model', modelStyle: s.step >= 3 ? 'color: #111827' : 'color: #9CA3AF',
    instrVal: s.step >= 4 ? 'You are an HR policy assistant for [YOUR ORG]. Answer only from the attached policy. If unsure, say so and point to HR.' : 'Describe how the agent should behave…',
    instrStyle: s.step >= 4 ? 'color: #111827' : 'color: #9CA3AF',
    caption: done ? 'You did it! Your agent is live. One quick question before we wrap up.' : cur.say,
    stuck: s.stuck && !done, stuckHint: cur.hint,
    toggleStuck: () => setState({ stuck: !s.stuck }),
    listening: s.listening, voiceState: s.listening ? 'Listening… you can interrupt anytime' : 'Speaking · Encouraging',
    micPressed: s.listening ? 'true' : 'false',
    micStyle: s.listening ? 'background: #3E6AE1; border-color: #3E6AE1' : '',
    toggleMic: () => setState({ listening: !s.listening }),
    replay: () => {
      setState({ replay: true });
      clearTimeout(replayTimer.current);
      replayTimer.current = window.setTimeout(() => setState({ replay: false }), 60);
    },
    bars, steps, notDone: !done, done, card, cardAnswered: s.pick !== null,
  };
  const { agentListText, caption, cardAnswered, formOpen, gVis, hit0, hit1, hit2, hit3, hit4, instrStyle, instrVal, listening, micPressed, micStyle, modelStyle, modelVal, nameStyle, nameVal, notDone, replay, stepNum, stuck, stuckHint, target, toggleMic, toggleStuck, track, uVis, ux, uy, voiceState } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", background: "#0B0B0D", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ height: "56px", flexShrink: "0", display: "flex", alignItems: "center", gap: "16px", padding: "0 20px", borderBottom: "1px solid #1F1F24" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "#F4F4F5", color: "#0B0B0D", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}>
            L
          </div>
          <div style={{ fontSize: "14px", fontWeight: "600" }}>
            Guided lab · Build an HR policy agent
          </div>
          <span style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "999px", background: "#1F2436", color: "#B9CEFF" }}>
            Azure AI Foundry
          </span>
          <div style={{ flexGrow: "1" }} />
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", padding: "6px 12px", borderRadius: "999px", background: "rgba(255,69,58,0.14)", color: "#FF8A80" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#FF453A", animation: "blink 1.4s infinite" }} />
            Sharing Display 1
          </span>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "13px", color: "#A1A1AA" }}>
            Step {stepNum}/5 · 12:48
          </span>
          <Link to="/results" className="btn" style={{ height: "36px", background: "#26262C" }}>
            End session
          </Link>
        </header>
        <div style={{ flexGrow: "1", display: "flex", gap: "20px", padding: "20px", minHeight: "0" }}>
          <div className="no-scrollbar" style={{ flexGrow: "1.6", minWidth: "0", overflow: "auto" }}>
          <div onMouseMove={track} style={{ position: "relative", width: "1040px", height: "784px", flexShrink: "0", borderRadius: "14px", outline: "2px solid #3E6AE1", outlineOffset: "2px", background: "#F6F7F9", overflow: "hidden", color: "#111827" }}>
            <div style={{ position: "absolute", left: "0", top: "0", right: "0", height: "48px", background: "#FFFFFF", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", fontSize: "14px" }}>
              <span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#1E293B" }} />
              <span style={{ fontWeight: "600" }}>
                AI Foundry
              </span>
              <span style={{ color: "#6B7280" }}>
                / project-lab-4821
              </span>
            </div>
            <div style={{ position: "absolute", left: "0", top: "48px", bottom: "0", width: "200px", background: "#FFFFFF", borderRight: "1px solid #E5E7EB", padding: "16px 10px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px", fontSize: "14px", color: "#374151" }}>
              <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
                Overview
              </div>
              <div style={{ padding: "9px 12px", borderRadius: "8px", background: "#EEF2FF", color: "#1E3A8A", fontWeight: "600" }}>
                Agents
              </div>
              <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
                Models + endpoints
              </div>
              <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
                Playgrounds
              </div>
              <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
                Knowledge
              </div>
              <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
                Evaluation
              </div>
            </div>
            <div style={{ position: "absolute", left: "232px", top: "72px", fontSize: "24px", fontWeight: "600" }}>
              Agents
            </div>
            <button className="pt" onClick={hit0} style={{ position: "absolute", left: "232px", top: "128px", width: "140px", height: "40px", borderRadius: "8px", border: "0", background: "#1E293B", color: "#FFFFFF", fontSize: "14px", fontWeight: "600" }}>
              + New agent
            </button>
            <div style={{ position: "absolute", left: "232px", top: "196px", width: "420px", height: "200px", borderRadius: "12px", border: "1px dashed #D1D5DB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#6B7280" }}>
              {agentListText}
            </div>
            {formOpen && (
              <>
                <div style={{ position: "absolute", left: "680px", top: "64px", width: "340px", height: "704px", borderRadius: "14px", background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 20px 40px rgba(15,23,42,0.08)" }}>
                  <div style={{ position: "absolute", left: "24px", top: "20px", fontSize: "18px", fontWeight: "600" }}>
                    Create agent
                  </div>
                  <div style={{ position: "absolute", left: "24px", top: "58px", fontSize: "13px", color: "#4B5563" }}>
                    Agent name
                  </div>
                  <button className="pt" onClick={hit1} style={css(`position: absolute; left: 24px; top: 80px; width: 292px; height: 40px; border-radius: 8px; border: 1px solid #D1D5DB; background: #FFFFFF; text-align: left; padding: 0 12px; font-size: 14px; ${nameStyle}`)}>
                    {nameVal}
                  </button>
                  <div style={{ position: "absolute", left: "24px", top: "142px", fontSize: "13px", color: "#4B5563" }}>
                    Model
                  </div>
                  <button className="pt" onClick={hit2} style={css(`position: absolute; left: 24px; top: 164px; width: 292px; height: 40px; border-radius: 8px; border: 1px solid #D1D5DB; background: #FFFFFF; text-align: left; padding: 0 12px; font-size: 14px; ${modelStyle}`)}>
                    {modelVal}
                  </button>
                  <div style={{ position: "absolute", left: "24px", top: "226px", fontSize: "13px", color: "#4B5563" }}>
                    Instructions
                  </div>
                  <button className="pt" onClick={hit3} style={css(`position: absolute; left: 24px; top: 248px; width: 292px; height: 160px; border-radius: 8px; border: 1px solid #D1D5DB; background: #FFFFFF; text-align: left; padding: 12px; font-size: 13px; line-height: 1.5; vertical-align: top; display: flex; align-items: flex-start; ${instrStyle}`)}>
                    {instrVal}
                  </button>
                  <div style={{ position: "absolute", left: "24px", top: "430px", fontSize: "13px", color: "#4B5563" }}>
                    Knowledge
                  </div>
                  <div style={{ position: "absolute", left: "24px", top: "452px", width: "292px", height: "40px", boxSizing: "border-box", borderRadius: "8px", background: "#F3F4F6", padding: "0 12px", display: "flex", alignItems: "center", fontSize: "13px", color: "#374151" }}>
                    hr-policy-2026.pdf
                  </div>
                  <button className="pt" onClick={hit4} style={{ position: "absolute", left: "24px", top: "636px", width: "292px", height: "44px", borderRadius: "8px", border: "0", background: "#1E293B", color: "#FFFFFF", fontSize: "14px", fontWeight: "600" }}>
                    Try in playground
                  </button>
                </div>
              </>
            )}
            <div style={css(`position: absolute; left: ${ux}px; top: ${uy}px; pointer-events: none; font-family: 'Geist Mono', monospace; font-size: 11px; padding: 3px 8px; border-radius: 6px; background: rgba(17,24,39,0.8); color: #FFFFFF; white-space: nowrap; ${uVis}`)}>
              You · {trackState}
            </div>
            <div style={css(`position: absolute; left: ${gx}px; top: ${gy}px; pointer-events: none; ${gTrans} ${gVis}`)}>
              <span style={{ position: "absolute", left: "-16px", top: "-16px", width: "36px", height: "36px", borderRadius: "50%", border: "2px solid #3E6AE1", animation: "pulse 1.4s ease-out infinite" }} />
              <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 2l16 8-7 2-3 7z" fill="#3E6AE1" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span style={{ position: "absolute", left: "28px", top: "22px", whiteSpace: "nowrap", padding: "5px 10px", borderRadius: "999px", background: "#3E6AE1", color: "#FFFFFF", fontSize: "12px", fontWeight: "600" }}>
                {target}
              </span>
            </div>
          </div>
          </div>
          <aside className="no-scrollbar" style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "14px", minWidth: "0", overflow: "auto" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px", borderRadius: "16px", background: "#151518", border: "1px solid #1F1F24" }}>
              <div style={{ width: "96px", height: "60px", borderRadius: "10px", background: "#0E1322", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="15" r="8" fill="#26324D" />
                  <path d="M6 40c2-10 8-14 14-14s12 4 14 14" fill="#26324D" />
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#30D158" }} />
                  Focus · on task
                </div>
                <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                  Looked away 1× · processed on device
                </div>
              </div>
            </div>
            <div style={{ padding: "20px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#3E6AE1", boxShadow: "0 0 0 6px rgba(62,106,225,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}>
                  A
                </div>
                <div style={{ flexGrow: "1" }}>
                  <div style={{ fontSize: "15px", fontWeight: "600" }}>
                    Ava
                  </div>
                  <div style={{ fontSize: "12px", color: "#A1A1AA" }}>
                    {voiceState}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "28px" }}>
                  {bars.map((b, bIndex) => (
                    <Fragment key={bIndex}>
                      <span style={css(`width: 3px; height: 28px; border-radius: 2px; transform-origin: center; ${b.s}`)} />
                    </Fragment>
                  ))}
                </div>
              </div>
              {listening && (
                <>
                  <div style={{ fontSize: "14px", color: "#A1A1AA", fontStyle: "italic" }}>
                    You: “Which model should I choose here?”
                  </div>
                </>
              )}
              <div style={{ fontSize: "17px", lineHeight: "1.5", color: "#F4F4F5" }}>
                {caption}
              </div>
              {stuck && (
                <>
                  <div style={{ fontSize: "14px", lineHeight: "1.5", padding: "12px 14px", borderRadius: "12px", background: "#1F2436", color: "#D6E2FF" }}>
                    {stuckHint}
                  </div>
                </>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                <button className="ctl" onClick={toggleMic} aria-pressed={micPressed === 'true'} style={css(micStyle)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                  Talk
                </button>
                <button className="ctl" onClick={replay}>
                  Show me
                </button>
                <button className="ctl" onClick={toggleStuck}>
                  I'm stuck
                </button>
                <button className="ctl" aria-label="Pause session">
                  Pause
                </button>
              </div>
            </div>
            {notDone && (
              <>
                <div style={{ padding: "18px 20px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#8B8B94" }}>
                    LAB STEPS · AUTO-CHECKED
                  </div>
                  {steps.map((st, stIndex) => (
                    <Fragment key={stIndex}>
                      <div style={css(`display: flex; align-items: center; gap: 10px; font-size: 14px; ${st.text}`)}>
                        <span style={css(`width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; box-sizing: border-box; ${st.dot}`)}>
                          {st.mark}
                        </span>
                        {st.t}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </>
            )}
            {done && (
              <>
                <div style={{ padding: "20px", borderRadius: "20px", background: "#151518", border: "1px solid #3E6AE1", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#8FB0FF" }}>
                    INTERACTIVE CARD · QUICK CHECK
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: "600", lineHeight: "1.4" }}>
                    What keeps your agent answering only about HR policy?
                  </div>
                  {card.map((o, oIndex) => (
                    <Fragment key={oIndex}>
                      <button className="opt" onClick={o.pick} style={css(`min-height: 44px; padding: 0 14px; border-radius: 12px; font-size: 14px; ${o.s}`)}>
                        {o.t}
                      </button>
                    </Fragment>
                  ))}
                  {cardAnswered && (
                    <>
                      <Link to="/results" className="btn">
                        Finish &amp; see my results
                      </Link>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
