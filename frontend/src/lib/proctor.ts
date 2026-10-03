// Tab-switch snapshots: capture one camera frame and upload it. Everything that touches
// the browser (fetch, storage, canvas, uuid) is injected so this runs under `node --test`
// and uses only erasable TypeScript.

const ID_RE = /^[A-Za-z0-9-]{8,64}$/
const STORAGE_KEY = 'aiwb.learnerId'

type KeyValueStore = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

// Anonymous per-browser id (there is no login yet). Stable across calls and across reloads
// when storage works; if storage throws it is stable for the life of the page instead.
const memo: { id: string | null } = { id: null }

export function getLearnerId(store: KeyValueStore | null, uuid: () => string, m = memo): string {
  if (m.id) return m.id
  try {
    const saved = store?.getItem(STORAGE_KEY) ?? null
    if (saved && ID_RE.test(saved)) return (m.id = saved)
  } catch { /* storage unavailable: fall through to a fresh id */ }
  const fresh = uuid()
  m.id = fresh
  try { store?.setItem(STORAGE_KEY, fresh) } catch { /* in-memory only */ }
  return fresh
}

export const newSessionId = (uuid: () => string): string => uuid()

// Draws the current frame to a canvas and returns a JPEG data URL, or null if the video has
// no frame yet.
export function captureFrame(
  video: { readyState: number; videoWidth: number; videoHeight: number },
  createCanvas: () => { width: number; height: number; getContext: (t: '2d') => { drawImage: (image: any, dx: number, dy: number, dw: number, dh: number) => void } | null; toDataURL: (t: string, q: number) => string },
): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
  const canvas = createCanvas()
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export type UploadResult = 'skipped' | 'uploaded' | 'failed'

export type SnapshotDeps = {
  fetchFn: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>
  apiBase: string
  learnerId: string
  sessionId: string
  capture: () => string | null
  now?: () => number
}

// Capture happens synchronously (before the first await) so the frame is the one on screen
// at the moment the tab was left. Nothing is captured or sent unless the camera is running
// AND the learner turned "Snapshot on flag" on. A failed upload keeps the in-memory copy.
export async function captureAndUpload(
  enabled: boolean,
  running: boolean,
  deps: SnapshotDeps,
): Promise<{ dataUrl: string | null; upload: UploadResult }> {
  if (!enabled || !running) return { dataUrl: null, upload: 'skipped' }
  const dataUrl = deps.capture()
  if (!dataUrl) return { dataUrl: null, upload: 'skipped' }
  try {
    const res = await deps.fetchFn(`${deps.apiBase}/proctor/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerId: deps.learnerId,
        sessionId: deps.sessionId,
        reason: 'tab-switch',
        capturedAt: new Date((deps.now ?? Date.now)()).toISOString(),
        image: dataUrl,
      }),
    })
    return { dataUrl, upload: res.status === 201 ? 'uploaded' : 'failed' }
  } catch {
    return { dataUrl, upload: 'failed' }
  }
}
