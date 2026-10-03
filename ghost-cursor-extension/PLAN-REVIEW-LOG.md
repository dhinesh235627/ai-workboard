# Plan review log — ghost cursor browser extension

Append-only. Newest entries at the bottom.

## Run setup

| Field | Value |
|---|---|
| Host | Claude Code |
| Planner | Claude (Opus 5) |
| Plan reviewer | Codex — requested model `gpt-6-astra`, effort `high` |
| Builder | Claude (Opus 5) |
| Final inspector | Codex, fresh session |
| Plan file | `ghost-cursor-extension/PLAN.md` |
| Log file | `ghost-cursor-extension/PLAN-REVIEW-LOG.md` |
| Max review rounds | 5 |
| Inspection | on |
| Authorization | User selected this target and instructed the loop to run without further questions. Local only — no deploy, no commit, no push. |

**Premise established before planning:** a web page on `ai-workboard-qa.azurewebsites.net`
cannot draw on or read `portal.azure.com` (same-origin policy), and the portal cannot be
framed. An extension running inside the portal's own origin is the only viable mechanism.

---

## Plan review — round 1

- Verdict: **REVISE** (4 findings)
- Reviewer: codex / gpt-6-astra / high
- Duration: 102.5 s
- Session: `01a0f70f-411e-7cb2-a36a-2381c6a6750f`
- Artifacts: `(local run artifacts)`
- Plan SHA256 reviewed: `48f7f0733255e2eb7f5a34caf996a4bf8554e5e4783d551cca29cf48e73a2b7e`

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | high | Candidate selector + `textContent` matching cannot resolve the form steps: labels and controls are separate nodes; `input`/`textarea`/`select` have no `textContent`; `input[type=submit]` carries its label in `value` | **Accepted** — steps now declare a target kind (`text`/`label`/`placeholder`/`value`); candidate set widened to form controls; fixture exercises all five steps |
| R2 | medium | First-substring-match can select a hidden duplicate in a dismissed blade; hidden descendant text can match | **Accepted** — match on `innerText`, reject on visibility test, prefer top-most blade, report `ambiguous` rather than guess; fixture gains both cases |
| R3 | medium | Patching `history.pushState` from a content script does nothing — content scripts run in an isolated world, so page-side `pushState` goes undetected | **Accepted** — replaced with 300 ms `location.href` polling as the primary detector; `hashchange`/`popstate` retained only as a fast path; MAIN-world bridge rejected as primary and recorded as a trade-off |
| R4 | medium | A fixture that injects `content.js` itself proves nothing about extension loading or origin scoping — `browser.mjs` launches plain Chromium without the extension | **Accepted** — verification split into Tier A (logic, fixture) and Tier B (real unpacked extension via patchright `--load-extension`, asserting manifest validity, file existence, script order, and absence of injection on a non-portal origin); the live-portal gate is now stated as explicitly manual |

Plan SHA256 after revision: `45869df2cdc0655e41598e702bb669e9dd470d3f9c94066f817f99d50c47ce10`

## Plan review — round 2

- Verdict: **REVISE** (1 finding; R1, R3, R4 confirmed resolved)
- Session: `01a0f70f-411e-7cb2-a36a-2381c6a6750f`, artifacts `(local run artifacts)`
- R2 (medium, partial): `innerText` retains `opacity:0` descendant text. **Accepted** — custom text-node walk skipping display:none / visibility:hidden / opacity:0 ancestors, shared by label matching; A7 extended.
- Plan SHA256 after revision: `8c4deae17871b649d0980699a110138913c308e409b985dd72c2f74bffc3682f`
- Model note: user directed Sonnet 5.5 for the Claude-side (builder) role; reviewer/inspector remain codex gpt-6-astra.

## Plan review — round 3

- Verdict: **APPROVED** (plan SHA256 `8c4deae17871b649d0980699a110138913c308e409b985dd72c2f74bffc3682f`, artifacts `(local run artifacts)`)

## Build (host, Claude Sonnet 5.5)

