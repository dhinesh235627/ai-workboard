// Fake ARM client only: no Azure, no credentials, no Functions host.
import test from "node:test"
import assert from "node:assert/strict"
import { OP_ID_RE, namesFor, provisionLab } from "../src/lib/foundryProvision.js"
import { computeStatus } from "../src/lib/labStatus.js"

const TEMPLATES = { storage: { t: "storage" }, foundryAccount: { t: "acct" }, foundryProject: { t: "proj" } }
const NOW = Date.parse("2026-10-03T10:00:00Z")
const OP = "op-11111111-2222"
const err = (statusCode, code) => Object.assign(new Error(code || String(statusCode)), { statusCode, code })

// In-memory deployments store with the behaviours the plan relies on.
function fakeArm({ preload = {}, states = {}, barrierName = null, barrierCount = 0 } = {}) {
  const store = new Map(Object.entries(preload))
  const calls = { create: [], createWait: [], get: [] }
  let arrivals = 0
  let release
  const barrier = new Promise((r) => { release = r })
  const record = (name, properties, state) => store.set(name, { properties: { ...properties, provisioningState: state } })
  return {
    store, calls,
    deployments: {
      async get(_rg, name) {
        calls.get.push(name)
        if (barrierName && name === barrierName && arrivals < barrierCount) {
          arrivals++
          if (arrivals === barrierCount) release()
          await barrier
        }
        const d = store.get(name)
        if (!d) throw err(404, "DeploymentNotFound")
        // Optionally walk a deployment through states on successive reads.
        const q = states[name]
        if (q && q.length) d.properties.provisioningState = q.shift()
        return structuredClone(d)
      },
      async beginCreateOrUpdate(_rg, name, { properties }) {
        calls.create.push(name)
        await Promise.resolve()
        if (store.has(name)) throw err(409, "DeploymentActive")
        record(name, properties, "Running")
      },
      async beginCreateOrUpdateAndWait(_rg, name, { properties }) {
        calls.createWait.push(name)
        await Promise.resolve()
        if (store.has(name)) throw err(409, "DeploymentActive")
        record(name, properties, "Succeeded")
      },
    },
  }
}

const base = (client, over = {}) => ({
  client, rg: "rg-test", templates: TEMPLATES, learnerId: "learner-aaaa-1111", platform: "foundry",
  operationId: OP, now: () => NOW, sleep: async () => {}, pollMs: 1, maxWaitMs: 50, ...over,
})

test("names are deterministic per operationId and differ between operations", () => {
  assert.deepEqual(namesFor(OP), namesFor(OP))
  assert.notEqual(namesFor(OP).accountName, namesFor("op-99999999-3333").accountName)
  assert.match(namesFor(OP).accountName, /^labfoundry[0-9a-f]{8}$/)
  assert.notEqual(namesFor(null).suffix, namesFor(null).suffix, "no operationId keeps the random behaviour")
  assert.ok(OP_ID_RE.test(OP))
  for (const bad of ["../x", "short", "a b c d e f g h", "x".repeat(65)]) assert.equal(OP_ID_RE.test(bad), false, bad)
})

test("first request creates one account deployment and one project deployment", async () => {
  const arm = fakeArm()
  const lab = await provisionLab(base(arm))
  assert.equal(arm.calls.createWait.length, 1)
  assert.equal(arm.calls.create.length, 1)
  assert.equal(lab.accountName, namesFor(OP).accountName)
  assert.equal(lab.expiresAt, new Date(NOW + 2 * 60 * 60 * 1000).toISOString())
})

test("same operationId again creates nothing and returns the SAME lab and expiry", async () => {
  const arm = fakeArm()
  const first = await provisionLab(base(arm))
  const later = await provisionLab(base(arm, { now: () => NOW + 30 * 60 * 1000 })) // 30 min on
  assert.equal(arm.calls.createWait.length, 1, "no second account deployment")
  assert.equal(arm.calls.create.length, 1, "no second project deployment")
  assert.deepEqual(later, first, "same names and same original expiresAt")
})

