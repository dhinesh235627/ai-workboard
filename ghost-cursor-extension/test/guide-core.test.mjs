import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../guide-core.js');

const STEPS = [
  { host: 'portal.azure.com', label: 'portal' },
  { host: 'ai.azure.com', label: 'build' },
  { host: 'ai.azure.com', label: 'new agent' },
];
const H = 3600 * 1000;
const NOW = 1_000_000_000_000;
const session = (over = {}) => ({ on: true, at: NOW, step: 0, account: 'labfoundryabc12345', ...over });
const LAB_URL = 'https://portal.azure.com/#@x/resource/subscriptions/s/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/labfoundryabc12345/overview';

test('live only while on and younger than 2 h; the expiry slides with `at`', () => {
  assert.equal(core.isLive(session(), NOW + 1 * H), true);
  assert.equal(core.isLive(session(), NOW + 2 * H + 1), false, 'stale flag is ignored');
  assert.equal(core.isLive(session({ on: false }), NOW), false);
  assert.equal(core.isLive(null, NOW), false);
  const moved = core.advance(session(), 1, NOW + 90 * 60 * 1000);
  assert.equal(core.isLive(moved, NOW + 3 * H), true, 'progress refreshes the clock');
  assert.equal(core.expiresInMs(moved, NOW + 90 * 60 * 1000), 2 * H);
});

test('step 0 starts only on the lab\'s own portal page', () => {
  assert.equal(core.activeStep(session(), STEPS, 'portal.azure.com', LAB_URL, NOW), 0);
  assert.equal(core.activeStep(session(), STEPS, 'portal.azure.com', 'https://portal.azure.com/#home', NOW), -1, 'bookmarked home stays inactive');
  assert.equal(core.activeStep(session(), STEPS, 'portal.azure.com', LAB_URL.replace('labfoundryabc12345', 'someotheraccount'), NOW), -1);
  assert.equal(core.activeStep(session(), STEPS, 'ai.azure.com', 'https://ai.azure.com/home', NOW), -1, 'step 0 belongs to the portal, not Foundry');
});

test('after the hop the portal tab goes idle and Foundry takes over (no storage write by the portal tab)', () => {
  const s1 = core.advance(session(), 1, NOW + 5000);
  assert.equal(core.activeStep(s1, STEPS, 'portal.azure.com', LAB_URL, NOW + 5000), -1);
  assert.equal(core.activeStep(s1, STEPS, 'ai.azure.com', 'https://ai.azure.com/nextgen/r/x/home', NOW + 5000), 1, 'no URL scoping once step >= 1');
  const s2 = core.advance(s1, 2, NOW + 9000);
  assert.equal(core.activeStep(s2, STEPS, 'ai.azure.com', 'https://ai.azure.com/anything', NOW + 9000), 2);
});

test('a reload resumes at the stored step, not at 0', () => {
  const s2 = session({ step: 2 });
  assert.equal(core.activeStep(s2, STEPS, 'ai.azure.com', 'https://ai.azure.com/reloaded', NOW), 2);
});

test('a host\'s own list running out does NOT end the session: only the last global step does', () => {
  // The portal's single step is done (step 1 now). The portal tab must be idle, the session still on.
  const s1 = core.advance(session(), 1, NOW + 1000);
  assert.equal(core.isLive(s1, NOW + 10_000), true);
  assert.equal(core.activeStep(s1, STEPS, 'portal.azure.com', LAB_URL, NOW + 10_000), -1);
  // Finished: shown on the page that owns the LAST step, nowhere else.
  const done = session({ step: STEPS.length });
  assert.equal(core.activeStep(done, STEPS, 'ai.azure.com', 'https://ai.azure.com/x', NOW), STEPS.length);
  assert.equal(core.activeStep(done, STEPS, 'portal.azure.com', LAB_URL, NOW), -1);
});

test('an EMPTY account never starts anywhere; only the in-memory test fixture (no account field at all) is unscoped', () => {
  assert.equal(core.activeStep(session({ account: '' }), STEPS, 'portal.azure.com', 'https://portal.azure.com/#home', NOW), -1);
  const { account, ...fixtureSession } = session();
  assert.equal(core.activeStep(fixtureSession, STEPS, 'portal.azure.com', 'https://portal.azure.com/#home', NOW), 0);
});

test('steps without a host apply everywhere; junk input is inactive, never a crash', () => {
  assert.equal(core.activeStep(session({ account: 'example' }), [{ label: 'any' }], 'example.com', 'https://example.com', NOW), 0);
  assert.equal(core.activeStep(session({ step: -5 }), STEPS, 'ai.azure.com', 'x', NOW), -1);
  assert.equal(core.activeStep(session(), [], 'ai.azure.com', 'x', NOW), -1);
  assert.equal(core.activeStep(undefined, STEPS, 'ai.azure.com', 'x', NOW), -1);
});
