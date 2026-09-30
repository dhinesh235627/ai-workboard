import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { css } from '../lib/css';
import pageCss from './Results.css?inline';

export default function Results() {
  const vals = {
    parts: [
      { n: 'Quizzes', w: '40%', v: '88%' },
      { n: 'Hands-on lab', w: '50%', v: '100%' },
      { n: 'Evaluator rubric', w: '10%', v: '80%' },
    ],
  };
  const { parts } = vals;

  return (
    <>
      <style>{pageCss}</style>
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D", overflow: "hidden" }}>
        <Sidebar active="/results" />
        <main className="no-scrollbar" style={{ flexGrow: "1", minHeight: "0", padding: "36px 48px", display: "flex", flexDirection: "column", gap: "24px", overflow: "auto" }}>
          <div>
            <div style={{ fontSize: "13px", color: "#8B8B94", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Evaluation · Build an HR policy agent
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: "36px", fontWeight: "600", letterSpacing: "-0.025em" }}>
              You built it. Here's how you did.
            </h1>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: "24px", flexGrow: "1" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <section style={{ padding: "28px", borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", display: "flex", gap: "28px", alignItems: "center" }}>
                <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
                  <circle cx="80" cy="80" r="68" fill="none" stroke="#26262C" strokeWidth="12" />
                  <circle cx="80" cy="80" r="68" fill="none" stroke="#30D158" strokeWidth="12" strokeLinecap="round" strokeDasharray="397 427" transform="rotate(-90 80 80)" />
                  <text x="80" y="90" textAnchor="middle" fontSize="36" fontWeight="600" fill="#F4F4F5" fontFamily="Geist, sans-serif">
                    93
                  </text>
                </svg>
                <div style={{ flexGrow: "1", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {parts.map((p, pIndex) => (
                    <Fragment key={pIndex}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                          <span style={{ color: "#D4D4D8" }}>
                            {p.n}{" "}
                            <span style={{ color: "#8B8B94" }}>
                              · {p.w}
                            </span>
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                            {p.v}
                          </span>
                        </div>
                        <div style={{ height: "6px", borderRadius: "3px", background: "#26262C" }}>
                          <div style={css(`height: 6px; border-radius: 3px; background: #F4F4F5; width: ${p.v}`)} />
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </section>
              <section style={{ padding: "24px 28px", borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  Skills proven in a live environment
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ padding: "7px 12px", borderRadius: "999px", background: "rgba(48,209,88,0.12)", color: "#5BE584", fontSize: "13px" }}>
                    ✓ Create agent
                  </span>
                  <span style={{ padding: "7px 12px", borderRadius: "999px", background: "rgba(48,209,88,0.12)", color: "#5BE584", fontSize: "13px" }}>
                    ✓ Model selection
                  </span>
                  <span style={{ padding: "7px 12px", borderRadius: "999px", background: "rgba(48,209,88,0.12)", color: "#5BE584", fontSize: "13px" }}>
                    ✓ Instruction design
                  </span>
                  <span style={{ padding: "7px 12px", borderRadius: "999px", background: "rgba(48,209,88,0.12)", color: "#5BE584", fontSize: "13px" }}>
                    ✓ Knowledge grounding
                  </span>
                  <span style={{ padding: "7px 12px", borderRadius: "999px", background: "#1F1F24", color: "#D4D4D8", fontSize: "13px" }}>
                    Needed 1 hint · Select model
                  </span>
                </div>
              </section>
              <section style={{ padding: "24px 28px", borderRadius: "24px", background: "#151518", border: "1px solid #1F1F24", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "16px", fontWeight: "600" }}>
                  Session focus
                </div>
                <div style={{ display: "flex", gap: "32px", fontSize: "14px", color: "#A1A1AA" }}>
                  <div>
                    <div style={{ fontSize: "26px", fontWeight: "600", color: "#F4F4F5" }}>
                      94%
                    </div>
                    present on screen
                  </div>
                  <div>
                    <div style={{ fontSize: "26px", fontWeight: "600", color: "#F4F4F5" }}>
                      1
                    </div>
                    look-away moment
                  </div>
                  <div>
                    <div style={{ fontSize: "26px", fontWeight: "600", color: "#F4F4F5" }}>
                      0
                    </div>
                    flags to review
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "#8B8B94" }}>
                  Focus signals never lower your score automatically. Evaluators review any flags with you.
                </div>
              </section>
            </div>
            <section style={{ borderRadius: "24px", background: "#F5F2EA", color: "#1A1A1A", padding: "48px", display: "flex", flexDirection: "column", gap: "18px", position: "relative" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.2em", color: "#6B6559" }}>
                LEARNLY · VERIFIED SKILL
              </div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "56px", lineHeight: "1.02", letterSpacing: "-0.01em" }}>
                Azure AI Foundry
                <br />
                Agent Builder
              </div>
              <div style={{ fontSize: "15px", color: "#4A463E", lineHeight: "1.6", maxWidth: "440px" }}>
                Awarded to{" "}
                <span style={{ fontWeight: "600", color: "#1A1A1A" }}>
                  Priya Sharma
                </span>
                {" "}for building and testing a grounded agent in a live Azure environment.
              </div>
              <div style={{ flexGrow: "1" }} />
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div style={{ fontSize: "13px", color: "#6B6559", lineHeight: "1.7" }}>
                  Issued 26 Sep 2026
                  <br />
                  ID LRN-AF-4821-93
                  <br />
                  [YOUR ORG]
                </div>
                <div aria-label="Verification QR code" style={{ width: "96px", height: "96px", borderRadius: "8px", background: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5F2EA", fontSize: "11px" }}>
                  QR
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#6B6559" }}>
                Prepares you for the vendor exam. Not a vendor certification.
              </div>
            </section>
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <Link to="/guided" className="btn ghost">
              Retake lab
            </Link>
            <Link to="/results" className="btn ghost">
              Download PDF
            </Link>
            <Link to="/results" className="btn ghost">
              Add to LinkedIn
            </Link>
            <Link to="/" className="btn">
              Continue path
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
