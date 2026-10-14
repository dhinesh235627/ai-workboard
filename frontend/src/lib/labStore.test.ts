import test from 'node:test'
import assert from 'node:assert/strict'
import { HEARTBEAT_STALE_MS, LAB_KEY, canTrack, claimLab, clearLab, isExpired, isLiveElsewhere, readRecord, storageUsable, takeOver, updateLab } from './labStore.ts'

// A real mutex with a microtask-scheduled queue, like navigator.locks.
function makeLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    request: <T>(_name: string, cb: () => Promise<T> | T): Promise<T> => {
      const run = tail.then(() => cb())
      tail = run.catch(() => {})
      return run as Promise<T>
    },
  }
}
const makeStorage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m }
}
// Two "tabs": separate Env objects sharing ONE storage and ONE lock manager.
function twoTabs(clock = { t: 1_000_000 }) {
  const storage = makeStorage()
  const locks = makeLocks()
  const mk = () => ({ locks, storage, now: () => clock.t })
  return { a: mk(), b: mk(), storage, clock }
}

test('a claim is persisted before anything else can happen, and a second claim sees it', async () => {
  const { a, b } = twoTabs()
  const [r1, r2] = await Promise.all([claimLab(a, 'op-aaaaaaaa', 'foundry'), claimLab(b, 'op-bbbbbbbb', 'foundry')])
  assert.equal(Number(r1.ok) + Number(r2.ok), 1, 'exactly one tab wins the race')
  const loser = r1.ok ? r2 : r1
  assert.equal(loser.ok, false)
  assert.equal((loser as any).reason, 'active')
  assert.equal(readRecord(a)!.opId, r1.ok ? 'op-aaaaaaaa' : 'op-bbbbbbbb')
})

test('fail closed: no Web Locks -> unsupported, nothing written', async () => {
  const storage = makeStorage()
  const env = { locks: null, storage, now: () => 1 }
  assert.equal(canTrack(env), false)
  const r = await claimLab(env, 'op-aaaaaaaa', 'foundry')
  assert.deepEqual(r, { ok: false, reason: 'unsupported' })
  assert.equal(storage.raw.size, 0)
})

test('fail closed: storage that throws on write -> unsupported', async () => {
  const throwing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => {} }
  const env = { locks: makeLocks(), storage: throwing, now: () => 1 }
  assert.equal(storageUsable(throwing), false)
  assert.equal(canTrack(env), false)
  assert.deepEqual(await claimLab(env, 'op-aaaaaaaa', 'foundry'), { ok: false, reason: 'unsupported' })
})

test('fail closed: storage that accepts writes but cannot read them back -> unsupported', () => {
  const lossy = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  assert.equal(storageUsable(lossy), false)
  assert.equal(storageUsable(null), false)
})

test('STALE RESULT: delayed terminal result for A must not erase B claimed by another tab', async () => {
  const { a, b, clock } = twoTabs()
  // Both tabs are tracking operation A.
  assert.equal((await claimLab(a, 'op-AAAAAAAA', 'foundry')).ok, true)
  await updateLab(a, 'op-AAAAAAAA', { phase: 'polling', expiresAt: new Date(clock.t + 3600_000).toISOString() })
  // Tab 1 gets the terminal result first: clears A, claims B.
  assert.equal(await clearLab(a, 'op-AAAAAAAA'), true)
  assert.equal((await claimLab(a, 'op-BBBBBBBB', 'foundry')).ok, true)
  // Tab 2's delayed terminal result for A arrives now. Its tab-local opId still equals A.
  assert.equal(await clearLab(b, 'op-AAAAAAAA'), false, 'delayed clear for A is dropped')
  assert.equal(readRecord(a)!.opId, 'op-BBBBBBBB', 'B stays persisted')
  // A delayed phase update and a delayed expiry cleanup for A are dropped as well.
  assert.equal(await updateLab(b, 'op-AAAAAAAA', { phase: 'ready' }), null)
  assert.equal(readRecord(a)!.phase, 'requesting')
  assert.equal(await clearLab(b, 'op-AAAAAAAA'), false)
  // And a third provision is blocked because B is live.
  const third = await claimLab(b, 'op-CCCCCCCC', 'foundry')
  assert.equal(third.ok, false)
  assert.equal((third as any).record.opId, 'op-BBBBBBBB')
})

test('the owning op can update and clear its own record', async () => {
  const { a } = twoTabs()
  await claimLab(a, 'op-AAAAAAAA', 'foundry')
  const next = await updateLab(a, 'op-AAAAAAAA', { phase: 'polling', deploymentName: 'lab-proj-1', accountName: 'acct1', expiresAt: new Date(2_000_000).toISOString() })
  assert.equal(next!.phase, 'polling')
  assert.equal(next!.opId, 'op-AAAAAAAA', 'opId cannot be overwritten by a patch')
  assert.equal(readRecord(a)!.deploymentName, 'lab-proj-1')
  assert.equal(await clearLab(a, 'op-AAAAAAAA'), true)
  assert.equal(readRecord(a), null)
})

