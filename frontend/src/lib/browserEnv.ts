import type { Env } from './labStore'

// The real browser's lock manager, storage and clock for labStore. Shared by /labs and /setup.
export function browserEnv(): Env {
  let storage: Env['storage'] = null
  try { storage = window.localStorage } catch { storage = null }
  return { locks: (navigator as unknown as { locks?: Env['locks'] }).locks ?? null, storage, now: () => Date.now() }
}
