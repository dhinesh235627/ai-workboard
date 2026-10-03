# Guided start: "Open portal only" opens Azure plainly; "Start guided session" opens it with the ghost cursor guiding the whole agent creation

Scope: `ghost-cursor-extension/` (Chrome MV3), `frontend/src/pages/{LabLauncher,Setup}.tsx`, `frontend/src/lib/`. **Local only**: no commit, no push, no deploy, no Azure change, nothing clicked or created in a real Azure account by the tests.
This extends the already-reviewed plan `labs-proctoring/PLAN.md` (item 4, ghost-cursor hand-off). Nothing there is relaxed.

## Goal (user's words, restated)

1. **Open portal only** just opens the Azure portal. No cursor, no guidance.
2. **Start guided lab** -> the existing Setup flow (camera & consent, microphone, screen, meet your guide, try the ghost cursor) -> its last button **Start guided session** opens the learner's real lab in the Azure portal **and** turns the ghost cursor on, which then guides creating the agent end to end (portal.azure.com "Go to Foundry portal" -> ai.azure.com Build, New agent, Agent name, Create, Model, Instructions, Knowledge, Save, chat).
3. Ordinary Azure browsing must never show the cursor. Today the extension is always on and shows a "Can't find..." bar on every portal page (observed on the user's real portal home).
4. The app can tell whether the extension is installed and says so.

## Facts (verified in the code / on the real portal)

- `content.js` currently starts on every `portal.azure.com` / `ai.azure.com` page load.
- `LabLauncher.tsx` ready state: `<a href={portalUrl} target=_blank>Open portal only</a>` and `<Link to={startHref}>Start guided lab</Link>` (`/setup` when the guide toggle is on).
- `Setup.tsx` last step ends with `<Link to="/guided">Start guided session</Link>`, the mock practice page.
- The lab's `portalUrl` is saved in the shared record `aiwb.lab.v1` (`labStore.ts`) once Ready.
- A web page cannot message an extension without a declared channel; content scripts on a page's origin can.

## Design

### A. Arming switch (extension)
- New content script `bridge.js`, `run_at: document_start`, **only** on our app origins: `http://localhost:5173/*`, `https://ai-workboard-qa.azurewebsites.net/*`, `https://ai-workboard.azurewebsites.net/*`.
  - Sets `document.documentElement.dataset.aiwbExt = <manifest version>` (installed-detection).
  - Listens for the DOM event `aiwb:guide` (`detail` string `"on"` / `"off"`) and writes `chrome.storage.local.aiwbGuide = { on:true, at:Date.now() }` or `{ on:false }`.
- Manifest gains `permissions: ["storage"]` and nothing else (still no host permissions beyond the content-script matches, no background, no `tabs`).
- `content.js` (Azure pages) now **does nothing** unless `aiwbGuide.on` is true and younger than **3 hours**:
  - at load it reads storage; it also listens to `chrome.storage.onChanged`, so an already-open Azure tab starts when the session starts and stops when it ends, without a reload;
  - `run()` returns a destroy function that removes the overlay, listeners, timers and observer (page left as found);
  - the session ends on: last step done (message shown 6 s, then off), the new **End guide** button, the app sending `off`, or the 3 h TTL.
  - Without `chrome.storage` (the Tier-A logic fixture) it behaves as before (always on) so the logic tests are unchanged.
- Existing safeguards stay: per-site steps, exact matching, **Skip step** button, overlay `pointer-events:none` except Skip and End guide.

### B. App side
- `frontend/src/lib/guide.ts`: `armGuide(on, dispatch?)` dispatches `aiwb:guide`; `extensionVersion(root?)` reads `data-aiwb-ext`. Pure with injectable dispatch/root so it runs under `node --test`.
- `frontend/src/lib/browserEnv.ts`: the `browserEnv()` currently private to `LabLauncher.tsx`, shared so `Setup` can read the saved lab.
- `LabLauncher.tsx` ready state: **Open portal only** calls `armGuide(false)` then opens the portal (unchanged anchor, new tab). The install panel is shown only when `extensionVersion()` is null; when detected it says "Ghost cursor ready: Start guided lab opens Azure and guides you". Copy explains the two buttons.
- `Setup.tsx` last step: **Start guided session**: when the saved lab has a `portalUrl` -> `armGuide(true)` then `window.open(portalUrl, "_blank", "noopener,noreferrer")`; if the extension is not detected a clear warning with install steps is shown and the button still opens the portal (the learner may install later; guidance starts when armed state is read). When there is no ready lab it keeps the previous behaviour (`/guided` mock) so there is no dead end.

### C. Latency answer (documentation only, no behaviour change)
The attention labels' timing is explained to the user from the code: debounce of 2-of-3 frames for immediate labels, the 5 s hold for head-turn / eyes-away / eyes-closed, calibration warm-up. Stated as an estimate: **not measured on the user's device**.

## Non-goals
No Chrome Web Store packaging (explained to the user instead); no change to the steps wording logic beyond what is already approved; no per-user identity; the bridge does not read anything from the page.

## Risks / assumptions
| # | Assumption | If wrong |
|---|---|---|
| 1 | The app is served from one of the three listed origins | Bridge does not run there; the page shows "extension not detected" and the install panel; add the origin to the manifest |
| 2 | `chrome.storage.local` is shared by all tabs of the profile | Guidance would not start in an already open tab; it starts on the next Azure page load instead |
| 3 | A DOM CustomEvent with a string `detail` crosses from the page to the content script | Covered by the real-extension test (Tier B) |
| 4 | Any script running on our origin could arm the cursor | Harmless: it only shows a pointer on Azure pages, reads nothing, and times out in 3 h |

## Verification (all local)
1. `node --test frontend/src/lib/guide.test.ts`: `armGuide(true/false)` dispatches `aiwb:guide` with `"on"/"off"`; `extensionVersion` returns null without the attribute and the version with it.
2. Tier A (`ghost-cursor-extension/test/verify.mjs`, via the browser-automation helper) still passes: logic unchanged.
3. Tier B (`test/verify-ext.mjs`, the real unchanged extension in Chromium): manifest has exactly the two content scripts, `permissions == ["storage"]`, no host_permissions/background; **without arming, a portal.azure.com page shows no overlay (this is "Open portal only")**; after the app origin sends `on` the **already-open** page shows the overlay without a reload; the bridge sets `data-aiwb-ext`; the real steps drive the Foundry-shaped flow; **End guide** removes the overlay and storage turns off so a new page shows none; `off` from the app also removes it; a stale (>3 h) flag is ignored.
4. Browser scenarios on `vite dev` with mocked API (`labs.browser.mjs`): with a Ready lab, **Open portal only** emits `off` and opens the portal URL; **Start guided lab -> /setup -> Continue x4 -> Start guided session** emits `on` and opens the saved `portalUrl` in a new tab; with no ready lab it falls back to `/guided`; the install panel shows when no `data-aiwb-ext`, and the "ready" line when present.
5. `npm run build` passes; existing unit and browser suites still pass.

**Manual gates (not claimable by automation):** the cursor on the learner's real Foundry UI for New agent / Agent name / Create / Model / Knowledge / Save / chat (wording from Microsoft Learn; only "Go to Foundry portal" and "Build" were seen live); the real Chrome with a real signed-in session; the 5 s attention timing with a real face.

---
# REVISION 1 (after plan review round 1: Opus agent, REVISE, 11 findings, all accepted)
Review note: Codex was out of credits, so a fresh Opus agent reviewed (same provider as the builder: less independent). For speed there is no second plan-review round; the code inspection after the build covers this revision.

**These sections replace the conflicting parts above.**

### A'. One session, one global step counter, shared by all tabs (fixes G1, G4, G3)
- `aiwbGuide = { on, at, step, account }` in `chrome.storage.local`. `step` is the **global** index into the whole step list (portal.azure.com first, then ai.azure.com).
- Every Azure tab runs the same list but **acts only on the current global step, and only if that step's `host` is its own**. When a step completes, the tab writes `step+1` (and refreshes `at`); `onChanged` makes every tab re-evaluate: the portal tab goes idle (overlay removed, **no storage write**), the Foundry tab starts at the new step.
- The session is turned off **only** when the last global step completes (message shown 6 s, then `on:false`), by **End guide**, by the app (`off`), or on expiry. A host's own list running out never ends the session.
- Because `step` lives in storage, a full page reload, a sign-in redirect or a navigation resumes at the current step, not step 0.
- **Sliding 2 h expiry**: `at` is refreshed on every step; each running tab schedules its own end at `at + 2 h` and re-schedules when `at` changes (the limit now applies to tabs that are already running).
- Pure logic in `guide-core.js` (`isLive`, `activeStep`, `advance`, `expiresInMs`) loaded before `content.js`; unit-tested in Node.

### A''. Scoped to the lab (fixes G2)
- The app sends the lab's `accountName` with `on`. While `step === 0` (nothing done yet) a portal page starts the cursor **only if its URL contains that account name**; a bookmarked portal home, or any other tab, stays inactive. Once `step >= 1` Foundry pages continue the session without URL scoping (a Foundry URL's shape is not guaranteed).
- "Never shows during ordinary browsing" is restated truthfully: never outside an active session, and within one only on the lab's own pages (step 0) / the Foundry portal (later steps).