test('an expired record no longer blocks a new claim; an unexpired one does', async () => {
  const { a, clock } = twoTabs()
  await claimLab(a, 'op-AAAAAAAA', 'foundry')
  await updateLab(a, 'op-AAAAAAAA', { expiresAt: new Date(clock.t + 60_000).toISOString() })
  assert.equal((await claimLab(a, 'op-BBBBBBBB', 'foundry')).ok, false)
  clock.t += 61_000
  assert.equal(isExpired(readRecord(a)!, clock.t), true)
  assert.equal((await claimLab(a, 'op-BBBBBBBB', 'foundry')).ok, true)
})

test('a request that never learned its expiry stops blocking after 3 hours', async () => {
  const { a, clock } = twoTabs()
  await claimLab(a, 'op-AAAAAAAA', 'foundry')
  clock.t += 2 * 3600_000
  assert.equal((await claimLab(a, 'op-BBBBBBBB', 'foundry')).ok, false)
  clock.t += 2 * 3600_000
  assert.equal((await claimLab(a, 'op-BBBBBBBB', 'foundry')).ok, true)
})

test('a corrupt or foreign value in storage is ignored, not trusted', async () => {
  const { a, storage } = twoTabs()
  for (const junk of ['not json', '{"opId":5}', '{"opId":"x","plat":"p","phase":"weird"}', 'null']) {
    storage.setItem(LAB_KEY, junk)
    assert.equal(readRecord(a), null, junk)
  }
  assert.equal((await claimLab(a, 'op-AAAAAAAA', 'foundry')).ok, true)
})

test('many tabs racing: still exactly one claim', async () => {
  const { a, storage } = twoTabs()
  const tabs = Array.from({ length: 8 }, () => ({ ...a }))
  const res = await Promise.all(tabs.map((t, i) => claimLab(t, `op-${String(i).padStart(8, '0')}`, 'foundry')))
  assert.equal(res.filter((r) => r.ok).length, 1)
  assert.ok(storage.raw.has(LAB_KEY))
})

test('ownerTab + heartbeat: another live tab is detected, a stale or own record is not', async () => {
  const { a, clock } = twoTabs()
  const r = await claimLab(a, 'op-AAAAAAAA', 'foundry', 'tab-1')
  assert.equal(r.ok, true)
  const rec = readRecord(a)!
  assert.equal(rec.ownerTab, 'tab-1')
  assert.equal(isLiveElsewhere(rec, 'tab-2', clock.t + 1000), true, 'tab 2 must wait: tab 1 is alive')
  assert.equal(isLiveElsewhere(rec, 'tab-1', clock.t + 1000), false, 'the owner itself is not "elsewhere"')
  assert.equal(isLiveElsewhere(rec, 'tab-2', clock.t + HEARTBEAT_STALE_MS + 1), false, 'a stopped heartbeat means the owner is gone: resume')
  // a heartbeat refresh keeps it live
  await updateLab(a, 'op-AAAAAAAA', { heartbeatAt: clock.t + 5000 })
  assert.equal(isLiveElsewhere(readRecord(a)!, 'tab-2', clock.t + 9000), true)
  // only the requesting phase can be "in flight"
  await updateLab(a, 'op-AAAAAAAA', { phase: 'polling' })
  assert.equal(isLiveElsewhere(readRecord(a)!, 'tab-2', clock.t + 1000), false)
})

test('takeOver is atomic: two waiting tabs racing for a stale request -> exactly one wins', async () => {
  const { a, b, clock } = twoTabs()
  await claimLab(a, 'op-AAAAAAAA', 'foundry', 'owner-tab')
  clock.t += HEARTBEAT_STALE_MS + 1000 // the owner's heartbeat stopped
  const [r1, r2, r3] = await Promise.all([takeOver(a, 'op-AAAAAAAA', 'tab-B'), takeOver(b, 'op-AAAAAAAA', 'tab-C'), takeOver(a, 'op-AAAAAAAA', 'tab-D')])
  assert.equal([r1, r2, r3].filter(Boolean).length, 1, 'exactly one takeover succeeds')
  assert.ok(['tab-B', 'tab-C', 'tab-D'].includes(readRecord(a)!.ownerTab!))
})

test('takeOver refuses a live owner, another operation, a finished phase, and a missing record', async () => {
  const { a, clock } = twoTabs()
  await claimLab(a, 'op-AAAAAAAA', 'foundry', 'owner-tab')
  assert.equal(await takeOver(a, 'op-AAAAAAAA', 'tab-B'), false, 'owner heartbeat is fresh')
  clock.t += HEARTBEAT_STALE_MS + 1000
  assert.equal(await takeOver(a, 'op-OTHER000', 'tab-B'), false, 'different operation')
  await updateLab(a, 'op-AAAAAAAA', { phase: 'polling' })
  assert.equal(await takeOver(a, 'op-AAAAAAAA', 'tab-B'), false, 'no longer requesting')
  await clearLab(a, 'op-AAAAAAAA')
  assert.equal(await takeOver(a, 'op-AAAAAAAA', 'tab-B'), false, 'record is gone')
})
