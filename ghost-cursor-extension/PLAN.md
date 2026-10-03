# Ghost cursor browser extension for the real Azure portal

## Why this exists

`/guided` in ai_workboard draws a ghost cursor over a **mock** Azure portal it renders
itself. It cannot do the same on the real portal: a page served from
`ai-workboard-qa.azurewebsites.net` is forbidden by same-origin policy from drawing on or
reading `portal.azure.com`, and the portal cannot be framed. A browser extension is the
only way to run code *inside* the portal's own origin, so that is what this builds.

## Goal

A Manifest V3 Chrome extension that, while the learner is on `portal.azure.com`:

1. Draws a ghost cursor that glides to the element for the current lab step and pulses.
2. Shows a label pill naming the action ("Click '+ New agent'").
3. Detects when the learner navigates to a different portal page and indicates it, rather
   than silently pointing at an element that no longer exists.
4. Advances to the next step when the learner clicks the pointed-at element.

## Observable acceptance criteria

1. `manifest.json` is valid JSON, `manifest_version: 3`, and declares a content script
   matching `https://portal.azure.com/*` only — no broader host permission.
2. Every file the manifest declares (`js` and `css` arrays) exists on disk, and `content.js`
   is listed after `steps.js`.
3. The extension loads unpacked in Chromium with no manifest error.
4. On an origin other than `portal.azure.com`, the extension injects nothing.
5. Against the fixture, for **all five** steps: the cursor resolves the correct control,
   centres within 8 px of it, shows that step's label, and advances on click.
6. A target that appears **late** is still resolved, within a 2 s deadline from the step
   starting.
7. Hidden elements are never chosen: neither a hidden duplicate of the target's text, nor
   an element whose matching text lives only in a hidden descendant.
8. Navigation is detected for **all** of: `hashchange`, `popstate`, and a page-originated
   `history.pushState` that changes no DOM — and the indicator becomes visible.
9. Zero network requests, zero console errors, zero page errors.

## Approach

```
ghost-cursor-extension/
  manifest.json        MV3, content script scoped to portal.azure.com
  steps.js             step definitions (five steps, typed targets)
  content.js           targeting, cursor, navigation watch, step advance
  content.css          cursor, ring, pill, navigation banner
  test/fixture.html    portal-like fixture covering all five target shapes
  test/verify.mjs      Tier A — logic checks via the browser-automation helper
  test/verify-ext.mjs  Tier B — loads the real unpacked extension via patchright
```

### Targeting (rewritten after finding R1)

The first design assumed every target was a button whose `textContent` is its label. That is
false for the form steps: in the reference flow, *"Agent name"* and *"Instructions"* are
**separate label elements**, and the control beside them carries placeholder text instead.
Inputs, textareas and selects have no `textContent` at all, and `input[type=submit]` carries
its label in `value`.

Each step therefore declares an explicit **target kind**:

| Kind | Resolves by | Covers |
|---|---|---|
| `text` | rendered text of a clickable (`button`, `a`, `[role=button]`) | "+ New agent", "Try in playground" |
| `label` | finds the label by its rendered text, then its associated control via `for=`/`aria-labelledby`/`aria-label`, falling back to the nearest following control in the same container | "Agent name", "Model", "Instructions" |
| `placeholder` | `input`/`textarea` whose `placeholder` matches | empty fields with no visible label |
| `value` | `input[type=submit]`/`input[type=button]` whose `value` matches | submit buttons |

Candidate set includes `input`, `textarea`, `select`, and `[role=combobox]`, not only
clickables.

### Visibility and ambiguity (finding R2)

A substring match over `textContent` is not "visible text". The portal keeps dismissed
blades in the DOM, so the first match can be an invisible control. Resolution therefore:

- Builds matching text with a **custom text-node walk**, not `textContent` or bare
  `innerText`. `innerText` drops `display:none` and `visibility:hidden` text but **keeps
  `opacity:0` text** (the HTML rendered-text algorithm does not filter opacity). The walk
  visits each text node under the candidate and skips any whose ancestor chain, up to and
  including the candidate, has `display:none`, `visibility:hidden` or computed `opacity: 0`.
  The same helper is used for `label` matching, so e.g.
  `<button>Cancel<span style="opacity:0">+ New agent</span></button>` matches "Cancel" only.
- Rejects any candidate failing a visibility test: zero-area `getBoundingClientRect()`,
  `display: none`, `visibility: hidden`, or computed `opacity: 0` on itself or an ancestor.
- When more than one **visible** candidate remains, prefers the one inside the last
  (top-most) blade/dialog container, and if still ambiguous reports an `ambiguous` state
  rather than silently guessing.

### Navigation detection (rewritten after finding R3)

The first design patched `history.pushState` **from the content script**. Chrome runs
content scripts in an **isolated world**, so those patches never see the page's own calls —
a page-originated `pushState` that changes no DOM would have produced no `hashchange`, no
`popstate`, and no mutation, leaving navigation completely undetected.

Replaced with an execution-world-safe mechanism:

- **`location.href` polling at 300 ms** is the primary detector. It is immune to execution
  world entirely, because it observes the resulting URL rather than trying to intercept the
  call that changed it.
- `hashchange` and `popstate` listeners remain, purely as a faster path for the cases they
  do cover.
- A `MutationObserver` re-resolves the target on DOM churn — content change, not navigation.

