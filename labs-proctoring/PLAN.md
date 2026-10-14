# /labs: 5-second attention rule, tab-switch snapshots to Blob, provision-state fix, ghost-cursor hand-off

Scope: `frontend/` (React/Vite, `/labs`, `/setup`, `/learn`) and `backend/` (Azure Functions v4, Node).
**Local only.** No commit, no push, no deploy to QA or prod, no Azure resource created or changed. Azurite (own ports, own temp folder) stands in for Blob Storage. **No Functions host is started for verification** (see "Verification safety").

## Goal

1. **5-second rule.** In the camera attention detector, `looking-away` (head turned), `gaze-away` (eyes away) and `eyes-closed` count only after that *condition* has held **continuously for 5 s**. All other labels (`engaged`, `calibrating`, `no-face`, `multiple-faces`, `object-detected`, `error`) behave exactly as today.
2. **Tab-switch snapshot to Blob.** A learner who opted in to "Snapshot on flag (proctored assessments only)" and switches away from the tab has the current camera frame uploaded to Blob Storage under a per-learner path, with the promised 30-day deletion actually enforced by code.
3. **Provision bug.** After "Provision environment", switching tabs / reloading shows "Provision environment" again and a second click creates a second **paid** lab. Fix so a lab cannot be duplicated by reload, lost response, platform-tab clicks, a second tab, or a transient status error.
4. **Ghost cursor hand-off.** `/labs` tells the learner how to enable the guided cursor on the real Azure portal (the existing Chrome extension in `ghost-cursor-extension/`).

## Facts from the code (verified)

- `useAttentionDetection.ts`: `commitStatus` (l.259) = 2-of-3 frames; `commitBoolean` (l.281) the same for `headAway/gazeAway/eyesClosed`. Displayed status priority (l.440-447): object > head > eyes-closed > gaze > engaged. No-face branch (l.367): no face but a `person` from coco-ssd => status `looking-away` (extreme head turn); no face and no person => `no-face`; >1 face => `multiple-faces`. `resetTracking()` runs on both of those branches and during calibration. No seconds-based hold exists.
- `Setup.tsx:55-78` captures one frame on `visibilitychange` into memory only; text says "not uploaded". `Setup.tsx:103` promises "Encrypted and deleted after 30 days".
- `LabLauncher.tsx`: lab state is React-only (l.20-22). Every platform-tab click resets it (l.32-35). `provision()` (l.60-100) POSTs `learnerId: 'local-test'` and **awaits** the whole account deployment server-side before returning identifiers. A transient `/status` failure sets `error`, and the failed-state Retry button calls `provision` again (l.249-252).
- `labsProvision.js`: every call mints new random names (`randomSuffix`) and waits for the Foundry account (`beginCreateOrUpdateAndWait`) before returning. `labsStatus.js:81-83` turns every ARM failure, including "not found", into HTTP 500, and reads **deployment history**, which survives after teardown deletes the resources.
- `labsTeardownTimer` (15 min) is registered in the same host and uses real Azure credentials.
- Backend has no Blob code and no `@azure/storage-blob` dependency.

## Design

### 1. Sustain gate, per **condition** (`frontend/src/lib/sustain.ts`, pure)

Gating the headline status is wrong because head-away masks gaze-away (a 10 s gaze-away interrupted by a 1 s head turn would restart a status clock while the gaze condition never stopped). So the gate tracks each underlying condition's own continuous duration **before** priority selection.

`createHoldTracker({ holdMs = 5000, maxGapMs = 1500 })` -> `update(now, frameId, { head, eyesClosed, gaze }) -> { head, eyesClosed, gaze }` (each `true` only after that condition has been continuously true for `holdMs`).

- Inputs are the already-debounced raw conditions (2-of-3 smoothing unchanged). `head` is true when `hasDrifted(yaw)` **or** when the no-face branch has a `person` present (extreme turn). Each of the three has its own start time.
- A condition going false clears only its own clock.
- **Branches that are not continuous evidence reset all three clocks:** calibrating, no person at all (`no-face`), `multiple-faces`, `object-detected`-only frames do not extend a clock, camera stop/start, calibration restart.
- **Fresh frames only (the detector loop re-runs on the same frame):** `runDetectionInner` (l.304-319) re-detects whenever `readyState >= 2` and never checks that a *new* camera frame arrived, so a stalled camera would keep feeding the same head-away frame. The hook therefore passes a `frameId` that changes only when the video presents a new frame: `requestVideoFrameCallback` `metadata.presentedFrames` when available, else `getVideoPlaybackQuality().totalVideoFrames`, else `currentTime`. The tracker advances a clock **only when `frameId` changed since the previous update**; a repeat of the same `frameId` returns the previous held values without extending any clock.
- **Gap rule:** if no *fresh* frame has arrived for more than `maxGapMs` (loop paused, tab throttled, camera stall, frozen video) every clock resets. A frozen head-away frame therefore can never mature into a 5 s flag.
- Time is injected; the hook passes `performance.now()`. No sleeping in tests.
- **Priority is applied after the hold:** `object-detected` (immediate, unchanged) > held head > held eyes-closed > held gaze > `engaged`. Non-gated statuses (`no-face`, `multiple-faces`, `object-detected`, `calibrating`, `error`, `engaged`) are returned immediately and unchanged.
- `faceSignals.headAway/gazeAway/eyesClosed` expose the **held** values, so the headline and the Setup panel always agree.
- Before a condition has been held 5 s the displayed status is `engaged`.

