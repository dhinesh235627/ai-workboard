# Ghost cursor: fix the "New agent" dropdown and make the guide recover when the learner and the cursor drift apart

Extends `PLAN-GUIDED-START.md` (REVISION 1). Scope: `ghost-cursor-extension/` only (steps.js, content.js, content.css, tests). Local first; the QA redeploy is a separate, already-approved step. The video attention 5-second files (`useAttentionDetection.ts`, `sustain.*`) are **not** part of any push.

## What went wrong (evidence: the user's real QA screenshot)
Real Foundry lab project, **Agents** list page ("Create your first agent"). The page shows **"New agent v", a dropdown button**. The cursor status bar says **"Can't find 'Model' on this page"** with **Skip step**: the cursor was on step 6 while the learner was still on the Agents list.
Cause: `steps.js` has no step for the dropdown's menu. Microsoft Learn: *"select the arrow next to New agent, then select Build an agent"*, which opens the "Create an agent" dialog. After "New agent" the next step ("Agent name") has no target (a menu is open, not the dialog), the learner pressed **Skip step**, and each skip moved the cursor further from the screen the learner was on.

## Changes
1. **steps.js (wording from Microsoft Learn):**
   - "New agent" keeps its live-confirmed wording, with `Build an agent` removed from its alternatives (it is the menu item, not the button).
   - NEW step after it: choose **Build an agent** from the menu (`exact`, alternatives `Build an agent`, `Prompt agent`, `Prompt`).
   - Save: Learn says "Select **Save** in the upper right corner" (kept). Chat: "use the chat pane on the right of the Playground tab"; placeholder alternatives gain `Send a message`.
2. **Resync (content.js)**, only evaluated when the current step has timed out (2 s, rare, cheap):
   - **Auto skip ahead:** if the control of one of the next 3 steps of this site is on screen, jump to it (covers optional steps, such as a menu step when the dialog is already open, and renamed intermediates). Uses the shared global step counter, so every tab follows.
   - **Offer "Go back":** if the control of one of the previous 5 steps is on screen, show `Go back to '<that step>'` in the status bar (user-triggered). **Never** jump backwards automatically: that could ping-pong with the skip-ahead rule.
   - The existing Skip step and End guide buttons stay.
3. `content.css`: the Go back button looks like Skip (the only other clickable parts of the overlay besides End guide; the overlay root stays `pointer-events:none`).

## Why auto-skip-ahead cannot loop
Skip-ahead only moves forward and only fires from a timed-out step whose own control is absent while a later control is present; the new current step's control is then present, so it points instead of timing out. Go back is manual, and after going back the earlier control is present, so it points and does not time out.

## Non-goals
No change to the arming/bridge/storage logic, the app pages, or the backend. No attempt to read the portal for anything but control text.

## Verification (all local)
1. Tier A (logic, `verify.mjs` + fixture): `?skipahead`: first step's control never exists, the next one does -> the cursor lands on the next one by itself (global step 1, ring within 8 px). `?goback`: after step 0 is clicked, step 1 cannot be found while step 0's control is on screen -> "Go back to ..." is offered; clicking it returns to step 0 pointing at it; waiting 2.5 s afterwards it stays on step 0 (no ping-pong). Existing Tier A cases still pass.
2. Tier B (real unchanged extension, Chromium): the Foundry-shaped fixture now has the New agent **dropdown** with "Build an agent"; the whole real flow (Build, New agent, **Build an agent**, Agent name, Create, Model, Instructions, Knowledge, Save, chat) must complete in `done`. Existing arming / navigation / End guide / two-tab checks pass.
3. guide-core unit tests unchanged and passing; `npm run build` passes; frontend/backend unit suites pass.
4. Reproduce the user's screenshot state as a test: on the fixture's Agents-list screen with the session at the "Model" step, the cursor must offer "Go back to 'New agent'" (this is the exact situation in the screenshot).

## Manual gates (honest)
The exact wording of the dropdown's items on the live portal ("Build an agent" is from Learn, not seen live), and Model / Knowledge / Save / chat on the real playground, remain unverified until a person (or a read-only live check) sees them. The new Skip-ahead / Go back make a wrong guess recoverable instead of a dead end.