test("an account deployment still Running is waited for, then the project step runs", async () => {
  const names = namesFor(OP)
  const arm = fakeArm({
    preload: { [names.accountDeploymentName]: { properties: { parameters: { createdAt: { value: "c" }, expiresAt: { value: "e1" } } } } },
    states: { [names.accountDeploymentName]: ["Running", "Running", "Succeeded"] },
  })
  const lab = await provisionLab(base(arm))
  assert.equal(arm.calls.createWait.length, 0, "does not re-create the running deployment")
  assert.equal(arm.calls.create.length, 1, "project step proceeds after the wait")
  assert.equal(lab.expiresAt, "e1", "expiry read back from the existing deployment")
})

test("race: both first requests see NotFound, the loser follows the winner -> one set, same lab", async () => {
  const names = namesFor(OP)
  const arm = fakeArm({ barrierName: names.accountDeploymentName, barrierCount: 2 })
  // The two racers have DIFFERENT clocks: the loser must return the winner's timestamps, not its own.
  const [a, b] = await Promise.all([
    provisionLab(base(arm, { now: () => NOW })),
    provisionLab(base(arm, { now: () => NOW + 7 * 60 * 1000 })),
  ])
  assert.deepEqual(a, b)
  assert.ok([NOW, NOW + 7 * 60 * 1000].map((t) => new Date(t + 2 * 3600 * 1000).toISOString()).includes(a.expiresAt))
  assert.equal(arm.store.size, 2, "exactly one account + one project deployment exist")
  const winners = arm.calls.createWait.length
  assert.ok(winners >= 1 && winners <= 2, "second PUT may be attempted but is rejected as a conflict")
})

test("a failed existing deployment is reported as TERMINAL, not silently re-created", async () => {
  const names = namesFor(OP)
  for (const state of ["Failed", "Canceled"]) {
    const arm = fakeArm({ preload: { [names.accountDeploymentName]: { properties: { provisioningState: state } } } })
    await assert.rejects(provisionLab(base(arm)), (e) => e.terminal === true && /failed|canceled/.test(e.message))
    assert.equal(arm.calls.createWait.length, 0)
  }
})

test("FIRST request: the SDK poller throws a status-less Error after Azure marks the deployment Failed -> terminal", async () => {
  const names = namesFor(OP)
  const arm = fakeArm()
  arm.deployments.beginCreateOrUpdateAndWait = async (_rg, name, { properties }) => {
    arm.store.set(name, { properties: { ...properties, provisioningState: "Failed" } })
    throw new Error("The long-running operation has failed.") // no statusCode, like core-lro
  }
  await assert.rejects(provisionLab(base(arm)), (e) => e.terminal === true)
  assert.ok(arm.store.has(names.accountDeploymentName))
})

test("FIRST request rejected outright as invalid/unauthorised (400/403) is terminal; 500/429 is not", async () => {
  for (const [code, terminal] of [[403, true], [400, true], [500, false], [429, false]]) {
    const arm = fakeArm()
    arm.deployments.beginCreateOrUpdateAndWait = async () => { throw err(code, "Whatever") }
    await assert.rejects(provisionLab(base(arm)), (e) => Boolean(e.terminal) === terminal, `status ${code}`)
  }
})

test("a deployment that never finishes in time is NOT terminal (a retry may succeed)", async () => {
  const names = namesFor(OP)
  const arm = fakeArm({
    preload: { [names.accountDeploymentName]: { properties: { provisioningState: "Running" } } },
    states: { [names.accountDeploymentName]: Array(200).fill("Running") },
  })
  await assert.rejects(provisionLab(base(arm)), (e) => !e.terminal && /did not finish/.test(e.message))
})

test("a non-conflict create error propagates", async () => {
  const arm = fakeArm()
  arm.deployments.beginCreateOrUpdateAndWait = async () => { throw err(403, "AuthorizationFailed") }
  await assert.rejects(provisionLab(base(arm)), /AuthorizationFailed/)
})

