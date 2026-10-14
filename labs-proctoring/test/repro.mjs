// Reproduces the "Provision environment again after reload" bug with MOCKED API calls
// (no Azure, no cost). Run against a Vite dev server:
//   node <browser-automation>/browser.mjs http://localhost:5199/labs --script <this file>
const BASE = 'http://localhost:5199/labs';

export default async function run(page) {
  const posts = [];
  await page.route('**/api/labs/provision', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        deploymentName: 'lab-proj-mock', accountName: 'labfoundrymock', projectName: 'sandbox-project',
        expiresAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), platform: 'foundry',
      }),
    });
  });
  await page.route('**/api/labs/status**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ state: 'Running', stage: 1, portalUrl: null }),
  }));

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /provision my environment/i }).click();
  await page.getByRole('button', { name: /provisioning/i }).waitFor({ timeout: 5000 });
  const before = { provisionButtonVisible: await page.getByRole('button', { name: /provision my environment/i }).isVisible().catch(() => false) };

  await page.reload({ waitUntil: 'load' }); // what switching tabs does when the browser discards the page
  await page.waitForTimeout(800);
  const after = {
    provisionButtonVisible: await page.getByRole('button', { name: /provision my environment/i }).isVisible().catch(() => false),
    provisioningVisible: await page.getByRole('button', { name: /provisioning/i }).isVisible().catch(() => false),
  };
  let secondPost = false;
  if (after.provisionButtonVisible) {
    await page.getByRole('button', { name: /provision my environment/i }).click();
    await page.waitForTimeout(500);
    secondPost = posts.length > 1;
  }
  return { before, after, postsSent: posts.length, secondLabCreatedByClick: secondPost, BUG_REPRODUCED: after.provisionButtonVisible && secondPost };
}