### 2. Snapshot upload with enforced retention

Backend `POST /api/proctor/snapshot` (`backend/src/functions/proctorSnapshot.js`) is a thin wrapper over `backend/src/lib/proctor.js` (`validateSnapshot`, `saveSnapshot(container, ...)`). It imports **nothing** from `@azure/identity` or `@azure/arm-*`.

- Body: `{ learnerId, sessionId, capturedAt, reason, image }`, `image` a `data:image/jpeg;base64,...` URL.
- Validation: ids match `^[A-Za-z0-9-]{8,64}$`; `reason` in `{"tab-switch"}`; decoded image <= 1.5 MB with JPEG magic `FF D8 FF`; `capturedAt` must be a valid ISO time within +/-1 day of server time else the server time is stored.
- **Atomic per-session cap (fixed slots):** the blob name is `proctor-snapshots/<learnerId>/<sessionId>/NNN.jpg` for `NNN` in `000..099`. The upload for a slot uses a conditional create (`If-None-Match: *`); a 412 means the slot is taken and the next slot is tried; if all 100 are taken respond 429. Concurrent requests therefore can never exceed 100 blobs. Metadata: `reason`, `capturedAt`, `uploadedAt`.
- Container created if absent, **private**. Connection: `PROCTOR_STORAGE_CONNECTION`, falling back to `AzureWebJobsStorage`.
- Responses: 201 `{ blobPath }`, 400 validation, 413 too large, 429 cap, 500 generic (no internals).
- **Retention enforcement (new):** `proctorCleanup` timer function (daily) calls `deleteExpired(container, now, retentionDays = PROCTOR_RETENTION_DAYS || 30)` which deletes blobs whose `lastModified` is older than the threshold, scoped strictly to the `proctor-snapshots` container. `now` is injectable so a just-created blob can be tested as "31 days old". The Azure lifecycle policy remains an optional later belt-and-braces step needing user permission; the app no longer depends on it to keep its promise.
- Consent copy is updated to be true: frames stay on the device unless "Snapshot on flag" is on; then tab-switch snapshots are uploaded, encrypted at rest (Azure Storage default) and deleted after 30 days. The "deleted after 30 days" line stays only because the cleanup function ships in the same change; the Setup page text and the plan state that **until deployed to an environment, no promise is made for that environment**.

Frontend `lib/proctor.ts`: `getLearnerId()` (random UUID in `localStorage` `aiwb.learnerId`, in-memory fallback if storage throws), `newSessionId()`, `captureFrame(video, deps)`, `uploadSnapshot(deps, ...)`. `Setup.tsx` keeps the in-memory list **and** uploads only when `running && s.c1`; shows per-snapshot status (uploaded / failed). One attempt, no retry queue.

### 3. Provision: idempotent, resumable, tab-safe

**Backend (`labsProvision.js` -> logic extracted to `backend/src/lib/foundryProvision.js` with an injected ARM client)**

- Request carries `operationId` (client UUID, validated). Resource and deployment names are derived **deterministically** from it (`suffix = first 8 chars of sha256(operationId)`), so the same operation always targets the same account and deployments.
- The function becomes **resumable**: for each step it first `deployments.get(name)`: NotFound -> create; Running -> wait for it; Succeeded -> skip; Failed -> report failure. **Race handling:** two requests for one `operationId` can both see NotFound before either creates. A create that is rejected as a conflict / active deployment is not an error: the loser re-reads the deployment and follows the winner through the Running/wait path, so both return the same lab. `createdAt/expiresAt` are read back from the existing deployment's parameters on resume, so a re-POST returns the same lab and never a second one. A re-POST of the same `operationId` while the first request is still running is safe.
- Without an `operationId` (old clients) behaviour is unchanged (random suffix).

**Status contract (`labsStatus.js`) - explicit, no more blanket 500**

