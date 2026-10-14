# PLAN-REVIEW-LOG: labs-proctoring

| Setting | Value |
|---|---|
| Host | claude (Sonnet 5.5) |
| Plan reviewer | codex / gpt-6-astra / high |
| Builder | claude (host builds directly: the checkout has uncommitted user work, so a delegated build would fail the clean-checkout gate) |
| Final inspector | fresh codex session, gpt-6-astra |
| Max plan rounds | 5 |
| Max fix / inspection rounds | 2 / 2 |
| Scope | local only; no commit, no push, no QA/prod deploy, no Azure resource creation |
| Authorization | user: "use claudex loop to proceed all the thing fix" (plan + implement) |
| Inspection | on |
| Pre-build commit | a8ad47b |
| Plan SHA256 (round 1) | `015e22dbb6e5c5977b2c352561712a53a1219537eb4b938fab834ab69d28b010` |

## Plan review - round 1: REVISE, 7 findings, all accepted
Reviewer session artifacts: `(local run artifacts)`. Plan SHA256 reviewed: `015e22db...b010`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R1 | high | persistence starts only after POST returns; the POST waits for the whole account deployment and names are random, so reload/lost response/two tabs create another paid lab | **Accepted.** Client persists an `operationId` before the request; backend derives names deterministically and is resumable (get-before-create per step); Web Locks for same-browser tabs; cross-device stays a stated limitation (no login) |
| R2 | high | platform-tab click wipes lab state and polling; stale response can fill another platform | **Accepted.** Active lab separated from platform selection; one-lab-at-a-time guard; results applied only for the current opId |
| R3 | med | /status turns not-found into 500 and reads history that outlives teardown; transient error treated as failure with a Retry that re-provisions | **Accepted.** Explicit contract: 404 missing (incl. account gone), 503 retryable, 500 config; client keeps the lab on transient errors; Retry only after terminal failure |
| R4 | high | `func start` also runs labsTeardownTimer with real Azure credentials, violating "no Azure changes" | **Accepted.** No Functions host is started; pure libs + direct handler calls + fake ARM client + Azurite on its own ports; test files import no credential classes |
| R5 | med | gating the headline status and the booleans separately can disagree; head masks gaze so a status clock restarts while the gaze condition never stopped | **Accepted.** Per-condition hold clocks before priority; person-present/no-face fallback counts as head; non-evidence branches reset all clocks; panel shows held values |
| R6 | med | list-then-upload cap is not atomic | **Accepted.** Fixed slots 000-099 with conditional create (If-None-Match); 120-concurrent test must yield exactly 100 |
| R7 | med | uploads persist with no deletion mechanism while UI promises 30-day deletion | **Accepted, stronger than suggested.** App-level `proctorCleanup` timer enforces 30-day deletion (testable with injected clock); consent copy made accurate; no promise for an environment until deployed |

Plan SHA256 after revision: `f93baa169abac8c6b43bae4c70b884c1d10a363a4a329df408d47a1b4399afa0`

## Plan review - round 2: REVISE, 4 findings (R2,R4,R5,R6,R7 confirmed addressed), all accepted
Artifacts: `(local run artifacts)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R8 | high | storage-event fallback is not an atomic claim; if localStorage throws a reload loses the opId | **Accepted.** Weak fallback removed. Web Locks + a durable storage claim are required; otherwise paid provisioning is disabled (fail closed). Tests: no Web Locks, throwing storage, racing pages |
| R9 | med | get-before-create misses two concurrent first requests | **Accepted.** A conflict/active-deployment rejection re-reads and follows the winner; fake-client interleaving test added |
| R10 | high | NotFound deployment record treated as proof the lab is gone while its resources can still be running | **Accepted.** Record-missing checks the known resource first: exists -> 200 unverified (lab kept, no new lab); both gone -> 404; cannot determine -> 503. Tested for Foundry and storage-backed labs |
| R11 | med | gap rule measures detector calls, not fresh camera frames; frozen video would mature a flag | **Accepted.** Hold advances only on a changed frame id (requestVideoFrameCallback / playback-quality frame count / currentTime); stale > maxGapMs resets; frozen-frame test added |

Plan SHA256 after revision: `df6163e0229c7a601087379216966d9bcaf55f02d983ec931d78ac63cb1a335e`

## Plan review - round 3: REVISE, 1 finding (R8-R11 confirmed addressed), accepted
Artifacts: `(local run artifacts)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R12 | high | only the initial claim is locked; a delayed terminal result in another tab passes its tab-local opId check and erases a newer claim | **Accepted.** Every mutation of the shared record (claim, phase, expiry cleanup, terminal removal) runs under the same Web Lock as a compare-and-set on opId; storage events only refresh UI; two-page stale-result test added |

