import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import { LAB_KEY, canTrack, claimLab, clearLab, isExpired, isLiveElsewhere, readRecord, takeOver, updateLab, type Env, type LabRecord } from '../lib/labStore';
import { getLearnerId } from '../lib/proctor';
import { browserEnv } from '../lib/browserEnv';
import { armGuide, extensionVersion } from '../lib/guide';
import pageCss from './LabLauncher.css?inline';

const LABS_API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071'}/api/labs`;

export default function LabLauncher() {
  const P: Record<string, { name: string; status: string; time: string; lab: string; desc: string; steps: string[] }> = {
    foundry: { name: 'Azure AI Foundry', status: 'Live', time: '25 min', lab: 'Build an HR policy agent', desc: 'Create an agent, connect a model, write its instructions and test it in the playground inside a sandbox that is ready for you.', steps: ['Create a new agent', 'Name it and pick the deployed model', 'Write instructions from the starter card', 'Add the HR policy file as knowledge', 'Test it in the playground'] },
    copilot: { name: 'Copilot Studio', status: 'Live', time: '30 min', lab: 'Build an IT help-desk copilot', desc: 'Create an agent in a pooled lab tenant, add topics and knowledge, then publish it to a test channel.', steps: ['Create an agent', 'Add a knowledge source', 'Author a topic', 'Test in the canvas', 'Publish to a test channel'] },
    azureml: { name: 'Azure ML', status: 'Live', time: '35 min', lab: 'Deploy a model to an online endpoint', desc: 'Register a model, create a managed online endpoint and send a scoring request.', steps: ['Open the workspace', 'Register a model', 'Create an endpoint', 'Deploy', 'Send a test request'] },
    joule: { name: 'SAP Joule Studio', status: 'Next release', time: '30 min', lab: 'Build a Joule skill', desc: 'Joule Studio labs run in a partner SAP BTP subaccount.', steps: [] },
    bedrock: { name: 'AWS Bedrock', status: 'Next release', time: '30 min', lab: 'Build an agent with AgentCore', desc: 'AWS labs run in leased sandbox accounts.', steps: [] },
    claude: { name: 'Cert prep', status: 'Next release', time: '45 min', lab: 'Claude & OpenAI certification practice', desc: 'Exam-style tasks against model deployments that Learnly owns.', steps: [] },
  };
  const EMPTY_LAB = {
    stage: -1, deploymentName: null as string | null, storageAccountName: null as string | null, accountName: null as string | null,
    projectName: null as string | null, portalUrl: null as string | null, expiresAt: null as string | null, error: null as string | null,
  };
  const [s, setState] = useMergeState({
    plat: 'foundry', guide: true, ...EMPTY_LAB,
    // Which platform the active lab belongs to, whether a live lab record exists, and the
    // transient / recoverable flags. Lab fields above are only shown on that platform's tab.
    labPlat: null as string | null, active: false, reconnecting: false, canResume: false, blocked: false, stuck: false,
  });
  const timer = useRef<number | undefined>(undefined);
  const opRef = useRef<string | null>(null); // the operation THIS tab is currently tracking
  const envRef = useRef<Env | null>(null);
  const getEnv = (): Env => (envRef.current ??= browserEnv());
  const tabRef = useRef<string>(''); // identifies this tab among others sharing the lab record
  if (!tabRef.current) tabRef.current = crypto.randomUUID();
  const inflightRef = useRef<string | null>(null); // the operation whose POST this tab has in flight
  const watchTimer = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true); // an unmounted instance must not start pollers nobody can clear

  function stopPolling() { clearTimeout(timer.current); clearTimeout(watchTimer.current); }

  // Terminal end of an operation (failed, gone, expired): drop the shared record only if this
  // operation still owns it, then show the message. Starting a new lab is allowed afterwards.
  async function endTerminal(opId: string, message: string) {
    stopPolling();
    await clearLab(getEnv(), opId);
    if (opRef.current !== opId) return; // a newer operation took over in this tab
    opRef.current = null;
    setState({ ...EMPTY_LAB, error: message, active: false, reconnecting: false, canResume: false });
  }

  function startPolling(rec: LabRecord) {
    stopPolling();
    let delay = 2000;
    const query = rec.accountName
      ? `accountName=${rec.accountName}&projectName=${rec.projectName}`
      : `storageAccountName=${rec.storageAccountName}`;
    let serverErrors = 0;
    const tick = async () => {
      if (!mountedRef.current || opRef.current !== rec.opId) return;
      if (rec.expiresAt && Date.now() >= Date.parse(rec.expiresAt)) {
        await endTerminal(rec.opId, 'Your lab has expired. You can start a new one.');
        return;
      }
      try {
        const res = await fetch(`${LABS_API_BASE}/status?deploymentName=${rec.deploymentName}&${query}`);
        if (opRef.current !== rec.opId) return;
        // 404 = the deployment record AND the lab resource are both gone: a confirmed end.
        if (res.status === 404) {
          await endTerminal(rec.opId, 'This lab no longer exists — it expired or was removed. You can start a new one.');
          return;
        }
        // 500 = the server could not even read the status (a config/credential problem, not a
        // network blip). A couple in a row means retrying will not help: stop, keep the lab, say so.
        if (res.status === 500 && ++serverErrors >= 2) {
          setState({ reconnecting: false, stuck: true });
          return;
        }
        if (!res.ok) throw new Error(`status request failed with status ${res.status}`); // 503 etc: retry, keep the lab
        serverErrors = 0;
        const data = await res.json();
        if (!mountedRef.current || opRef.current !== rec.opId) return;
        delay = 2000;
        if (data.stage < 0) {
          await endTerminal(rec.opId, 'Azure reported the deployment failed.');
          return;
        }
        // "unverified": the record is gone but the resource still runs; keep the lab, block a second one.
        const stage = data.state === 'unverified' ? 1 : data.stage;
        setState({ stage, portalUrl: data.portalUrl ?? null, reconnecting: false, stuck: false });
        if (stage >= 4) {
          await updateLab(getEnv(), rec.opId, { phase: 'ready', portalUrl: data.portalUrl ?? null });
          // Ready is not forever: wake up at expiry so the page, the saved record and the other
          // platform tabs stop claiming an active lab once the resources are gone.
          const ms = rec.expiresAt ? Math.min(2147483000, Math.max(1000, Date.parse(rec.expiresAt) - Date.now() + 500)) : 60000;
          timer.current = window.setTimeout(tick, ms);
          return;
        }
      } catch (err) {
        // Transient (network, throttling, 5xx): keep the saved lab and retry with backoff. Never
        // treated as a failure, and never offers a second provision.
        console.error('Failed to check lab status', err);
        if (opRef.current !== rec.opId) return;
        delay = Math.min(15000, delay * 2);
        setState({ reconnecting: true });
      }
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, 0);
  }

  // Sends (or re-sends) the provision request for an operation that is already claimed and
  // saved. The same operationId always maps to the same lab on the server, so re-sending after
  // a reload or a lost response can never create a second one.
  async function runProvision(opId: string, plat: string) {
    // One POST per operation per tab: React StrictMode's double effect (and any repeat adopt)
    // must not send it twice.
    if (inflightRef.current === opId) return;
    inflightRef.current = opId;
    const env = getEnv();
    setState({ labPlat: plat, active: true, stage: 0, error: null, canResume: false, reconnecting: false });
    // Tell the other tabs this one owns the request, and keep saying so while it is in flight.
    const beat = () => { void updateLab(env, opId, { ownerTab: tabRef.current, heartbeatAt: Date.now() }); };
    beat();
    const heartbeat = window.setInterval(beat, 2000);
    try {
      const res = await fetch(`${LABS_API_BASE}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId: getLearnerId(env.storage, () => crypto.randomUUID()), platform: plat, operationId: opId }),
      });
      if (opRef.current !== opId) return;
      if (res.status === 400) {
        await endTerminal(opId, 'The lab request was rejected.');
        return;
      }
      // 409 = Azure itself reports the deployment Failed/Canceled. Asking again can never help, so
      // end the operation (clearing the saved lab) and let the learner start a new one.
      if (res.status === 409) {
        await endTerminal(opId, 'Azure could not create your lab (the deployment failed). You can start a new one.');
        return;
      }
      if (!res.ok) throw new Error(`provision request failed with status ${res.status}`);
      const data = await res.json();
      const rec = await updateLab(env, opId, {
        phase: 'polling', deploymentName: data.deploymentName, storageAccountName: data.storageAccountName ?? null,
        accountName: data.accountName ?? null, projectName: data.projectName ?? null, expiresAt: data.expiresAt ?? null,
      });
      // null = the shared record now belongs to a different operation: this result is stale.
      // Unmounted (the learner navigated away mid-request): the record is saved above, so the next
      // /labs visit resumes it; do not start a poller that nothing will ever clear.
      if (!rec || opRef.current !== opId || !mountedRef.current) return;
      setState({
        deploymentName: rec.deploymentName ?? null, storageAccountName: rec.storageAccountName ?? null, accountName: rec.accountName ?? null,
        projectName: rec.projectName ?? null, expiresAt: rec.expiresAt ?? null, stage: 1,
      });
      startPolling(rec);
    } catch (err) {
      console.error('Failed to start provisioning', err);
      if (opRef.current !== opId) return;
      // The operation stays saved: "Retry" re-sends the SAME operation, it does not start a new lab.
      setState({ error: 'Could not reach the backend to start the lab. Your request is saved — try again.', canResume: true });
    } finally {
      clearInterval(heartbeat);
      if (inflightRef.current === opId) inflightRef.current = null;
    }
  }

  // Another tab owns the in-flight request: do not send a second one. Wait for it to finish and
  // follow the shared record; only if its heartbeat goes stale (that tab closed or died) take over.
  function watchRequesting(opId: string) {
    clearTimeout(watchTimer.current);
    const look = () => {
      if (opRef.current !== opId) return;
      const rec = readRecord(getEnv());
      if (!rec || rec.opId !== opId) return; // gone or replaced: the storage listener handles it
      if (rec.phase !== 'requesting') { adopt(rec); return; }
      if (!isLiveElsewhere(rec, tabRef.current, Date.now())) {
        // The owner went quiet. Take over atomically: of several waiting tabs only one wins.
        void takeOver(getEnv(), opId, tabRef.current).then((won) => {
          if (!mountedRef.current || opRef.current !== opId) return;
          if (won) void runProvision(opId, rec.plat);
          else watchTimer.current = window.setTimeout(look, 1000);
        });
        return;
      }
      watchTimer.current = window.setTimeout(look, 1000);
    };
    watchTimer.current = window.setTimeout(look, 1000);
  }

  // Show whatever lab the shared record says is active and carry on from where it was.
  function adopt(rec: LabRecord) {
    stopPolling();
    opRef.current = rec.opId;
    setState({
      plat: rec.plat, labPlat: rec.plat, active: true, reconnecting: false, canResume: false, error: null,
      stage: rec.phase === 'ready' ? 4 : rec.phase === 'polling' ? 1 : 0,
      deploymentName: rec.deploymentName ?? null, storageAccountName: rec.storageAccountName ?? null, accountName: rec.accountName ?? null,
      projectName: rec.projectName ?? null, portalUrl: rec.portalUrl ?? null, expiresAt: rec.expiresAt ?? null,
    });
    if (rec.phase === 'requesting') {
      if (inflightRef.current === rec.opId) return; // this tab's own request is already running
      // Never POST on the strength of a plain read: whoever resumes must win the atomic takeover.
      watchRequesting(rec.opId);
    } else startPolling(rec);
  }

  useEffect(() => {
    mountedRef.current = true;
    const env = getEnv();
    // Paid provisioning needs a durable, atomic claim (Web Locks + working storage). Without
    // both, fail closed instead of risking a second lab.
    if (!canTrack(env)) { setState({ blocked: true }); return; }
    let cancelled = false;
    void (async () => {
      const rec = readRecord(env);
      if (!rec) return;
      if (isExpired(rec, Date.now())) { await clearLab(env, rec.opId); return; }
      if (!cancelled) adopt(rec);
    })();
    // Other tabs: storage events only refresh this tab's view; correctness never depends on them.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAB_KEY) return;
      const rec = readRecord(env);
      if (rec && rec.opId !== opRef.current) adopt(rec);
      else if (!rec && opRef.current) { stopPolling(); opRef.current = null; setState({ ...EMPTY_LAB, active: false, labPlat: null, reconnecting: false, canResume: false }); }
    };
    window.addEventListener('storage', onStorage);
    return () => { cancelled = true; mountedRef.current = false; window.removeEventListener('storage', onStorage); stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plat = P[s.plat];
  const isLive = plat.status === 'Live';
  // Lab fields only apply on the platform tab that owns the lab; other tabs look idle.
  const own = s.labPlat === s.plat;
  const lab = own ? s : { ...s, ...EMPTY_LAB, reconnecting: false, canResume: false, stuck: false };
  const otherLabActive = s.active && !own;
  const tabs = Object.keys(P).map((k) => ({
    name: P[k].name, status: P[k].status, on: s.plat === k ? 'true' : 'false',
    style: s.plat === k ? 'background: #182038; border: 1px solid #3E6AE1;' : 'background: #151518; border: 1px solid #1F1F24;',
    statusStyle: P[k].status === 'Live' ? 'color: #5BE584' : 'color: #8B8B94',
    // Picking a platform only changes what is shown. It never clears or restarts an active lab.
    pick: () => setState({ plat: k }),
  }));
  const labels = ['Creating resource group rg-lab-4821', 'Deploying ' + plat.name + ' project', 'Deploying model and knowledge', 'Applying guardrails & $15 budget'];
  const stages = labels.map((label, i) => {
    const done = lab.stage > i || lab.stage >= 4; const cur = lab.stage === i;
    return {
      label, text: done || cur ? 'color: #F4F4F5' : 'color: #8B8B94',
      dot: done ? 'background: #30D158; border: 0' : cur ? 'border: 2px solid #3E6AE1; border-top-color: transparent; animation: spin 0.8s linear infinite' : 'border: 2px solid #33333B',
    };
  });
  const isFailed = !!lab.error;
  const isReady = lab.stage >= 4 && !isFailed;
  const isIdle = lab.stage < 0 && !isFailed;
  const isBusy = lab.stage >= 0 && !isReady && !isFailed;
  const expiresText = lab.expiresAt
    ? new Date(lab.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const vals = {
    tabs, p: { ...plat, steps: plat.steps.map((t, i) => ({ n: i + 1, t })) },
    live: isLive, comingSoon: !isLive, stages,
    idle: isIdle, busy: isBusy, ready: isReady, failed: isFailed, errorText: lab.error,
    blocked: s.blocked, otherLabActive, otherLabName: s.labPlat ? P[s.labPlat]?.name : '',
    statusText: isFailed ? 'Provisioning failed' : lab.stuck ? "Can't check your lab right now" : isReady ? `Ready · expires ${expiresText}` : isBusy ? (lab.reconnecting ? 'Reconnecting to Azure…' : 'Provisioning… calling real Azure') : 'Not started',
    statusColor: isFailed ? 'color: #FF6B6B' : isReady ? 'color: #5BE584' : 'color: #F4F4F5',
    subText: isFailed ? lab.error : lab.stuck ? 'The server returned an error while checking your lab. Your lab is kept and will still be removed automatically. Reload this page to try again.' : isReady ? 'This is a real Azure resource in rg-ai-workboard-labs. It is deleted automatically when it expires.' : lab.reconnecting ? 'Your lab is safe — retrying the connection. Please do not start another.' : 'An isolated sandbox is created just for you',
    portalUrl: lab.portalUrl,
    // A brand-new operation: claim it (atomically, under the lock) and persist it BEFORE sending anything.
    provision: async () => {
      if (s.blocked) return;
      const env = getEnv();
      const opId = crypto.randomUUID();
      const claim = await claimLab(env, opId, s.plat, tabRef.current);
      if (!claim.ok) {
        if (claim.reason === 'active') adopt(claim.record); // a live lab already exists: show it instead
        else setState({ blocked: true });
        return;
      }
      stopPolling();
      opRef.current = opId;
      setState({ ...EMPTY_LAB, labPlat: s.plat, active: true, reconnecting: false, canResume: false });
      await runProvision(opId, s.plat);
    },
    // Re-send the SAME saved operation (safe: the server resumes it).
    resume: async () => {
      const opId = opRef.current;
      if (!opId) return;
      // Another tab may have taken the request over meanwhile: only re-send if we win the takeover.
      if (await takeOver(getEnv(), opId, tabRef.current)) await runProvision(opId, s.labPlat ?? s.plat);
      else watchRequesting(opId);
    },
    canResume: lab.canResume,
    toggleGuide: () => setState({ guide: !s.guide }),
    guideOnAttr: s.guide ? 'true' : 'false',
    trackStyle: s.guide ? 'background: #3E6AE1' : 'background: #33333B',
    knobStyle: s.guide ? 'left: 21px' : 'left: 3px',
    startHref: s.guide ? '/setup' : '/guided',
  };
  const { blocked, busy, canResume, comingSoon, failed, guideOnAttr, idle, knobStyle, live, otherLabActive: otherActive, otherLabName, p, portalUrl, provision, ready, resume, startHref, statusColor, statusText, subText, toggleGuide, trackStyle } = vals;

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
                    {idle && blocked && (
                      <>
                        <div role="alert" style={{ fontSize: "12px", color: "#FF6B6B", lineHeight: "1.5" }}>
                          This browser can't safely keep track of your lab (it needs Web Locks and local storage), so provisioning is turned off to avoid creating a second paid lab. Please use a current Chrome or Edge.
                        </div>
                        <button className="btn ghost" disabled={true} style={{ width: "100%" }}>
                          Provision my environment
                        </button>
                      </>
                    )}
                    {idle && !blocked && otherActive && (
                      <>
                        <div style={{ fontSize: "12px", color: "#A1A1AA", lineHeight: "1.5" }}>
                          You already have an active lab on {otherLabName}. Open that tab to use it, or wait for it to expire.
                        </div>
                        <button className="btn ghost" disabled={true} style={{ width: "100%" }}>
                          Provision my environment
                        </button>
                      </>
                    )}
                    {idle && !blocked && !otherActive && (
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
                        <button className="btn" onClick={canResume ? resume : provision} style={{ width: "100%" }}>
                          {canResume ? 'Retry (same lab)' : 'Start a new lab'}
                        </button>
                      </>
                    )}
                    {ready && (
                      <>
                        <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#101014", border: "1px solid #1F1F24", fontSize: "12px", color: "#A1A1AA", lineHeight: "1.6" }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#F4F4F5", marginBottom: "6px" }}>
                            Guided cursor for the real Azure portal
                          </div>
                          {extensionVersion() ? (
                            <>
                              ✓ Ghost cursor extension detected.<br />
                              <b style={{ color: "#F4F4F5" }}>Open portal only</b> just opens Azure, with no cursor.{" "}
                              {s.guide && s.accountName && s.projectName ? (
                                <>
                                  <b style={{ color: "#F4F4F5" }}>Start guided lab</b> checks your camera and consent, then opens Azure and guides you click by click through creating the agent. If no cursor appears, reload this page and try again.
                                </>
                              ) : !s.guide ? (
                                <>The guide switch is off, so <b style={{ color: "#F4F4F5" }}>Start guided lab</b> opens the practice session instead. Turn it on to be guided in Azure.</>
                              ) : (
                                <>This type of lab has no guided Azure steps yet, so <b style={{ color: "#F4F4F5" }}>Start guided lab</b> opens the practice session.</>
                              )}
                            </>
                          ) : (
                            <>
                              To be guided in Azure, install the extension once, then reload this page:<br />
                              1. In Chrome open chrome://extensions and turn on Developer mode.<br />
                              2. Click Load unpacked and choose the ghost-cursor-extension folder.<br />
                              3. Reload this page. <b style={{ color: "#F4F4F5" }}>Open portal only</b> works without it.
                            </>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "10px" }}>
                          {portalUrl ? (
                            <a href={portalUrl} target="_blank" rel="noreferrer" className="btn ghost" style={{ flexGrow: "1" }} onClick={() => armGuide(false, '')}>
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
