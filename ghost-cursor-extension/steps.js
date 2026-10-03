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
// the cursor says so and offers "Skip step", so a renamed button never blocks the learner.
window.AIWB_STEPS = window.AIWB_STEPS || [
  // portal.azure.com - the resource page                                                       [live]
  { host: 'portal.azure.com', exact: true, kind: 'text', match: ['Go to Foundry portal', 'Launch Foundry portal', 'Foundry portal', 'Go to Azure AI Foundry portal'], label: "Click 'Go to Foundry portal'" },
  // ai.azure.com - the Foundry portal
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Build'], label: "Click 'Build' in the top menu" },                                              // [live]
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['New agent', 'Create agent', 'Build an agent', 'Start building'], label: "Click 'New agent'" },
  { host: 'ai.azure.com', exact: true, kind: 'label', match: ['Agent name'], label: "Click the 'Agent name' box and type a name, for example HR policy helper" },
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Create agent and open playground', 'Create'], label: "Click 'Create'" },
  { host: 'ai.azure.com', exact: true, kind: 'label', match: ['Model'], label: "Check the Model: pick the deployed gpt-4o-mini" },
  { host: 'ai.azure.com', exact: true, kind: 'label', match: ['Instructions'], label: "Click 'Instructions' and paste the starter text from your lab card" },
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Add knowledge', 'Knowledge'], label: "Open 'Knowledge' and add the HR policy file" },
  { host: 'ai.azure.com', exact: true, kind: 'text', match: ['Save'], label: "Click 'Save'" },
  { host: 'ai.azure.com', kind: 'placeholder', match: ['Type a message', 'Type your message', 'Ask a question', 'Message'], label: "Type a question here to test your agent in the playground" },
];