### B'. App side (fixes G5, G6, G7, G9, G11)
- Contract: `window.dispatchEvent(new CustomEvent("aiwb:guide", { detail: JSON.stringify({ on, account }) }))`; the bridge parses it (an old `"on"/"off"` string still works). `armGuide(on, account, target = window)`; the unit test asserts the **target is window** and the payload.
- **Start guided session** arms **only if** the saved lab is `phase === "ready"`, not expired, a Foundry lab (`accountName` and `projectName`) with a `portalUrl`. It is rendered as `<a href={portalUrl} target="_blank" rel="noopener noreferrer" onClick={armGuide(true, account)}>` (a plain link: no popup blocker, no `window.open`).
- If the extension is **not detected**, the button is replaced by a warning: "Install the extension, reload this page, then press Start guided session" (the bridge only exists in pages loaded after install; an extension reload also needs a page reload). Nothing is armed and no claim of guidance is made.
- If there is no ready Foundry lab (none, expired, or a storage-backed placeholder lab) the button keeps its previous behaviour (`/guided` mock) with a one-line explanation.
- LabLauncher copy: "Open portal only" opens Azure, **no cursor**; the stale text that says the cursor starts there is replaced; the install panel appears only when the extension is not detected and says "reload this page" after installing.

### C'. Verification changes (fixes G7, G8)
1. `guide-core.test.mjs` (Node): `isLive` with injected clock (stale > 2 h ignored, sliding refresh), `activeStep` across hosts (portal step 0 only on a URL containing the account; step 1 only on ai.azure.com; unscoped later; finished state), `advance`, `expiresInMs`.
2. `guide.test.ts`: `armGuide` dispatches `aiwb:guide` **on the given target (window by default)** with the JSON payload; `extensionVersion` null/version.
3. Tier A unchanged apart from per-site tests: with global ordering a list whose first step belongs to another host shows nothing on this page.
4. Tier B (real extension, Chromium; every flow arms first through an app-origin page; portal/Foundry pages served locally by request interception so nothing leaves the machine): unarmed portal page shows **no overlay**; an already-open portal page whose URL contains the account starts **without reload** when armed; a portal page **without** the account stays idle after arming; clicking "Go to Foundry portal" turns the portal tab idle and **after more than 6 s** a Foundry page still shows Build (G1); the full Foundry flow ends in `done` and 6 s later the session is off everywhere; **reload mid-flow resumes at the same step**; **End guide** removes the overlay and a new Foundry page shows none; an `off` from the app removes it.
5. **Real-app end to end** (when `vite dev` is reachable): the real built app at `http://localhost:5173` with the real bridge: seeded Ready lab -> **Open portal only** sends `off` and the portal page shows nothing; **Start guided lab -> /setup -> Continue x4 -> Start guided session** opens the saved portal URL in a new tab (intercepted) and the overlay appears there; not-detected / expired / storage-lab cases fall back and arm nothing. If the dev server is not running this is reported NOT VERIFIED.
6. A stale-flag test cannot write the extension's storage from outside; staleness is proven in the unit test of the pure logic, and the real-extension tests prove the wiring.

### Honest limit
Whether "Go to Foundry portal" opens a new tab or navigates in place on the real portal is not verified; the design works either way (progress is in storage).
