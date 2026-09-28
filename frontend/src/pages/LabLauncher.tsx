import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './LabLauncher.css?inline';

export default function LabLauncher() {
  const P: Record<string, { name: string; status: string; time: string; lab: string; desc: string; steps: string[] }> = {
    foundry: { name: 'Azure AI Foundry', status: 'Live', time: '25 min', lab: 'Build an HR policy agent', desc: 'Create an agent, connect a model, write its instructions and test it in the playground inside a sandbox that is ready for you.', steps: ['Create a new agent', 'Name it and pick the deployed model', 'Write instructions from the starter card', 'Add the HR policy file as knowledge', 'Test it in the playground'] },
    copilot: { name: 'Copilot Studio', status: 'Live', time: '30 min', lab: 'Build an IT help-desk copilot', desc: 'Create an agent in a pooled lab tenant, add topics and knowledge, then publish it to a test channel.', steps: ['Create an agent', 'Add a knowledge source', 'Author a topic', 'Test in the canvas', 'Publish to a test channel'] },
    azureml: { name: 'Azure ML', status: 'Live', time: '35 min', lab: 'Deploy a model to an online endpoint', desc: 'Register a model, create a managed online endpoint and send a scoring request.', steps: ['Open the workspace', 'Register a model', 'Create an endpoint', 'Deploy', 'Send a test request'] },
    joule: { name: 'SAP Joule Studio', status: 'Next release', time: '30 min', lab: 'Build a Joule skill', desc: 'Joule Studio labs run in a partner SAP BTP subaccount.', steps: [] },
    bedrock: { name: 'AWS Bedrock', status: 'Next release', time: '30 min', lab: 'Build an agent with AgentCore', desc: 'AWS labs run in leased sandbox accounts.', steps: [] },
    claude: { name: 'Cert prep', status: 'Next release', time: '45 min', lab: 'Claude & OpenAI certification practice', desc: 'Exam-style tasks against model deployments that Learnly owns.', steps: [] },
  };
  const [s, setState] = useMergeState({ plat: 'foundry', stage: -1, guide: true });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const plat = P[s.plat];
  const isLive = plat.status === 'Live';
  const tabs = Object.keys(P).map((k) => ({
    name: P[k].name, status: P[k].status, on: s.plat === k ? 'true' : 'false',
    style: s.plat === k ? 'background: #182038; border: 1px solid #3E6AE1;' : 'background: #151518; border: 1px solid #1F1F24;',
    statusStyle: P[k].status === 'Live' ? 'color: #5BE584' : 'color: #8B8B94',
    pick: () => { clearInterval(timer.current); setState({ plat: k, stage: -1 }); },
  }));
  const labels = ['Creating resource group rg-lab-4821', 'Deploying ' + plat.name + ' project', 'Deploying model and knowledge', 'Applying guardrails & $15 budget'];
  const stages = labels.map((label, i) => {
    const done = s.stage > i || s.stage >= 4; const cur = s.stage === i;
    return {
      label, text: done || cur ? 'color: #F4F4F5' : 'color: #8B8B94',
      dot: done ? 'background: #30D158; border: 0' : cur ? 'border: 2px solid #3E6AE1; border-top-color: transparent; animation: spin 0.8s linear infinite' : 'border: 2px solid #33333B',
    };
  });
  const ready = s.stage >= 4;
  const vals = {
    tabs, p: { ...plat, steps: plat.steps.map((t, i) => ({ n: i + 1, t })) },
    live: isLive, comingSoon: !isLive, stages,
    idle: s.stage < 0, busy: s.stage >= 0 && !ready, ready,
    statusText: ready ? 'Ready · expires in 2h 00m' : s.stage >= 0 ? 'Provisioning… about 90 s' : 'Not started',
    statusColor: ready ? 'color: #5BE584' : 'color: #F4F4F5',
    subText: ready ? 'Signed in to your sandbox. It is deleted automatically when it expires.' : 'An isolated sandbox is created just for you',
    provision: () => {
      setState({ stage: 0 });
      clearInterval(timer.current);
      let n = 0;
      timer.current = window.setInterval(() => {
        n += 1;
        setState({ stage: n });
        if (n >= 4) clearInterval(timer.current);
      }, 900);
    },
    toggleGuide: () => setState({ guide: !s.guide }),
    guideOnAttr: s.guide ? 'true' : 'false',
    trackStyle: s.guide ? 'background: #3E6AE1' : 'background: #33333B',
    knobStyle: s.guide ? 'left: 21px' : 'left: 3px',
    startHref: s.guide ? '/setup' : '/guided',
  };
  const { busy, comingSoon, guideOnAttr, idle, knobStyle, live, p, provision, startHref, statusColor, statusText, subText, toggleGuide, trackStyle } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", minWidth: "1440px", height: "100vh", minHeight: "900px", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/labs" />
        <main style={{ flexGrow: "1", padding: "36px 48px", display: "flex", flexDirection: "column", gap: "24px", minWidth: "0" }}>
          <div>
            <div style={{ fontSize: "13px", color: "#8B8B94", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Hands-on labs
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: "36px", fontWeight: "600", letterSpacing: "-0.025em" }}>
              Learn it. Then build it for real.
            </h1>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "12px" }}>
            {tabs.map((t, tIndex) => (
              <Fragment key={tIndex}>
                <button className="tab" onClick={t.pick} aria-pressed={t.on === 'true'} style={css(`padding: 14px 16px; border-radius: 16px; display: flex; flex-direction: column; gap: 6px; color: #F4F4F5; ${t.style}`)}>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    {t.name}
                  </span>
                  <span style={css(`font-size: 12px; ${t.statusStyle}`)}>
                    {t.status}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "24px", flexGrow: "1", minHeight: "0" }}>
            <section style={{ borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", padding: "5px 10px", borderRadius: "999px", background: "#1F2436", color: "#B9CEFF" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: "12px", fontWeight: "600", padding: "5px 10px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8" }}>
                  {p.time}
                </span>
                <span style={{ fontSize: "12px", fontWeight: "600", padding: "5px 10px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8" }}>
                  Auto-graded
                </span>
              </div>
              <h2 style={{ margin: "0", fontSize: "30px", fontWeight: "600", letterSpacing: "-0.02em" }}>
                {p.lab}
              </h2>
              <p style={{ margin: "0", fontSize: "15px", color: "#A1A1AA", lineHeight: "1.55", maxWidth: "620px" }}>
                {p.desc}
              </p>
              <div style={{ fontSize: "13px", fontWeight: "600", letterSpacing: "0.08em", color: "#8B8B94", marginTop: "6px" }}>
                WHAT YOU WILL DO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {p.steps.map((st, stIndex) => (
                  <Fragment key={stIndex}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "15px" }}>
                      <span style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#1F1F24", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Geist Mono', monospace", fontSize: "12px", color: "#D4D4D8" }}>
                        {st.n}
                      </span>
                      {st.t}
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ flexGrow: "1" }} />
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "14px", background: "#101014", border: "1px solid #1F1F24", fontSize: "13px", color: "#A1A1AA" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.6">
                  <path d="M5 12l5 5 9-10" />
                </svg>
                Each step is checked against your live environment, so there are no screenshots to upload.
              </div>
            </section>
            <section style={{ borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", padding: "28px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ fontSize: "16px", fontWeight: "600" }}>
                Your lab environment
              </div>
              {comingSoon && (
                <>
                  <div style={{ flexGrow: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center", color: "#A1A1AA", fontSize: "14px", lineHeight: "1.5" }}>
                    <div style={{ fontSize: "20px", fontWeight: "600", color: "#F4F4F5" }}>
                      Coming in the next release
                    </div>
                    <div style={{ maxWidth: "300px" }}>
                      Your admin can request early access for this platform.
                    </div>
                    <button className="btn ghost">
                      Request access
                    </button>
                  </div>
                </>
              )}
              {live && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px", flexGrow: "1" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {stages.map((g, gIndex) => (
                        <Fragment key={gIndex}>
                          <div style={css(`display: flex; align-items: center; gap: 12px; font-size: 14px; ${g.text}`)}>
                            <span style={css(`width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; box-sizing: border-box; ${g.dot}`)} />
                            {g.label}
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{ padding: "16px", borderRadius: "14px", background: "#101014", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                        Status
                      </div>
                      <div style={css(`font-size: 18px; font-weight: 600; ${statusColor}`)}>
                        {statusText}
                      </div>
                      <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                        {subText}
                      </div>
                    </div>
                    <button onClick={toggleGuide} aria-pressed={guideOnAttr === 'true'} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "14px", background: "#101014", border: "1px solid #1F1F24", color: "#F4F4F5", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
                      <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600" }}>
                          Guide me with voice &amp; ghost cursor
                        </span>
                        <span style={{ fontSize: "12px", color: "#8B8B94" }}>
                          Ava watches your screen and points to the next click
                        </span>
                      </span>
                      <span style={css(`width: 44px; height: 26px; border-radius: 13px; position: relative; ${trackStyle}`)}>
                        <span style={css(`position: absolute; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #FFFFFF; ${knobStyle}`)} />
                      </span>
                    </button>
                    <div style={{ flexGrow: "1" }} />
                    {idle && (
                      <>
                        <button className="btn" onClick={provision} style={{ width: "100%" }}>
                          Provision my environment
                        </button>
                      </>
                    )}
                    {busy && (
                      <>
                        <button className="btn ghost" disabled={true} style={{ width: "100%" }}>
                          Provisioning…
                        </button>
                      </>
                    )}
                    {ready && (
                      <>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <Link to="/guided" className="btn ghost" style={{ flexGrow: "1" }}>
                            Open portal only
                          </Link>
                          <Link to={startHref} className="btn" style={{ flexGrow: "1" }}>
                            Start guided lab
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
