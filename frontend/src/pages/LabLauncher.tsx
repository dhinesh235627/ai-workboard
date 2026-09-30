import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './LabLauncher.css?inline';

const LABS_API_BASE = 'http://localhost:7071/api/labs';

export default function LabLauncher() {
  const P: Record<string, { name: string; status: string; time: string; lab: string; desc: string; steps: string[] }> = {
    foundry: { name: 'Azure AI Foundry', status: 'Live', time: '25 min', lab: 'Build an HR policy agent', desc: 'Create an agent, connect a model, write its instructions and test it in the playground inside a sandbox that is ready for you.', steps: ['Create a new agent', 'Name it and pick the deployed model', 'Write instructions from the starter card', 'Add the HR policy file as knowledge', 'Test it in the playground'] },
    copilot: { name: 'Copilot Studio', status: 'Live', time: '30 min', lab: 'Build an IT help-desk copilot', desc: 'Create an agent in a pooled lab tenant, add topics and knowledge, then publish it to a test channel.', steps: ['Create an agent', 'Add a knowledge source', 'Author a topic', 'Test in the canvas', 'Publish to a test channel'] },
    azureml: { name: 'Azure ML', status: 'Live', time: '35 min', lab: 'Deploy a model to an online endpoint', desc: 'Register a model, create a managed online endpoint and send a scoring request.', steps: ['Open the workspace', 'Register a model', 'Create an endpoint', 'Deploy', 'Send a test request'] },
    joule: { name: 'SAP Joule Studio', status: 'Next release', time: '30 min', lab: 'Build a Joule skill', desc: 'Joule Studio labs run in a partner SAP BTP subaccount.', steps: [] },
    bedrock: { name: 'AWS Bedrock', status: 'Next release', time: '30 min', lab: 'Build an agent with AgentCore', desc: 'AWS labs run in leased sandbox accounts.', steps: [] },
    claude: { name: 'Cert prep', status: 'Next release', time: '45 min', lab: 'Claude & OpenAI certification practice', desc: 'Exam-style tasks against model deployments that Learnly owns.', steps: [] },
  };
  const [s, setState] = useMergeState({
    plat: 'foundry', stage: -1, guide: true,
    deploymentName: null as string | null, storageAccountName: null as string | null, accountName: null as string | null,
    portalUrl: null as string | null, expiresAt: null as string | null, error: null as string | null,
  });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const plat = P[s.plat];
  const isLive = plat.status === 'Live';
  const tabs = Object.keys(P).map((k) => ({
    name: P[k].name, status: P[k].status, on: s.plat === k ? 'true' : 'false',
    style: s.plat === k ? 'background: #182038; border: 1px solid #3E6AE1;' : 'background: #151518; border: 1px solid #1F1F24;',
    statusStyle: P[k].status === 'Live' ? 'color: #5BE584' : 'color: #8B8B94',
    pick: () => {
      clearInterval(timer.current);
      setState({ plat: k, stage: -1, deploymentName: null, storageAccountName: null, accountName: null, portalUrl: null, expiresAt: null, error: null });
    },
  }));
  const labels = ['Creating resource group rg-lab-4821', 'Deploying ' + plat.name + ' project', 'Deploying model and knowledge', 'Applying guardrails & $15 budget'];
  const stages = labels.map((label, i) => {
    const done = s.stage > i || s.stage >= 4; const cur = s.stage === i;
    return {
      label, text: done || cur ? 'color: #F4F4F5' : 'color: #8B8B94',
      dot: done ? 'background: #30D158; border: 0' : cur ? 'border: 2px solid #3E6AE1; border-top-color: transparent; animation: spin 0.8s linear infinite' : 'border: 2px solid #33333B',
    };
  });
  const isFailed = !!s.error;
  const isReady = s.stage >= 4 && !isFailed;
  const isIdle = s.stage < 0 && !isFailed;
  const isBusy = s.stage >= 0 && !isReady && !isFailed;
  const expiresText = s.expiresAt
    ? new Date(s.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const vals = {
    tabs, p: { ...plat, steps: plat.steps.map((t, i) => ({ n: i + 1, t })) },
    live: isLive, comingSoon: !isLive, stages,
    idle: isIdle, busy: isBusy, ready: isReady, failed: isFailed, errorText: s.error,
    statusText: isFailed ? 'Provisioning failed' : isReady ? `Ready · expires ${expiresText}` : isBusy ? 'Provisioning… calling real Azure' : 'Not started',
    statusColor: isFailed ? 'color: #FF6B6B' : isReady ? 'color: #5BE584' : 'color: #F4F4F5',
    subText: isFailed ? s.error : isReady ? 'This is a real Azure resource in rg-ai-workboard-labs. It is deleted automatically when it expires.' : 'An isolated sandbox is created just for you',
    portalUrl: s.portalUrl,
    provision: async () => {
      setState({ stage: 0, error: null, deploymentName: null, storageAccountName: null, accountName: null, portalUrl: null, expiresAt: null });
      clearInterval(timer.current);
      try {
        const res = await fetch(`${LABS_API_BASE}/provision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ learnerId: 'local-test', platform: s.plat }),
        });
        if (!res.ok) throw new Error(`provision request failed with status ${res.status}`);
        const data = await res.json();
        setState({ deploymentName: data.deploymentName, storageAccountName: data.storageAccountName, accountName: data.accountName, expiresAt: data.expiresAt, stage: 1 });
        const statusQuery = data.accountName
          ? `accountName=${data.accountName}&projectName=${data.projectName}`
          : `storageAccountName=${data.storageAccountName}`;
        timer.current = window.setInterval(async () => {
          try {
            const statusRes = await fetch(
              `${LABS_API_BASE}/status?deploymentName=${data.deploymentName}&${statusQuery}`
            );
            if (!statusRes.ok) throw new Error(`status request failed with status ${statusRes.status}`);
            const statusData = await statusRes.json();
            if (statusData.stage < 0) {
              setState({ error: 'Azure reported the deployment failed.' });
              clearInterval(timer.current);
              return;
            }
            setState({ stage: statusData.stage, portalUrl: statusData.portalUrl });
            if (statusData.stage >= 4) clearInterval(timer.current);
          } catch (err) {
            console.error('Failed to check lab status', err);
            setState({ error: 'Could not reach the backend to check status.' });
            clearInterval(timer.current);
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to start provisioning', err);
        setState({ error: 'Could not reach the backend — is it running on localhost:7071?' });
      }
    },
    toggleGuide: () => setState({ guide: !s.guide }),
    guideOnAttr: s.guide ? 'true' : 'false',
    trackStyle: s.guide ? 'background: #3E6AE1' : 'background: #33333B',
    knobStyle: s.guide ? 'left: 21px' : 'left: 3px',
    startHref: s.guide ? '/setup' : '/guided',
  };
  const { busy, comingSoon, failed, guideOnAttr, idle, knobStyle, live, p, portalUrl, provision, ready, startHref, statusColor, statusText, subText, toggleGuide, trackStyle } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/labs" />
        <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", padding: "36px 48px", display: "flex", flexDirection: "column", gap: "24px", minWidth: "0", overflow: "auto" }}>
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
                    {failed && (
                      <>
                        <button className="btn" onClick={provision} style={{ width: "100%" }}>
                          Retry
                        </button>
                      </>
                    )}
                    {ready && (
                      <>
                        <div style={{ display: "flex", gap: "10px" }}>
                          {portalUrl ? (
                            <a href={portalUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ flexGrow: "1" }}>
                              Open portal only
                            </a>
                          ) : (
                            <Link to="/guided" className="btn ghost" style={{ flexGrow: "1" }}>
                              Open portal only
                            </Link>
                          )}
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
