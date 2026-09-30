import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import { useMergeState } from '../lib/useMergeState';
import pageCss from './Admin.css?inline';

export default function Admin() {
  const [s, setState] = useMergeState({ tab: 'path', sel: 2 });
  const tabs = [['path', 'Learning path'], ['cohort', 'Cohort analytics'], ['env', 'Lab environments']].map(([id, n]) => ({
    n, on: s.tab === id ? 'true' : 'false', pick: () => setState({ tab: id }),
    s: s.tab === id ? 'background: #F4F4F5; color: #0B0B0D' : 'background: transparent; color: #A1A1AA',
  }));
  const N = [
    { i: 'VID', t: 'Videos · Agents in AI Foundry', m: '6 lessons · 5 audio + subtitle languages', f: [['Audio languages', 'EN · ES · HI · DE · JA'], ['Subtitles', 'Auto + human reviewed'], ['Required', 'Yes']] },
    { i: 'QZ', t: 'Post-video quizzes', m: 'Mastery 80% · AI-drafted, reviewed', f: [['Mastery threshold', '80%'], ['Attempts', 'Unlimited'], ['Blocks next lesson', 'Yes']] },
    { i: 'LAB', t: 'Hands-on · Build an HR policy agent', m: 'Azure AI Foundry · auto-graded', f: [['Platform', 'Azure AI Foundry'], ['Environment', 'Learnly-hosted pool'], ['Time limit', '2 h · auto teardown'], ['Budget per learner', '$15']] },
    { i: 'AVA', t: 'Guided session · voice + ghost cursor', m: 'Desktop only · optional', f: [['Voice', 'Ava · Encouraging'], ['Cloned team voice', 'Off (requires approval)'], ['Camera focus', 'Presence only'], ['Available on mobile', 'No']] },
    { i: 'ASM', t: 'Assessment · proctored', m: 'Camera presence · no emotion data', f: [['Proctoring', 'Presence + tab focus'], ['Flags', 'Human review only'], ['Alternative path', 'Enabled']] },
    { i: 'CRT', t: 'Verified skill badge', m: 'Awarded at 85% overall', f: [['Weighting', 'Quiz 40 · Lab 50 · Rubric 10'], ['Pass mark', '85%'], ['Issued as', 'PDF + verifiable link']] },
  ];
  const nodes = N.map((n, i) => ({
    i: n.i, t: n.t, m: n.m, line: i < N.length - 1, pick: () => setState({ sel: i }),
    border: s.sel === i ? 'border: 1px solid #3E6AE1' : 'border: 1px solid #26262C',
  }));
  const cur = N[s.sel];
  const funnel = ([['Assigned', 120], ['Started', 104], ['Quiz mastered', 88], ['Lab passed', 71], ['Verified skill', 52]] as const)
    .map(([n, v]) => ({ n, v, w: Math.round(v / 120 * 100) + '%' }));
  const ok = 'background: rgba(48,209,88,0.14); color: #5BE584';
  const warn = 'background: rgba(255,159,10,0.14); color: #FFB340';
  const off = 'background: #1F1F24; color: #A1A1AA';
  const envs = [
    { p: 'Azure AI Foundry', h: 'Learnly-hosted', r: '42 / 50', c: '$318 / $1,200', st: 'Healthy', s: ok },
    { p: 'Copilot Studio', h: 'Pooled tenants', r: '12 / 20', c: '$140 / $600', st: 'Healthy', s: ok },
    { p: 'Azure Machine Learning', h: 'Learnly-hosted', r: '18 / 25', c: '$402 / $500', st: '80% budget', s: warn },
    { p: 'SAP Joule Studio', h: 'Partner BTP', r: 'n/a', c: 'n/a', st: 'Not set up', s: off },
    { p: 'AWS Bedrock AgentCore', h: 'Sandbox accounts', r: 'n/a', c: 'n/a', st: 'Not set up', s: off },
  ];
  const vals = {
    tabs, nodes, funnel, envs,
    blocks: ['Video lesson', 'Quiz', 'Hands-on lab', 'Guided session', 'Interactive card', 'Assessment'],
    sel: { t: cur.t, fields: cur.f.map(([k, v]) => ({ k, v })) },
    isPath: s.tab === 'path', isCohort: s.tab === 'cohort', isEnv: s.tab === 'env',
  };
  const { blocks, isCohort, isEnv, isPath, sel } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/admin" />
        <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", padding: "32px 48px", display: "flex", flexDirection: "column", gap: "22px", minWidth: "0", overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#8B8B94", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                [YOUR ORG] · Admin
              </div>
              <h1 style={{ margin: "8px 0 0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.025em" }}>
                Azure AI Engineer path
              </h1>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <Link to="/" className="btn ghost">
                Preview as learner
              </Link>
              <button className="btn">
                Publish v3
              </button>
            </div>
          </div>
          <div role="tablist" style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "14px", background: "#151518", border: "1px solid #1F1F24", alignSelf: "flex-start" }}>
            {tabs.map((t, tIndex) => (
              <Fragment key={tIndex}>
                <button className="tb" role="tab" aria-selected={t.on === 'true'} onClick={t.pick} style={css(`height: 36px; padding: 0 16px; border-radius: 10px; border: 0; font-size: 14px; font-weight: 500; ${t.s}`)}>
                  {t.n}
                </button>
              </Fragment>
            ))}
          </div>
          {isPath && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", gap: "20px", flexGrow: "1" }}>
                <div style={{ padding: "18px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#8B8B94", marginBottom: "6px" }}>
                    BLOCKS · DRAG IN
                  </div>
                  {blocks.map((b, bIndex) => (
                    <Fragment key={bIndex}>
                      <div style={{ padding: "11px 12px", borderRadius: "12px", background: "#101014", border: "1px solid #24242A", fontSize: "14px" }}>
                        {b}
                      </div>
                    </Fragment>
                  ))}
                </div>
                <div style={{ borderRadius: "20px", background: "#101014", border: "1px solid #1F1F24", padding: "28px", display: "flex", flexDirection: "column", gap: "14px", overflow: "hidden" }}>
                  {nodes.map((n, nIndex) => (
                    <Fragment key={nIndex}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0" }}>
                        <button className="node" onClick={n.pick} style={css(`width: 100%; max-width: 420px; padding: 14px 16px; border-radius: 14px; background: #151518; display: flex; align-items: center; gap: 14px; ${n.border}`)}>
                          <span style={{ width: "34px", height: "34px", borderRadius: "10px", background: "#1F2436", color: "#B9CEFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>
                            {n.i}
                          </span>
                          <span style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "14px", fontWeight: "600" }}>
                              {n.t}
                            </span>
                            <span style={{ fontSize: "12px", color: "#8B8B94" }}>
                              {n.m}
                            </span>
                          </span>
                        </button>
                        {n.line && (
                          <>
                            <span style={{ width: "2px", height: "14px", background: "#33333B" }} />
                          </>
                        )}
                      </div>
                    </Fragment>
                  ))}
                </div>
                <div style={{ padding: "22px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#8B8B94" }}>
                    INSPECTOR
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "600" }}>
                    {sel.t}
                  </div>
                  {sel.fields.map((f, fIndex) => (
                    <Fragment key={fIndex}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontSize: "12px", color: "#A1A1AA" }}>
                          {f.k}
                        </div>
                        <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#101014", border: "1px solid #24242A", fontSize: "14px" }}>
                          {f.v}
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </>
          )}
          {isCohort && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", flexGrow: "1" }}>
                <div style={{ padding: "28px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontSize: "16px", fontWeight: "600" }}>
                      Cohort · Finance Ops wave 2
                    </div>
                    <div style={{ fontSize: "13px", color: "#8B8B94" }}>
                      Sample data
                    </div>
                  </div>
                  {funnel.map((f, fIndex) => (
                    <Fragment key={fIndex}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ width: "130px", fontSize: "14px", color: "#D4D4D8" }}>
                          {f.n}
                        </div>
                        <div style={{ flexGrow: "1", height: "28px", borderRadius: "8px", background: "#101014" }}>
                          <div style={css(`height: 28px; border-radius: 8px; background: #3E6AE1; width: ${f.w}`)} />
                        </div>
                        <div style={{ width: "44px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                          {f.v}
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ padding: "24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#FF9F0A" }}>
                      WHERE LEARNERS GET STUCK
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "600" }}>
                      Step 3 · Select model
                    </div>
                    <div style={{ fontSize: "14px", color: "#A1A1AA", lineHeight: "1.5" }}>
                      38% asked Ava for a hint here. Consider a 30-second clip before the lab.
                    </div>
                  </div>
                  <div style={{ padding: "24px", borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.08em", color: "#8B8B94" }}>
                      TOP QUESTIONS ASKED BY VOICE
                    </div>
                    <div style={{ fontSize: "14px", color: "#D4D4D8" }}>
                      “Which model should I choose?”
                    </div>
                    <div style={{ fontSize: "14px", color: "#D4D4D8" }}>
                      “Where do I upload the policy file?”
                    </div>
                    <div style={{ fontSize: "14px", color: "#D4D4D8" }}>
                      “Why is my agent answering off-topic?”
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {isEnv && (
            <>
              <div style={{ borderRadius: "20px", background: "#151518", border: "1px solid #1F1F24", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.4fr 1fr", padding: "14px 24px", fontSize: "12px", fontWeight: "600", letterSpacing: "0.06em", color: "#8B8B94", borderBottom: "1px solid #1F1F24" }}>
                  <span>
                    PLATFORM
                  </span>
                  <span>
                    HOSTING
                  </span>
                  <span>
                    READY / POOL
                  </span>
                  <span>
                    SPEND / BUDGET
                  </span>
                  <span>
                    STATUS
                  </span>
                </div>
                {envs.map((e, eIndex) => (
                  <Fragment key={eIndex}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.4fr 1fr", padding: "18px 24px", fontSize: "14px", borderBottom: "1px solid #1F1F24", alignItems: "center" }}>
                      <span style={{ fontWeight: "600" }}>
                        {e.p}
                      </span>
                      <span style={{ color: "#A1A1AA" }}>
                        {e.h}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {e.r}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: "#D4D4D8" }}>
                        {e.c}
                      </span>
                      <span style={css(`font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; justify-self: start; ${e.s}`)}>
                        {e.st}
                      </span>
                    </div>
                  </Fragment>
                ))}
                <div style={{ padding: "18px 24px" }}>
                  <button className="btn">
                    + New lab environment
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