- Built directly by the host: the repo has uncommitted user work, so a delegated build would fail the runner's clean-checkout gate. Local only; no commit, no push, no deploy.
- Pre-build commit: `a8ad47b`
- Tier A (`test/verify.mjs`): **PASS**, all of A1-A9 plus missing-target timeout/recovery and same-blade ambiguity. Mutation check: removing opacity:0 handling made it fail; restored byte-identical.
- Tier B (`test/verify-ext.mjs`): static checks B1-B3 **PASS**. Browser load checks B4-B6 **NOT VERIFIED** — deviation from plan: on this machine the Playwright Chromium build never accepts a connection when ANY extension is loaded (even an empty manifest, headed or headless, with Playwright's launcher or direct spawn + CDP). Environment limit, not an extension verdict. The script reports `loadVerified: false` rather than passing. Manual gate: load unpacked at chrome://extensions.
- Fixture deviation found in testing: the fixture does not receive manifest CSS, so it links `content.css` itself; missing/delay modes remove the always-visible old-blade duplicate so the target is genuinely absent.

## Inspection round 1 (fresh codex session, gpt-6-astra) — REVISE, 6 findings, all accepted

Artifacts: `(local run artifacts)`. (An earlier attempt failed with "workspace is out of credits"; not counted.)

| # | Finding | Fix |
|---|---|---|
| GC-01 | waiting/timeout/ambiguous message written into the pill, whose parent cursor is opacity:0 — invisible | Separate always-visible `.aiwb-status` bar; Tier A asserts computed opacity and text for timeout and ambiguous |
| GC-02 | innermost-leaf match dropped the enclosing `<label for>`; wrong input chosen | Resolve through `closest('label')` first; new `?assoc=1` fixture (input before `<label for><span>`); mutation-checked |
| GC-03 | navigation reset stepStart without re-arming the deadline; targetless page stayed "waiting" forever | Central `armDeadline()` re-armed on every stepStart reset; Tier A navigates after the first deadline and requires a second timeout; mutation-checked |
| GC-04 | `focusin` advanced steps (tabbing past Model select) | Click only; stale/duplicate guard via index check; Tier A asserts focus does not advance and click does |
| GC-05 | Tier B could print PASS:true with no browser verification; B4 hard-coded true | PASS requires every check `ok === true` AND `loadVerified` (B5+B6a+B6b); B4 removed. On this machine Tier B now exits non-zero |
| GC-06 | B6b measured getBoundingClientRect width of an animated (scale 0.5-1.7) ring | Uses `offsetWidth` |

Also: Tier A glide check was flaky under load (fixed 1.2s sleep); now polls up to 3s for settle. Stable 4/4 after.

**Correction to the Build section:** the "Tier B browser load checks NOT VERIFIED / Chromium never accepts a connection with any extension" deviation was wrong as a permanent limit. After my own stuck Chromium/node processes were cleared, Tier B ran end to end: B1-B7 all `ok:true`, `loadVerified:true` (probe copy injected, found its target, manifest CSS applied: ring offsetWidth 44; real manifest injected nothing on a non-portal origin). The earlier failure was most likely contamination from my own leftover processes. Still not covered: the live portal.azure.com DOM (manual gate).

## Inspection round 2 (fresh codex session, gpt-6-astra) — REVISE, 5 findings, all accepted

Artifacts: `(local run artifacts)`.

| # | Finding | Fix |
|---|---|---|
| GC-07 | aria-labelledby on a non-label ancestor dropped when reducing to the innermost text leaf | `controlFor` walks the leaf and every same-text ancestor checking `for=` / `aria-labelledby` before any fallback; fixture `?lbl7` (control before caption) |
| GC-08 | unresolved explicit association fell through to a neighbouring control; fallback crossed field boundaries | explicit-but-absent returns "missing" and the step keeps waiting; positional fallback bounded to the label's own field (first sibling after its sole wrapper, stops at any other visible text); fixture `?async8` incl. late-rendered input |
| GC-09 | `aria-label` on a non-interactive wrapper became the target; wrapper + control both matched -> false ambiguity | ARIA results resolved to the control inside; deduped; fixture `?grp9` |
| GC-10 | `visibleText` lost `<br>`/block word breaks ("try inplayground") | `<br>` and non-inline boundaries emit a space; fixtures `?br10`, `?blk10`; mutation-checked |
| GC-11 | Tier B lacked positive evidence for the UNCHANGED extension; relied on a modified probe copy | probe copy removed; the unchanged extension is loaded and `https://portal.azure.com/` is served locally via request interception, so the real match pattern fires; asserts injection, target resolved, CSS applied, no unfulfilled requests, no extension load error in browser stderr; `loadVerified` requires all of it |

## Final proof (host-run, after the last edits)

- Tier A (`test/verify.mjs`): PASS, run twice after the last content.js edit; includes all prior checks plus GC-07..GC-10 cases.
- Tier B (`test/verify-ext.mjs`): PASS, `loadVerified: true`, B1-B7 all true.
- Mutation checks: opacity handling, navigation deadline re-arm, label association, `<br>` separators each made Tier A fail when removed; content.js restored byte-identical each time.

## Budget and coverage

Inspection budget (2 rounds) is used. The GC-07..GC-11 fixes and the matching test changes were **not** re-inspected by Codex. A prior attempt failed with "workspace is out of credits" and is not counted. Not covered at all: the live portal.azure.com DOM (manual gate).