Plan SHA256 after revision: `a875051cc407a143256baa776799591b23c39eb6ad7c3e14999876f196da3011`

## Plan review - round 4: **APPROVED**
Artifacts: `(local run artifacts)` (result.json = approval). Approved plan SHA256: `a875051cc407a143256baa776799591b23c39eb6ad7c3e14999876f196da3011`. 4 rounds, 12 findings, all accepted and fixed in the plan.

## Build (host, Claude Sonnet 5.5)
Pre-build commit: `a8ad47b`. Local only.

### Build result (host, Claude Sonnet 5.5), before inspection
Bug reproduced first on the UNFIXED code (`test/repro.mjs`): reload -> "Provision my environment" back -> second POST = second paid lab. After the fix the same script reports BUG_REPRODUCED false.

Proof run (all local, nothing touches Azure; no Functions host started):
- `node --test frontend/src/lib/{sustain,proctor,labStore}.test.ts`: 26/26 pass
- `node --test backend/test/{proctor,provision}.test.js`: 26/26 pass (Azurite on port 12100 only, stopped afterwards)
- `labs.browser.mjs` (mocked API, 10 scenarios): PASS - reload, reload-while-POST-pending (same operationId), two racing tabs, platform switch, stale late result, 503 keeps lab, 404 clears, unverified keeps lab, expired cleared, no Web Locks and throwing storage both fail closed
- `snapshot.browser.mjs` (fake camera, mocked snapshot API): PASS - toggle OFF uploads nothing; ON uploads exactly one JPEG with valid ids; page shows "1 uploaded"
- `npm run build` (tsc -b && vite build): passes (existing chunk-size warning only)
- Mutation checks (broke the code, saw the test fail, restored byte-identical): atomic slot condition (cap tests fail), conflict handling (race test fails)

