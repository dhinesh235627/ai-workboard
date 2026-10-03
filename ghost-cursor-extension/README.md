# AI Workboard ghost cursor (Chrome extension)

Guides you click by click while you create an agent: it points at the next control with a blue
cursor and a label ("Click 'New agent'"). It reads nothing from the pages and sends nothing anywhere.

## When it shows up

**Only after you press "Start guided session"** in the AI Workboard app (the last step of
"Start guided lab"). "Open portal only" opens Azure with no cursor, and ordinary Azure browsing
never shows one. A session covers `portal.azure.com` (your lab's own page, where it points to
"Go to Foundry portal") and then `ai.azure.com` (the Foundry portal: Build, New agent, Agent name,
Create, Model, Instructions, Knowledge, Save, chat). Progress is shared by all tabs and survives a
page reload. It ends when the last step is done, when you press **End guide**, or 2 hours after your
last click. If a button's name does not match, the bar at the bottom says so and offers **Skip step**.

## Install (Chrome or Edge)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder (`ghost-cursor-extension`).
3. **Reload the AI Workboard page** (the app only sees the extension after a reload).

After you change or update the extension, click its refresh arrow and reload the app page again.

## How it works (for reviewers)

- `bridge.js` runs only on the app's own origins (`localhost:5173` and the two `ai-workboard*.azurewebsites.net` sites). It marks the page (`data-aiwb-ext`) so the app can tell the extension is installed, and starts or ends a session when the app sends the `aiwb:guide` event (an "on" needs the lab's account name).
- `guide-core.js` holds the pure rules (who acts on which step, expiry) and is unit-tested.
- `content.js` runs on the two Azure sites but stays inactive unless a session is on.
- Permissions: `storage` only. No host permissions beyond those sites, no background page, no tabs.

## If the cursor cannot find a control

The wording in `steps.js` comes from Microsoft Learn, except "Go to Foundry portal" and "Build" which
were seen on the real portal. Each step takes a list of alternatives in `match`; add or change the text
to what you see, refresh the extension, and start the session again.

## Tests

- `node --test test/guide-core.test.mjs`: the pure session rules.
- `test/verify.mjs` (with `test/fixture.html`): targeting and navigation logic.
- `test/verify-ext.mjs`: the real extension in Chromium on local copies of the Azure pages.
- `labs-proctoring/test/guided-e2e.mjs`: the real app plus the real extension.

None of these can prove the selectors match today's live Foundry; that needs a person with a signed-in session.
