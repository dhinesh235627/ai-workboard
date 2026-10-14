import test from 'node:test'
import assert from 'node:assert/strict'
import { armGuide, extensionVersion } from './guide.ts'

test('armGuide dispatches aiwb:guide ON THE GIVEN TARGET with the JSON payload', () => {
  const target = new EventTarget()
  const seen: { type: string; detail: string }[] = []
  target.addEventListener('aiwb:guide', (e) => seen.push({ type: e.type, detail: (e as CustomEvent).detail }))
  armGuide(true, 'labfoundryabc12345', target as unknown as { dispatchEvent: (e: Event) => boolean })
  armGuide(false, '', target as unknown as { dispatchEvent: (e: Event) => boolean })
  assert.equal(seen.length, 2)
  assert.deepEqual(JSON.parse(seen[0].detail), { on: true, account: 'labfoundryabc12345' })
  assert.deepEqual(JSON.parse(seen[1].detail), { on: false, account: '' })
  assert.equal(typeof seen[0].detail, 'string', 'a string detail is what crosses into the extension world')
})

test('the default target is window (the bridge listens on window, not document)', () => {
  const calls: string[] = []
  const fakeWindow = { dispatchEvent: (e: Event) => { calls.push(e.type); return true } }
  ;(globalThis as any).window = fakeWindow
  try {
    armGuide(true, 'x')
  } finally {
    delete (globalThis as any).window
  }
  assert.deepEqual(calls, ['aiwb:guide'])
})

test('extensionVersion: null when not installed, the version when the bridge marked the page', () => {
  assert.equal(extensionVersion({ dataset: {} }), null)
  assert.equal(extensionVersion({ dataset: { aiwbExt: '0.3.0' } }), '0.3.0')
})