Deviations from the plan, stated plainly: `frontend/tsconfig.json` now excludes `*.test.ts` (Node's test runner imports with `.ts` extensions the app typecheck rejects); `teardown.js` exports `API_VERSION_BY_TYPE` (one word) so status can reuse it; `Setup.tsx` consent copy and the `Setup` toggle description were reworded to match what the code now does.
Not covered (declared manual gates): the 5 s rule with a real face/webcam; cross-device duplicate provisioning; Azure container/lifecycle/QA deploy; ghost cursor on the live portal.

### Inspection: NOT DONE
Fresh Codex inspection (base a8ad47b, gpt-6-astra) failed immediately: "Your workspace is out of credits" (artifacts `(local run artifacts)`). No provider was substituted and the build is **not independently inspected**. Re-run once credits are back:
`python ~/.claude/skills/claudex-loop/scripts/runner.py inspect --host claude --builder claude --repo <repo> --plan labs-proctoring/PLAN.md --base a8ad47b8e8cd65ad04e216fe32c01f16f06d3abd --model gpt-6-astra --effort high`

### Addendum after plan approval (scope grew at the user's request): ghost cursor on the Azure platform
User: "i want ghost cursor in azure platform". Microsoft Learn shows agents are built in the **Foundry portal (ai.azure.com)**, not portal.azure.com, so the extension was extended (approved plan item 4 only covered in-product instructions):
- `manifest.json` matches `portal.azure.com` and `ai.azure.com` only (still no permissions).
- `steps.js`: per-site steps (`host`), alternative wordings (`match` list), wording from Microsoft Learn (Build -> New agent -> Agent name -> Create -> Instructions; "Go to Foundry portal" on portal.azure.com). **Not verified against the live portal.**
- `content.js`: ignores steps for other sites, tries each alternative in order, text kind also covers role=tab/menuitem.
- Tests: Tier A adds alternatives and per-site cases (passes twice); Tier B (real unchanged extension in Chromium) adds B8 (the real steps.js driven through a Foundry-shaped page served at https://ai.azure.com/, ends in "done"), B9 (portal.azure.com shows only its own step), and B1b now expects exactly the two sites. Both PASS, loadVerified true.

## Inspection round 1 (fresh Claude Opus 5.5 agent, read-only, requested by the user) - REVISE, 10 findings, all accepted
Deviation, stated plainly: the loop requires the inspector to be the OPPOSITE provider; Codex was out of credits and the user asked for Opus, so the runner (which refuses same-provider inspection) was bypassed and a fresh Opus subagent inspected instead. It is a different model from the Sonnet 5.5 builder but the same provider, so it is less independent than Codex would be.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| OP-1 | med | a Failed deployment returns a generic 500; client keeps "Retry (same lab)" and the record has no expiry, so the learner is locked out for 3 h | **Accepted.** Failed/Canceled is terminal: provision returns 409 {state:"failed"}; client ends the operation and offers a new lab. A timeout (still Running) stays retryable. Tests: backend + browser scenario 11 |
| OP-2 | med | a second tab (and any open tab on a storage event) re-POSTs the same operationId; the browser test only asserted distinct ids, not POST count | **Accepted.** Owner tab + 2 s heartbeat in the shared record; other tabs wait and follow it, taking over only if the heartbeat is stale (6 s). Test now asserts exactly 1 POST |
| OP-3 | med | gap measured between detector iterations, so a slow device (>1.5 s per iteration) never matures a flag | **Accepted.** Two limits: stalled/frozen frames 1.5 s, suspended detector 4 s between iterations while frames still arrive. New tests incl. 2 s-per-iteration device. The fix also exposed and fixed a frozen-frame restart bug |
| OP-4 | med/low | a Ready lab is never re-checked, so it shows Ready/blocks other tabs after expiry | **Accepted.** Expiry timer once Ready; browser scenario 12 |
| OP-5 | med | label steps do a getComputedStyle walk on every element on every frame | **Accepted.** Cheap text pre-filter before any style work; refresh throttled to ~120 ms (reasoned, not measured on the live portal) |
| OP-6 | low | React StrictMode double effect sends a duplicate POST in dev | **Accepted.** One in-flight POST per operation per tab (a reload now sends 2 where it sent 3) |
| OP-7 | low | the race loser returns its own timestamps | **Accepted.** Timestamps are read back from the deployment that actually exists; racers now use different clocks in the test |
| OP-8 | low | snapshot endpoint buffers an unbounded body when Content-Length is absent | **Accepted.** Body read through a capped stream reader; unit-tested with an endless stream |
| OP-9 | low | "Create" can match "Create deployment" | **Accepted.** Per-step `exact: true`; all real steps use it; test added |
| OP-10 | low | a credential/config error with no HTTP status is reported as retryable 503 | **Accepted.** Only genuine transport errors are retryable; others are a plain 500 |

Proof after the fixes: frontend unit 29/29, backend 29/29, `labs.browser.mjs` (12 scenarios + 2 fail-closed) PASS, `snapshot.browser.mjs` PASS, ghost-cursor Tier A PASS x3 and Tier B PASS (loadVerified), `npm run build` passes.

## Inspection round 2 (fresh Opus agent) - REVISE, 5 new findings, all accepted and fixed; no third inspection (budget of 2 used)
RI-1 first-request deployment failures were still a retryable 500 -> now terminal (Failed state re-read after the SDK's status-less error; 400/403 rejections terminal; tests with a fake that fails on the FIRST request). RI-2 takeover was not atomic -> `takeOver` compare-and-set under the lock (two waiting tabs: exactly one wins; browser scenario 14 closes the owner tab and asserts exactly one more POST). RI-3 unmounted instance started an orphan poller -> mounted guard (scenario 15). RI-4 label-step style walk over every ancestor -> early exit once an element's text is longer than the wanted text. RI-5 REQUEST_SEND_ERROR added as transport. OP-10 client side: two consecutive 500s from /status stop the "Reconnecting" loop, keep the lab and say so (scenario 13).
**These last fixes are verified by tests only; no reviewer has seen them.**

## Live check on the real portal (read-only, user signed in by hand, user instruction: change nothing in Azure)
No clicks, typing or submits: pages were opened by address and read. Results:
- portal.azure.com home: extension active; step 0 shows its "can't find" bar (expected, the button is not on that page).
- Real Foundry project resource page: **"Go to Foundry portal" exists (twice: toolbar and "Get started" panel)**. The cursor reported "ambiguous" because of the duplicate -> **fixed** (identical text buttons: point at the first; duplicate form labels still refuse to guess). After the fix the cursor **points at it** on the real page.
- Real signed-in Foundry project (ai.azure.com/nextgen/...): the cursor points at **"Build"** (nav: Home, Discover, Build, Operate, Manage), screenshot confirmed the ring and label sit on the tab.
- Plain https://ai.azure.com/ is a public landing page ("Sign in", no Build): learners must arrive through the portal's own deep link.
- Build > Agents page: left nav Agents/Models/Services/Tools/..., and an "Assign me the Foundry User role" prompt; **"New agent" was NOT visible for this account**, so the New agent / Agent name / Create / Instructions wording is still **unverified** on the real UI.
- Not done: provisioning a real lab and clicking through /labs (it would create paid Azure resources; user said change nothing).
Cleanup: my test browser window closed, its saved sign-in profile and screenshots deleted.

## Guided start (PLAN-GUIDED-START.md): "Open portal only" = no cursor; "Start guided session" = Azure + cursor
Models: planner/builder Claude Sonnet 5.5. **Codex was out of credits** for the plan review, so a fresh **Opus** agent reviewed the plan and later inspected the code (same provider as the builder: less independent than Codex). Plan review round 1: REVISE, 11 findings (G1-G11), all accepted into REVISION 1 (no second plan round, for speed; the code inspection covers it).
Biggest finding (G1, high): with per-site step lists the portal tab's single step would have ended the whole session ~6 s after the first click and switched the Foundry tab off. Fixed by one GLOBAL step counter in storage that every tab follows; only the last global step ends the session. Also: scoped to the lab's account at step 0, sliding 2 h expiry enforced in running tabs, progress survives reloads, arm only for a Ready unexpired Foundry lab, plain `<a>` link instead of window.open, "install, then reload this page" copy.
Code inspection (Opus, read-only): REVISE, 1 medium + 5 low, all accepted and fixed: GI-1 step-0 scoping was not re-checked on in-place portal navigation (URL watcher added both ways); GI-2 a bare "on" without an account would show the cursor on every portal page (bridge now treats it as off; `armGuide` requires the account; core rejects an empty account); GI-3 copy promised guidance when the guide switch was off or the lab was a storage lab (copy now follows the real state); GI-4 stale "detected" (copy says reload if no cursor); GI-5 README rewritten; GI-6 more tests (in-place navigation, bare "on", two Foundry tabs, legacy string).
**No re-inspection after these last fixes (verified by tests only).**
Proof after the fixes: guide-core 7/7; frontend unit 34/34; backend 31/31; Tier A pass x2; **Tier B (real unchanged extension) 31/31 incl. unarmed = no cursor, arming without reload, portal tab not ending the session, full Foundry flow, reload resume, End guide, off from the app, in-place navigation, bare "on" ignored, two Foundry tabs**; **guided-e2e (real app + real extension) 11/11** (Open portal only = no cursor; Start guided session = cursor on at "Go to Foundry portal"; expired / storage lab / no extension fall back or disable); labs browser scenarios pass; `npm run build` passes. The snapshot test failed once on a timing blip and passed twice on rerun.
**Manual gates (not proven by automation):** the cursor on the learner's real Foundry UI for New agent, Agent name, Create, Model, Knowledge, Save, chat (only "Go to Foundry portal" and "Build" were seen live); whether "Go to Foundry portal" opens a new tab or navigates in place on the real portal; real Chrome with a real signed-in session; a real webcam; Web Store distribution is not done (Developer mode is required for unpacked installs).

## Cursor drift fix after the user's real QA screenshot (PLAN-GUIDE-RESYNC.md)
Evidence: on the live QA lab (Foundry Agents list) the cursor said "Can't find 'Model'" because "New agent v" is a **dropdown** and no step covered its menu ("Build an agent", per Microsoft Learn); the learner pressed Skip step and the steps drifted away from the screen. Done through /ecc (claudex-loop + e2e-testing + typescript-reviewer on Opus) with Sonnet 5.5 building and fresh Opus agents reviewing (Codex was out of credits; Opus and the builder are both Claude).
Plan review (Opus): REVISE, 9 findings. Accepted the two high ones: automatic skip-ahead made a wrong wording guess INVISIBLE (a renamed button looked like a missing one and a required step was skipped silently), and an always-present control could trigger a jump. Redesign: only a step marked `optional` (the "Build an agent" menu item) is skipped by itself, only after the 2 s wait, and only when every step in between is also optional; every other step gets **manual** "Jump to '<later>'" and "Go back to '<earlier>'" buttons (never automatic), results cached 1.5 s and re-checked when the cache expires.
Code inspection (Opus): REVISE: V1 an optional step could still jump over a required step 2 ahead (fixed: only direct/optional-only gaps), V2 stale cache could leave the learner stuck (fixed: re-check at expiry, cache cleared on navigation), V3 form-field button names showed the field's value (fixed: wording for non-text steps), V4 the screenshot case was untested (now B21 in the real-extension test), V5/V6/V7/V8 small (dead timeout expression removed, aria-live on the status text, comments cleaned, the cross-tab write race noted: same as clicks, few ms).
Proof: Tier A pass x2 (new cases: optional waits 2 s, a non-optional step is never skipped, Jump offered, nothing nearby = Skip only, look-ahead window of 3, optional never jumps over a required step); **Tier B (real extension) 33/33 including B21 = the user's screenshot** (steps skipped until "Model", "Go back to 'New agent'" offered and it works) and the full 10-step Foundry flow through the dropdown menu.
Not re-inspected after the V1-V6 fixes (inspection budget used); verified by tests only. **Still unverified live:** the dropdown's real menu item wording ("Build an agent" is from Microsoft Learn), Model / Knowledge / Save / chat on the real playground.