test("storage-backed placeholder labs are idempotent too", async () => {
  const arm = fakeArm()
  const a = await provisionLab(base(arm, { platform: "copilot" }))
  const b = await provisionLab(base(arm, { platform: "copilot", now: () => NOW + 60 * 60 * 1000 }))
  assert.equal(arm.calls.create.length, 1)
  assert.deepEqual(a, b)
  assert.match(a.storageAccountName, /^labsa[0-9a-f]{8}$/)
})

// ---- status contract --------------------------------------------------------------
const present = async () => true
const gone = async () => false
const dep = (state) => async () => ({ properties: { provisioningState: state } })
const reject = (e) => async () => { throw e }
const FOUNDRY = { deploymentName: "lab-proj-1", accountName: "labfoundry1", projectName: "sandbox-project" }
const STORAGE = { deploymentName: "lab-1", storageAccountName: "labsa1" }

test("status: found deployment maps state to stage", async () => {
  for (const [state, stage] of [["Accepted", 0], ["Running", 1], ["Succeeded", 4], ["Failed", -1]]) {
    const r = await computeStatus({ getDeployment: dep(state), exists: present, ...FOUNDRY })
    assert.equal(r.status, 200)
    assert.equal(r.body.stage, stage)
  }
})

test("status: record missing but Foundry account STILL EXISTS -> 200 unverified, never 404", async () => {
  const r = await computeStatus({ getDeployment: reject(err(404)), exists: present, ...FOUNDRY })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { state: "unverified", stage: 1, resourceExists: true })
})

test("status: record missing but storage account STILL EXISTS -> 200 unverified", async () => {
  const r = await computeStatus({ getDeployment: reject(err(404)), exists: present, ...STORAGE })
  assert.equal(r.status, 200)
  assert.equal(r.body.state, "unverified")
})

test("status: record missing AND resource missing -> 404 missing", async () => {
  for (const ids of [FOUNDRY, STORAGE]) {
    const r = await computeStatus({ getDeployment: reject(err(404)), exists: gone, ...ids })
    assert.equal(r.status, 404)
    assert.equal(r.body.state, "missing")
  }
})

test("status: Succeeded but the resource was torn down -> 404 missing", async () => {
  const r = await computeStatus({ getDeployment: dep("Succeeded"), exists: gone, ...FOUNDRY })
  assert.equal(r.status, 404)
})

test("status: throttling, 5xx and network errors are retryable 503", async () => {
  const net = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
  for (const e of [err(429), err(503), err(500), net, new TypeError("fetch failed")]) {
    const r = await computeStatus({ getDeployment: reject(e), exists: present, ...FOUNDRY })
    assert.equal(r.status, 503)
    assert.equal(r.body.retryable, true)
  }
})

test("status: cannot establish existence while record is missing -> 503, never 404", async () => {
  const r = await computeStatus({ getDeployment: reject(err(404)), exists: reject(err(429)), ...FOUNDRY })
  assert.equal(r.status, 503)
  const r2 = await computeStatus({ getDeployment: reject(err(404)), exists: present, deploymentName: "x" }) // no identifiers
  assert.equal(r2.status, 503)
})

test("status: existence check failing after Succeeded -> 503", async () => {
  const r = await computeStatus({ getDeployment: dep("Succeeded"), exists: reject(err(500)), ...FOUNDRY })
  assert.equal(r.status, 503)
})

test("status: a credential/config error with no HTTP status is a plain 500, not 'reconnecting forever'", async () => {
  const cred = Object.assign(new Error("DefaultAzureCredential failed to retrieve a token"), { name: "CredentialUnavailableError" })
  const r = await computeStatus({ getDeployment: reject(cred), exists: present, ...FOUNDRY })
  assert.equal(r.status, 500)
  assert.ok(!JSON.stringify(r.body).includes("DefaultAzureCredential"))
})

test("status: auth/permission errors are a plain 500 without internals", async () => {
  const r = await computeStatus({ getDeployment: reject(err(403, "AuthorizationFailed secret")), exists: present, ...FOUNDRY })
  assert.equal(r.status, 500)
  assert.ok(!JSON.stringify(r.body).includes("secret"))
})
