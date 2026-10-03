// The one shared record of the learner's active lab (all tabs of this browser share it).
// Every write goes through the same Web Lock as a compare-and-set on `opId`, so a delayed
// result from one tab can never erase or overwrite a newer operation claimed by another.
// Pure and dependency-injected (locks, storage, clock) so it runs under `node --test`;
// uses only erasable TypeScript.

export const LAB_KEY = 'aiwb.lab.v1'
export const LOCK_NAME = 'aiwb-lab-provision'
const PROBE_KEY = 'aiwb.probe'
// A record that never learns its expiry (the provision call never returned) must not block
// the learner forever.
const MAX_UNSCHEDULED_AGE_MS = 3 * 60 * 60 * 1000

export type Phase = 'requesting' | 'polling' | 'ready'

export type LabRecord = {
  opId: string
  plat: string
  phase: Phase
  createdAt: number
  deploymentName?: string | null
  storageAccountName?: string | null
  accountName?: string | null
  projectName?: string | null
  portalUrl?: string | null
  expiresAt?: string | null
  // The tab that currently has the provision request in flight, and when it last said so. Other
  // tabs wait instead of re-sending while that heartbeat is fresh.
  ownerTab?: string
  heartbeatAt?: number
}

export const HEARTBEAT_STALE_MS = 6000

export function isLiveElsewhere(rec: LabRecord, myTab: string, now: number): boolean {
  if (rec.phase !== 'requesting' || !rec.ownerTab || rec.ownerTab === myTab) return false
  return now - (rec.heartbeatAt ?? rec.createdAt) < HEARTBEAT_STALE_MS
}

type KeyValueStore = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void }
type Locks = { request: <T>(name: string, cb: () => Promise<T> | T) => Promise<T> }

export type Env = { locks: Locks | null; storage: KeyValueStore | null; now: () => number }

// Durable AND atomic claims are required for paid provisioning. If either is missing we
// fail closed instead of falling back to something weaker.
export function storageUsable(storage: KeyValueStore | null): boolean {
  if (!storage) return false
  try {
    const token = String(Math.random())
    storage.setItem(PROBE_KEY, token)
    const ok = storage.getItem(PROBE_KEY) === token
    storage.removeItem(PROBE_KEY)
    return ok
  } catch {
    return false
  }
}

export function canTrack(env: Env): boolean {
  return !!env.locks && storageUsable(env.storage)
}

const PHASES = new Set(['requesting', 'polling', 'ready'])

export function readRecord(env: Env): LabRecord | null {
  try {
    const raw = env.storage?.getItem(LAB_KEY)
    if (!raw) return null
    const r = JSON.parse(raw)
    if (!r || typeof r.opId !== 'string' || typeof r.plat !== 'string' || !PHASES.has(r.phase)) return null
    return { ...r, createdAt: Number.isFinite(r.createdAt) ? r.createdAt : 0 }
  } catch {
    return null
  }
}

export function isExpired(rec: LabRecord, now: number): boolean {
  if (rec.expiresAt) {
    const t = Date.parse(rec.expiresAt)
    if (Number.isFinite(t)) return now >= t
  }
  return now > rec.createdAt + MAX_UNSCHEDULED_AGE_MS
}

function write(env: Env, rec: LabRecord) {
  env.storage!.setItem(LAB_KEY, JSON.stringify(rec))
}

function locked<T>(env: Env, fn: () => T): Promise<T> {
  if (!env.locks) return Promise.reject(new Error('locks unavailable'))
  return env.locks.request(LOCK_NAME, fn)
}

export type ClaimResult =
  | { ok: true; record: LabRecord }
  | { ok: false; reason: 'active'; record: LabRecord }
  | { ok: false; reason: 'unsupported' }

// Atomic claim: inside the lock, read the record; if a live lab exists report it, otherwise
// persist the new operation BEFORE anything is sent to the server.
export async function claimLab(env: Env, opId: string, plat: string, ownerTab?: string): Promise<ClaimResult> {
  if (!canTrack(env)) return { ok: false, reason: 'unsupported' }
  return locked(env, () => {
    const now = env.now()
    const cur = readRecord(env)
    if (cur && !isExpired(cur, now)) return { ok: false as const, reason: 'active' as const, record: cur }
    const record: LabRecord = { opId, plat, phase: 'requesting', createdAt: now, ownerTab, heartbeatAt: now }
    write(env, record)
    return { ok: true as const, record }
  })
}

// Compare-and-set: apply only if the stored opId is still the operation that produced the
// result. Returns the new record, or null when the result is stale and was dropped.
export function updateLab(env: Env, opId: string, patch: Partial<LabRecord>): Promise<LabRecord | null> {
  return locked(env, () => {
    const cur = readRecord(env)
    if (!cur || cur.opId !== opId) return null
    const next: LabRecord = { ...cur, ...patch, opId: cur.opId }
    write(env, next)
    return next
  })
}

// Atomic takeover of an in-flight request whose owner went quiet: inside the lock, succeed only
// if the record is STILL this operation, STILL requesting and STILL not live elsewhere, and in
// the same step make this tab the owner. Two waiting tabs can therefore never both take over.
export function takeOver(env: Env, opId: string, myTab: string): Promise<boolean> {
  return locked(env, () => {
    const now = env.now()
    const cur = readRecord(env)
    if (!cur || cur.opId !== opId || cur.phase !== 'requesting' || isLiveElsewhere(cur, myTab, now)) return false
    write(env, { ...cur, ownerTab: myTab, heartbeatAt: now })
    return true
  })
}

// Compare-and-delete (terminal result, expiry cleanup). Same rule: only the owning op clears.
export function clearLab(env: Env, opId: string): Promise<boolean> {
  return locked(env, () => {
    const cur = readRecord(env)
    if (!cur || cur.opId !== opId) return false
    env.storage!.removeItem(LAB_KEY)
    return true
  })
}