| Situation | Response |
|---|---|
| Deployment found, any provisioning state | 200 `{ state, stage, portalUrl, accessError }` as today |
| Deployment NotFound **and** the known lab resource (Foundry account, or storage account for the placeholder platforms, identifiers sent by the client) **still exists** | 200 `{ state: "unverified", stage: 1, resourceExists: true }` - the lab is kept and **no new lab may be started**; it ends at `expiresAt` / teardown |
| Deployment Succeeded but the lab resource no longer exists (torn down), **or** deployment NotFound and the resource NotFound | 404 `{ state: "missing" }` |
| ARM throttling (429), 5xx, network, or existence cannot be established | 503 `{ state: "unavailable", retryable: true }` |
| Configuration error (e.g. missing subscription id) | 500 unchanged |

Deployment history and resources have independent lifetimes (a deleted record can leave a running paid account; teardown deletes resources but leaves the record), so "missing" is declared only when **both** are gone. The existence check reuses the resource-type API versions already in `teardown.js`.

**Frontend (`LabLauncher.tsx`)**

- Separate **platform selection** from the **active lab**. `lab = { opId, plat, phase: 'requesting' | 'polling' | 'ready', ids..., expiresAt }` lives in `localStorage` `aiwb.lab.v1` (try/catch, works without storage). Clicking a platform tab no longer clears it or the polling. The panel shows the lab only on its own platform's tab; on any other tab provisioning is disabled with "You already have an active lab".
- **Persist before the request:** generate `opId`, save `phase: 'requesting'`, then POST with that `operationId`. On mount, a `requesting` or `polling` lab is restored: `requesting` re-POSTs the same `opId` (backend resumes), `polling` resumes polling `/status`. A lost response is therefore recovered, not re-provisioned.
- **Cross-tab, fail closed:** the check-and-claim (read saved lab -> if none, write `requesting` with the new `opId`) runs entirely inside `navigator.locks.request('aiwb-lab-provision', ...)`, so a second tab acquires the lock only after the claim is persisted and then sees it. There is **no weaker fallback**: if `navigator.locks` is missing, or `localStorage` cannot be written and read back (probe on mount), paid provisioning is **disabled** with a clear message ("This browser can't safely track your lab - use a current Chrome or Edge") instead of proceeding without a durable, atomic claim. Different browsers/devices are not covered until a login/server-side owner exists (stated limitation).
- **One shared record, one lock for every write:** the saved lab (`aiwb.lab.v1`) is shared by all tabs, so a tab-local `opId` check is **not** enough (tab 2's delayed terminal result for operation A could erase the claim for a newer operation B that tab 1 made). Therefore **every** mutation of the saved record - claim, phase updates, expiry cleanup, terminal-result removal - runs inside `navigator.locks.request('aiwb-lab-provision', ...)` as a **compare-and-set**: re-read storage inside the lock and apply the change only if the stored `opId` equals the `opId` of the operation producing the result; otherwise the result is dropped. Cross-tab `storage` events only refresh the UI; correctness never depends on them being delivered. A per-tab `opId` ref still drops late results for the tab's own UI so an old response cannot fill another platform's panel.
- **Errors:** `404 missing`, `stage < 0`, or `expiresAt` passed are *terminal* -> clear the saved lab and offer "Start a new lab". `unverified` (resource exists, record gone) keeps the lab active and blocks provisioning. `503`/network are *retryable* -> keep the lab, show "Reconnecting...", retry with backoff until expiry; the Retry button that calls `provision` is shown **only** after a terminal failure, never on a transient error.
- First build step: **reproduce** the bug on the unfixed code (browser automation with `page.route` mocks, no Azure cost) and record it.

### 4. Ghost cursor hand-off

Ready-state panel with the three install steps (`chrome://extensions` -> Developer mode -> Load unpacked -> the extension folder) beside the existing "Open in Azure portal" link, plus `ghost-cursor-extension/README.md`. The page cannot detect or drive the extension (different origin); this is in-product instructions, stated as such.

## Non-goals

No login / per-user Azure identity (the learner id is an anonymous per-browser id: spoofable, so snapshots are not tamper-proof evidence); no cross-device duplicate-lab prevention; no admin page to browse snapshots; no snapshot on attention flags (tab-switch only); no upload from `/learn` or Quiz (only the existing `/setup` capture point); no change to calibration or thresholds (`0.26`, `0.13`); no Azure resource, RBAC, lifecycle policy or QA deploy.

## Assumptions and risks

| # | Assumption | If wrong |
|---|---|---|
| 1 | Snapshots are wanted where the camera and toggle exist (`/setup`) | Quiz/Player reuse `captureFrame/uploadSnapshot`; small |
| 2 | An anonymous per-browser learner id is acceptable until login exists | Paths are per browser, not per person |
| 3 | The reload / tab-discard cause is right | The reproduce-first step proves or refutes it |
| 4 | A hidden tab throttles the detection loop | The gap rule resets clocks, so tab-away can never fake a 5 s flag |
| 5 | ARM `deployments.get` on a Running deployment is cheap and a same-name re-PUT is rejected while active | Resume logic waits on the existing deployment instead of re-PUT; covered by fake-client tests |
| 6 | Web Locks API exists in the target browsers (Chromium yes) | Fallback path covered by a test |

## Verification safety

Nothing that can touch real Azure is run. The Functions host is **not** started (it would also start `labsTeardownTimer`, which uses real credentials). Backend tests import the pure libs and call handlers directly as functions with fake request objects and an injected container client; the Blob tests use an Azurite started by the test on its own ports and temp folder; ARM behaviour is tested with a fake client. `proctor.js` and `foundryProvision.js` take their clients as arguments, and the test files import no credential classes. The user's own dev backend, if running, is neither started, stopped nor called.

## Verification (exact commands, all local)

1. `node --test frontend/src/lib/sustain.test.ts` (Node 24 strips types). Cases: 4.9 s no flag, 5.0 s flag; recovery before 5 s resets only that condition; **gaze held 10 s with a 1 s head turn in the middle keeps gaze held**; **the same `frameId` repeated every 300 ms for 10 s never matures a hold and resets after `maxGapMs`**; fresh frames mature at exactly 5 s; head -> eyes-closed does not inherit time; gap > 1.5 s resets all; calibrating / no-face / multiple-faces reset all; no-face-with-person counts as head; non-gated labels pass through immediately; headline and booleans agree; priority after hold.
2. `node --test backend/test/proctor.test.js` against Azurite: validator accepts a valid JPEG, rejects bad ids (`../x`, short, unicode), PNG bytes, oversize, bad reason; slot allocation; **120 concurrent uploads to one session yield exactly 100 blobs and 20 x 429**; private container; `deleteExpired` with injected `now = +31 days` removes the blob and keeps a fresh one; handler returns 201/400/413/429 shapes.
3. `node --test backend/test/provision.test.js` with a fake ARM client: same `operationId` -> identical names and a single set of deployments; Running -> waits; Succeeded -> skipped; re-POST during a running first request does not create a second set; **interleaving where both initial GETs return NotFound before either PUT completes and the second PUT is rejected as a conflict -> both return the same lab, one set of deployments**; expiry read back from the existing deployment; **`labsStatus` contract**: NotFound -> **deployment record missing but account (Foundry) or storage account still present -> 200 unverified, never 404**, record missing and resource missing -> 404, Succeeded-but-account-gone -> 404, 429/5xx or an ARM error while checking existence -> 503 retryable, config error -> 500.
4. `node --test frontend/src/lib/proctor.test.ts`: upload only when `running && enabled`; failure leaves the in-memory copy and reports failed; `getLearnerId` stable and survives a throwing `localStorage`.
5. Browser automation on `vite dev` with mocked `/provision` and `/status`: (a) **reproduce on unfixed code** and record; then after the fix: provision -> reload -> same lab restored, no second POST; reload **while the POST is pending** -> re-POST with the **same** `operationId`; second tab -> no second POST; Foundry -> Copilot -> Foundry keeps the lab; a late response for an old `opId` is ignored; **two pages tracking operation A: page 1 clears A and claims B, then page 2's delayed terminal result for A arrives -> B stays persisted and a third provision is blocked; a delayed phase update and a delayed expiry cleanup for A are likewise dropped**; **Web Locks removed (`navigator.locks` undefined) -> provisioning disabled and no POST; `localStorage.setItem` throwing -> provisioning disabled and no POST; two pages racing the claim with Web Locks present -> exactly one POST**; `unverified` keeps the lab and offers no new provision; 503 keeps the lab with no Retry button; 404 missing clears it; expired saved lab clears.
6. `npm run build` in `frontend/` (`tsc -b && vite build`) passes.
7. Best effort, reported honestly: Chromium with `--use-fake-device-for-media-stream` on `/setup` triggers `visibilitychange` and asserts one `POST /api/proctor/snapshot`. If the models cannot load headless, report NOT VERIFIED, never a pass.

**Manual gates declared, not claimed:** the 5 s rule with a real face and webcam (look away ~3 s then back = nothing; ~6 s = flag); a real tab switch uploads a snapshot; cross-device duplicate provisioning is not prevented; QA container/identity and any lifecycle policy need Azure access and the user's permission; ghost cursor on the live portal.

**Expected result:** items 1-6 pass; item 7 passes or is marked NOT VERIFIED.
