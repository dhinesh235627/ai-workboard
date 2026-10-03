import test from 'node:test'
import assert from 'node:assert/strict'
import { captureAndUpload, captureFrame, getLearnerId } from './proctor.ts'

const FRAME = 'data:image/jpeg;base64,/9j/AAAA'
const mkDeps = (over: Record<string, unknown> = {}) => {
  const calls: { url: string; body: any }[] = []
  let captured = 0
  const deps = {
    fetchFn: async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 201 } },
    apiBase: 'http://x/api', learnerId: 'learner-aaaa-1111', sessionId: 'sess-bbbb-2222',
    capture: () => { captured++; return FRAME },
    now: () => Date.parse('2026-10-03T10:00:00Z'),
    ...over,
  }
  return { deps: deps as any, calls, captured: () => captured }
}

test('uploads only when the camera is running AND the toggle is on', async () => {
  for (const [enabled, running] of [[false, true], [true, false], [false, false]] as const) {
    const t = mkDeps()
    const r = await captureAndUpload(enabled, running, t.deps)
    assert.equal(r.upload, 'skipped')
    assert.equal(r.dataUrl, null)
    assert.equal(t.calls.length, 0, `no request when enabled=${enabled} running=${running}`)
    assert.equal(t.captured(), 0, 'no frame is even captured')
  }
  const t = mkDeps()
  const r = await captureAndUpload(true, true, t.deps)
  assert.equal(r.upload, 'uploaded')
  assert.equal(t.calls.length, 1)
  assert.equal(t.calls[0].url, 'http://x/api/proctor/snapshot')
  assert.deepEqual(Object.keys(t.calls[0].body).sort(), ['capturedAt', 'image', 'learnerId', 'reason', 'sessionId'])
  assert.equal(t.calls[0].body.reason, 'tab-switch')
})

test('no frame available -> skipped, nothing sent', async () => {
  const t = mkDeps({ capture: () => null })
  const r = await captureAndUpload(true, true, t.deps)
  assert.equal(r.upload, 'skipped')
  assert.equal(t.calls.length, 0)
})

test('a failed upload keeps the in-memory copy and reports failed', async () => {
  for (const fetchFn of [async () => ({ status: 500 }), async () => ({ status: 429 }), async () => { throw new Error('offline') }]) {
    const t = mkDeps({ fetchFn })
    const r = await captureAndUpload(true, true, t.deps)
    assert.equal(r.upload, 'failed')
    assert.equal(r.dataUrl, FRAME, 'the local copy survives')
  }
})

test('the frame is captured synchronously, before any await', () => {
  let capturedAt = ''
  const order: string[] = []
  const p = captureAndUpload(true, true, mkDeps({ capture: () => { order.push('capture'); return FRAME } }).deps)
  order.push('after-call')
  capturedAt = order.join(',')
  assert.equal(capturedAt, 'capture,after-call')
  return p
})

test('getLearnerId is stable and valid; survives a throwing localStorage', () => {
  const mem: Record<string, string> = {}
  const good = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v } }
  let n = 0
  const uuid = () => `uuid-${String(++n).padStart(8, '0')}`
  const m1 = { id: null as string | null }
  const a = getLearnerId(good, uuid, m1)
  assert.equal(getLearnerId(good, uuid, m1), a)
  // A "reload": fresh memo, same storage -> same id
  assert.equal(getLearnerId(good, uuid, { id: null }), a)
  // A tampered / invalid stored id is replaced by a valid one
  mem['aiwb.learnerId'] = '../evil'
  assert.match(getLearnerId(good, uuid, { id: null }), /^[A-Za-z0-9-]{8,64}$/)

  const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  const m2 = { id: null as string | null }
  const b = getLearnerId(throwing, uuid, m2)
  assert.match(b, /^[A-Za-z0-9-]{8,64}$/)
  assert.equal(getLearnerId(throwing, uuid, m2), b, 'stable for the page even without storage')
  assert.match(getLearnerId(null, uuid, { id: null }), /^[A-Za-z0-9-]{8,64}$/)
})

test('captureFrame: returns null without a frame, a JPEG data URL with one', () => {
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toDataURL: (t: string) => `data:${t};base64,AAAA` })
  assert.equal(captureFrame({ readyState: 1, videoWidth: 640, videoHeight: 480 }, canvas), null)
  assert.equal(captureFrame({ readyState: 4, videoWidth: 0, videoHeight: 0 }, canvas), null)
  assert.equal(captureFrame({ readyState: 4, videoWidth: 640, videoHeight: 480 }, canvas), 'data:image/jpeg;base64,AAAA')
  assert.equal(captureFrame({ readyState: 4, videoWidth: 640, videoHeight: 480 }, () => ({ width: 0, height: 0, getContext: () => null, toDataURL: () => '' })), null)
})
