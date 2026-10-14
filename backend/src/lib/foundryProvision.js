// Idempotent, resumable lab provisioning. The ARM client is injected, so this file has no
// credentials of its own and can be tested with a fake.
//
// The client sends an operationId before it asks for a lab. Every resource and deployment
// name is derived from it, so asking again for the same operation (reload, lost response,
// retry) finds the deployments that already exist and follows them instead of creating a
// second, paid lab.
import { createHash, randomBytes } from "node:crypto"

export const OP_ID_RE = /^[A-Za-z0-9-]{8,64}$/
const LAB_LIFETIME_MS = 2 * 60 * 60 * 1000
const FINISHED = new Set(["Succeeded", "Failed", "Canceled"])

export function namesFor(operationId) {
  const suffix = operationId
    ? createHash("sha256").update(operationId).digest("hex").slice(0, 8)
    : randomBytes(4).toString("hex")
  return {
    suffix,
    accountName: `labfoundry${suffix}`,
    accountDeploymentName: `lab-acct-${suffix}`,
    projectDeploymentName: `lab-proj-${suffix}`,
    storageDeploymentName: `lab-${suffix}`,
    storageAccountName: `labsa${suffix}`,
  }
}

const isNotFound = (err) => err && (err.statusCode === 404 || err.code === "DeploymentNotFound")
// A same-name deployment is already active: someone else (another request for the same
// operation) won the race to create it.
const isConflict = (err) =>
  err && (err.statusCode === 409 || /DeploymentActive|Conflict|AnotherOperationInProgress/i.test(String(err.code || "")))

async function getOrNull(client, rg, name) {
  try {
    return await client.deployments.get(rg, name)
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

// Make sure deployment `name` exists. `wait` = block until it finishes.
// Returns the final deployment record when we waited, else whatever is known.
async function ensureDeployment(deps, name, properties, wait) {
  const { client, rg, sleep, pollMs, maxWaitMs } = deps
  let existing = await getOrNull(client, rg, name)

  if (!existing) {
    try {
      if (wait) await client.deployments.beginCreateOrUpdateAndWait(rg, name, { properties })
      else await client.deployments.beginCreateOrUpdate(rg, name, { properties })
      existing = await getOrNull(client, rg, name)
    } catch (err) {
      if (isConflict(err)) {
        // Lost the race: follow the winner.
        existing = await getOrNull(client, rg, name)
        if (!existing) throw err
      } else {
        // The SDK's poller throws a plain, status-less Error when Azure ends the deployment as
        // Failed, so look at the deployment itself. A request Azure rejects outright as
        // unauthorised / invalid (403, 400) can never succeed on retry either. Both are TERMINAL.
        const after = await getOrNull(client, rg, name).catch(() => null)
        const st = after?.properties?.provisioningState
        if (st === "Failed" || st === "Canceled" || err.statusCode === 400 || err.statusCode === 403) {
          throw Object.assign(err, { terminal: true })
        }
        throw err
      }
    }
  }
  if (!existing) return null

  if (wait) {
    let waited = 0
    while (!FINISHED.has(existing.properties?.provisioningState) && waited <= maxWaitMs) {
      await sleep(pollMs)
      waited += pollMs
      existing = (await getOrNull(client, rg, name)) || existing
    }
    const state = existing.properties?.provisioningState
    // A deployment Azure itself reports as Failed/Canceled will never succeed by asking again, so
    // it is a TERMINAL failure the caller must surface distinctly (not a retryable 5xx).
    if (state === "Failed" || state === "Canceled") {
      throw Object.assign(new Error(`deployment ${name} ${state.toLowerCase()}`), { terminal: true })
    }
    if (!FINISHED.has(state)) throw new Error(`deployment ${name} did not finish in time`)
  }
  return existing
}

const paramValue = (dep, key) => dep?.properties?.parameters?.[key]?.value

// platform "foundry": account (waited) then project + model (not waited; the client polls
// /status). Anything else: the placeholder storage account.
export async function provisionLab(deps) {
  const {
    client, rg, templates, learnerId, platform,
    operationId = null, now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = 5000, maxWaitMs = 10 * 60 * 1000,
  } = deps
  const d = { client, rg, sleep, pollMs, maxWaitMs }
  const n = namesFor(operationId)

  if (platform !== "foundry") {
    const prior = await getOrNull(client, rg, n.storageDeploymentName)
    const ownCreatedAt = paramValue(prior, "createdAt") || new Date(now()).toISOString()
    const ownExpiresAt = paramValue(prior, "expiresAt") || new Date(now() + LAB_LIFETIME_MS).toISOString()
    const stored = await ensureDeployment(d, n.storageDeploymentName, {
      mode: "Incremental",
      template: templates.storage,
      parameters: {
        storageAccountName: { value: n.storageAccountName },
        learnerId: { value: learnerId },
        createdAt: { value: ownCreatedAt },
        expiresAt: { value: ownExpiresAt },
      },
    }, false)
    const createdAt = paramValue(stored, "createdAt") || ownCreatedAt
    const expiresAt = paramValue(stored, "expiresAt") || ownExpiresAt
    return { deploymentName: n.storageDeploymentName, storageAccountName: n.storageAccountName, resourceGroup: rg, createdAt, expiresAt }
  }

  // Resuming: keep the original timestamps so a re-POST returns the SAME lab, not a fresh clock.
  const prior = await getOrNull(client, rg, n.accountDeploymentName)
  const ownCreatedAt = paramValue(prior, "createdAt") || new Date(now()).toISOString()
  const ownExpiresAt = paramValue(prior, "expiresAt") || new Date(now() + LAB_LIFETIME_MS).toISOString()
  const projectName = "sandbox-project"

  const account = await ensureDeployment(d, n.accountDeploymentName, {
    mode: "Incremental",
    template: templates.foundryAccount,
    parameters: {
      accountName: { value: n.accountName },
      learnerId: { value: learnerId },
      createdAt: { value: ownCreatedAt },
      expiresAt: { value: ownExpiresAt },
    },
  }, true)

  // If this request lost a creation race, the account was created with the WINNER's timestamps;
  // take them from the deployment that actually exists so every racer returns the same lab.
  const createdAt = paramValue(account, "createdAt") || ownCreatedAt
  const expiresAt = paramValue(account, "expiresAt") || ownExpiresAt

  await ensureDeployment(d, n.projectDeploymentName, {
    mode: "Incremental",
    template: templates.foundryProject,
    parameters: {
      accountName: { value: n.accountName },
      projectName: { value: projectName },
      learnerId: { value: learnerId },
      expiresAt: { value: expiresAt },
    },
  }, false)

  return { deploymentName: n.projectDeploymentName, accountName: n.accountName, projectName, resourceGroup: rg, createdAt, expiresAt, platform: "foundry" }
}
