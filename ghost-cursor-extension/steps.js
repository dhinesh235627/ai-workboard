// Lab steps for creating an agent, end to end. Each target is found by what the learner sees,
// never by Azure's generated class names.
//   kind:  text | label | placeholder | value   (see content.js)
//   match: the visible wording, or a list of alternatives (first one found wins). Microsoft
//          renames buttons between portal versions, so list the likely variants.
//   exact: only an exact text match counts (no "contains"), so "Create" cannot grab "Create deployment".
//   host:  only run this step on that site. The agent itself is built in the Foundry portal
//          (ai.azure.com); portal.azure.com only shows the resource and links across.
// Wording marked [live] was checked on the real portal; the rest follows Microsoft Learn's
// "Create a new agent" quickstart and has NOT been seen on the live UI. If a step cannot be found
// the cursor says so and offers "Skip step", plus "Jump to ..." / "Go back to ..." when a later or
// an earlier step's control is on the screen, so a renamed button never blocks the learner.
window.AIWB_STEPS = window.AIWB_STEPS || [
  // portal.azure.com - the resource page                                                       [live]
  { host: 'portal.azure.com', exact: true, kind: 'text', match: ['Go to Foundry portal', 'Launch Foundry portal', 'Foundry portal', 'Go to Azure AI Foundry portal'], label: "Click 'Go to Foundry portal'" },
  // ai.azure.com - the Foundry portal
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Build'], label: "Click 'Build' in the top menu" },                                              // [live]
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['New agent', 'Create agent', 'Start building'], label: "Click 'New agent'" },                       // [live: "New agent v" is a dropdown]
  // "New agent" opens a menu; Microsoft Learn: "select the arrow next to New agent, then Build an agent".
  // `optional`: the ONLY step the cursor may skip by itself (when the next control, "Agent name", is
  // already on screen: the dialog opened without a menu). It is not `exact`, because a menu item
  // usually carries a second line of description text.
  { host: 'ai.azure.com', optional: true, kind: 'text', match: ['Build an agent'], label: "Choose 'Build an agent' from the menu" },
  // The name box of the "create agent" dialog: by its label, else (renamed label) the first text box of
  // the open dialog.
  { host: 'ai.azure.com', exact: true, kind: 'label', match: ['Agent name'], fallback: 'dialoginput', label: "Type a name for your agent, for example HR policy helper" },
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Create agent and open playground', 'Create agent', 'Create'], label: "Click 'Create'" },
  // The agent screen (playground). Seen on the real portal: a "Model: gpt-5" row, an Instructions box
  // whose placeholder says "Write your prompt here to give your agent instructions.", a Save button
  // at the top, a chat box "Message the agent...". NOTE the left menu also has an item called
  // "Knowledge": that goes to a different page, so it is never used as a target.
  { host: 'ai.azure.com', kind: 'text', match: ['Model:'], label: "Check the Model: pick the deployed gpt-4o-mini" },                                    // [live]
  { host: 'ai.azure.com', kind: 'placeholder', match: ['Write your prompt here', 'give your agent instructions'], label: "Click 'Instructions' and paste the starter text from your lab card" },   // [live]
  // Knowledge is `optional`: on the real agent screen it is not always present under these names (it
  // can live behind Tools > Add, or on its own page), so when the next step is already on screen the
  // cursor moves on by itself and says so, instead of stranding the learner.
  { host: 'ai.azure.com', optional: true, kind: 'text', match: ['Add knowledge', 'Add a knowledge base', 'Knowledge base'], label: "Add the HR policy file (Knowledge section of this agent)" },
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Save'], label: "Click 'Save'" },                                                                                                     // [live]
  { host: 'ai.azure.com', kind: 'placeholder', match: ['Message the agent', 'Type a message', 'Type your message', 'Ask a question', 'Send a message'], label: "Type a question here to test your agent" },   // [live: an editable div, not an <input>]
];

// What the guide SAYS at each step, same order as AIWB_STEPS above (the cursor's text label stays short;
// the voice is slower, softer and more human). Sentences are joined with a gentle pause; “quoted” words are
// stressed so the learner can spot them on screen. A missing entry falls back to the label.
window.AIWB_SPEAK = [
  ['Hi there… welcome, I’m so glad you’re here.', 'Take a slow breath. We’ll do this together, one little click at a time.', 'See my blue cursor? Click “Go to Foundry portal”.'],
  ['Ohh, lovely, you’re in.', 'Now, up in the top menu, click “Build”. Right where my cursor is.'],
  ['Mm-hm, perfect.', 'Hmm, now click “New agent”. Take your time, there’s no rush at all.'],
  ['Okay, a little menu just opened.', 'Choose “Build an agent”. You’re doing great.'],
  ['Ohh, good. Now we get to give our agent a name.', 'Click this box, and type something friendly, like “HR policy helper”.'],
  ['Mm-hm, that looks lovely.', 'Now click “Create”, and let’s bring your agent to life.'],
  ['Wow, look at that… your agent is born!', 'Hmm, let’s have a peek at the model. Make sure it’s the one we deployed, gpt-4o-mini.'],
  ['Okay, now the important part, the instructions. Think of them as your agent’s little playbook.', 'Click this box, and paste the starter text from your lab card.'],
  ['Almost there, you’re doing so well.', 'If you can see the knowledge part, add the HR policy file here. If not, no worries at all.'],
  ['Ohh, nice work.', 'Now click “Save”, so nothing gets lost.'],
  ['Last one, I promise. Hmm, look how far you’ve come.', 'Type a question in this box, and let’s see your agent answer.'],
];

window.AIWB_LINES = {
  done: ['You did it! Ohh, I’m so proud of you.', 'Your agent is alive, and you built it yourself. Take a breath… that was a wonderful first build.'],
  waiting: ['Hmm… give me a moment, I’m looking for it.'],
  timeout: ['Hmm… I can’t see that one just yet. No worries, take your time.', 'If your screen looks a little different, you can press Skip step.'],
  ambiguous: ['Ohh, I see two of those, and I don’t want to guess.', 'Pick the one that feels right, or press Skip step.'],
  skipped: ['Okay, it looks like you already did that one. Lovely, let’s move on.'],
};