### Visual language

Matches the existing mock in `frontend/src/pages/Guided.tsx` so the two feel like one
product: cursor arrow and ring in `#3E6AE1`; ring animating `scale(0.5)→scale(1.7)`,
opacity `0.9→0`, over 1.4 s; label pill `#3E6AE1` with white 600-weight text; movement eased
`cubic-bezier(0.22, 1, 0.36, 1)` over 0.9 s.

### Isolation

All injected nodes live under one `#aiwb-ghost-root` with `pointer-events: none`, a high
`z-index`, and `aiwb-` prefixed class names, so the extension cannot intercept the learner's
clicks or collide with portal styles.

## Key decisions and trade-offs

- **Extension over desktop companion** — scoped to one origin, no screen-capture
  permission; but every learner installs it manually.
- **Text/label matching over CSS selectors** — survives Azure's generated class names
  changing; breaks if Microsoft changes wording or the portal runs in another language.
  Accepted, recorded as a risk, fixed by editing `steps.js` alone.
- **URL polling over a MAIN-world history bridge** — a bridge would report navigation a few
  hundred ms sooner, but needs an extra injected script and `world: "MAIN"`; polling is far
  simpler and cannot be defeated by execution-world isolation.
- **No background service worker logic, no telemetry, no network.**

## Non-goals

- No voice guidance (Ava is a separate feature).
- No reading, extracting or transmitting anything from the learner's portal session.
- No automation of portal actions — the extension *points*, the learner clicks.
- Chrome MV3 only; no Firefox/Safari packaging, no Web Store publication.
- **No deployment, no git commit, no push** — local files only.

## Assumptions

| # | Assumption | Source | Risk if wrong |
|---|---|---|---|
| 1 | The real portal cannot be driven from the web app; an extension is required | same-origin policy; portal does not permit framing | None — this is the premise |
| 2 | Live portal targets are reachable by rendered text or an associated visible label | reference flow in `Guided.tsx` | Target never resolves; surfaces as a visible timeout state, never a silent failure |
| 3 | Portal navigation always changes `location.href` | observed portal URL form `portal.azure.com/#@tenant/resource/...` | A blade change with an unchanged URL is treated as content churn and handled by the MutationObserver re-resolve instead |
| 4 | Chrome / Chromium, MV3 | current requirement | Separate manifest needed elsewhere |

## Verification

Split into two tiers after finding R4, because a fixture that injects `content.js` itself
proves **nothing** about whether Chrome would load the extension at all.

### Tier A — logic, against the fixture (automated)

```
node "C:/Users/hp/.claude/skills/browser-automation/browser.mjs" "file:///C:/dhinesh/Dhinesh/Dhinesh/ai_workboard/ghost-cursor-extension/test/fixture.html" --script "C:/dhinesh/Dhinesh/Dhinesh/ai_workboard/ghost-cursor-extension/test/verify.mjs"
```

Claims **only** that the targeting/navigation logic is correct. Asserts:

| # | Assertion |
|---|---|
| A1 | All five steps resolve the correct control, each a different target kind (`text`, `label`, `label`, `label`, `text`) |
| A2 | Cursor centre within 8 px of each resolved target's centre |
| A3 | Label pill text equals the current step's label, for every step |
| A4 | Clicking the target advances the step, through the whole five-step sequence |
| A5 | A target injected **after** a 900 ms delay still resolves, within the 2 s deadline |
| A6 | A hidden duplicate carrying the same text is **not** chosen |
| A7 | An element whose match exists only in a hidden descendant is **not** chosen — covering `display:none`, `visibility:hidden` **and** `opacity:0` descendants (e.g. `<button>Cancel<span style="opacity:0">+ New agent</span></button>`), for both `text` and `label` kinds |
| A8 | `hashchange`, `popstate`, **and a page-originated `pushState` that mutates no DOM** each raise the navigation indicator |
| A9 | Zero non-`file://` requests, zero console errors, zero page errors |

### Tier B — real extension loading (automated)

```
node "C:/dhinesh/Dhinesh/Dhinesh/ai_workboard/ghost-cursor-extension/test/verify-ext.mjs"
```

Launches Chromium with the **actual unpacked extension** via patchright
(`--load-extension`), which Tier A cannot do. Asserts:

| # | Assertion |
|---|---|
| B1 | `manifest.json` parses; `manifest_version === 3`; `matches` is exactly `["https://portal.azure.com/*"]` |
| B2 | Every file listed in the manifest's `js` and `css` arrays exists on disk |
| B3 | `content.js` appears **after** `steps.js` in the `js` array |
| B4 | Chromium starts with the extension loaded and reports no extension error |
| B5 | On a **non-portal** origin, `#aiwb-ghost-root` is absent — proving the content script is not over-scoped |

### Manual gate (cannot be automated, and is not claimed to be)

Loading the real `portal.azure.com` needs an authenticated session and the portal blocks
automation. **Tier A and Tier B together do not prove the selectors resolve against today's
live portal.** A human must: load unpacked via `chrome://extensions` → Developer mode, open
the real portal, and confirm the cursor lands on the live "+ New agent" control. A failure
there is a wording/selector problem fixed by editing `steps.js` — not a logic defect.

**Expected result:** Tier A `PASS: true`, Tier B `PASS: true`, manual gate performed by the
user.
