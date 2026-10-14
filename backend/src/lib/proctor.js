// Tab-switch snapshot storage. Pure library: the container client is injected, and
// nothing here imports @azure/identity or @azure/arm-* (it can never touch ARM).

export const CONTAINER_NAME = "proctor-snapshots"
export const MAX_SLOTS = 100
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
// base64 inflates by 4/3; plus the JSON envelope.
export const MAX_BODY_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 2048
export const DEFAULT_RETENTION_DAYS = 30

const ID_RE = /^[A-Za-z0-9-]{8,64}$/
const DATA_URL_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/
const REASONS = new Set(["tab-switch"])
const DAY_MS = 24 * 60 * 60 * 1000

const bad = (status, error) => ({ ok: false, status, error })

// Returns { ok: true, value } or { ok: false, status, error }. `error` is safe to show.
export function validateSnapshot(body, nowMs = Date.now()) {
  if (!body || typeof body !== "object") return bad(400, "body must be a JSON object")
  const { learnerId, sessionId, reason, image } = body
  if (typeof learnerId !== "string" || !ID_RE.test(learnerId)) return bad(400, "invalid learnerId")
  if (typeof sessionId !== "string" || !ID_RE.test(sessionId)) return bad(400, "invalid sessionId")
  if (typeof reason !== "string" || !REASONS.has(reason)) return bad(400, "invalid reason")
  if (typeof image !== "string") return bad(400, "image must be a data URL")
  if (image.length > MAX_BODY_CHARS) return bad(413, "image too large")

  const m = DATA_URL_RE.exec(image)
  if (!m) return bad(400, "image must be a base64 JPEG data URL")
  const bytes = Buffer.from(m[1], "base64")
  if (bytes.length > MAX_IMAGE_BYTES) return bad(413, "image too large")
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return bad(400, "image is not a JPEG")
  }

  // The client clock is only a hint: keep it if it is plausible, else use ours.
  const claimed = typeof body.capturedAt === "string" ? Date.parse(body.capturedAt) : NaN
  const capturedAtMs = Number.isFinite(claimed) && Math.abs(claimed - nowMs) <= DAY_MS ? claimed : nowMs

  return { ok: true, value: { learnerId, sessionId, reason, bytes, capturedAt: new Date(capturedAtMs).toISOString() } }
}

const slotName = (v, n) => `${v.learnerId}/${v.sessionId}/${String(n).padStart(3, "0")}.jpg`
const alreadyExists = (err) => err && (err.statusCode === 409 || err.statusCode === 412)

// Atomic cap: each of the 100 slot names is created with If-None-Match: *, so two
// concurrent requests can never both take the same slot and the 101st can never fit.
// The listing only picks where to start looking; correctness comes from the condition.
export async function saveSnapshot(container, v, nowMs = Date.now()) {
  await container.createIfNotExists() // private: no public access

  let taken = 0
  for await (const _ of container.listBlobsFlat({ prefix: `${v.learnerId}/${v.sessionId}/` })) {
    if (++taken >= MAX_SLOTS) break
  }
  const order = []
  for (let i = taken; i < MAX_SLOTS; i++) order.push(i)
  for (let i = 0; i < Math.min(taken, MAX_SLOTS); i++) order.push(i)

  for (const n of order) {
    const blob = container.getBlockBlobClient(slotName(v, n))
    try {
      await blob.upload(v.bytes, v.bytes.length, {
        blobHTTPHeaders: { blobContentType: "image/jpeg" },
        metadata: { reason: v.reason, capturedAt: v.capturedAt, uploadedAt: new Date(nowMs).toISOString() },
        conditions: { ifNoneMatch: "*" },
      })
      return { ok: true, blobPath: `${CONTAINER_NAME}/${slotName(v, n)}` }
    } catch (err) {
      if (alreadyExists(err)) continue
      throw err
    }
  }
  return { ok: false, status: 429, error: "snapshot limit reached for this session" }
}

// Reads a request body but gives up as soon as it exceeds `max` characters, so a chunked
// request without Content-Length cannot make the anonymous endpoint buffer an unbounded body.
// Returns the text, or null when the limit was exceeded.
export async function readBodyCapped(body, max = MAX_BODY_CHARS) {
  if (!body) return ""
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (text.length > max) {
        await reader.cancel().catch(() => {})
        return null
      }
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock?.()
  }
  return text
}

// Request-shaped wrapper so the HTTP function stays a thin shell and tests can call
// it without a Functions host.
export async function handleSnapshot({ bodyText, contentLength }, container, nowMs = Date.now()) {
  if (contentLength && contentLength > MAX_BODY_CHARS) return { status: 413, jsonBody: { error: "image too large" } }
  if (typeof bodyText === "string" && bodyText.length > MAX_BODY_CHARS) {
    return { status: 413, jsonBody: { error: "image too large" } }
  }
  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    return { status: 400, jsonBody: { error: "body must be JSON" } }
  }
  const checked = validateSnapshot(body, nowMs)
  if (!checked.ok) return { status: checked.status, jsonBody: { error: checked.error } }
  try {
    const saved = await saveSnapshot(container, checked.value, nowMs)
    if (!saved.ok) return { status: saved.status, jsonBody: { error: saved.error } }
    return { status: 201, jsonBody: { blobPath: saved.blobPath } }
  } catch {
    return { status: 500, jsonBody: { error: "could not store snapshot" } }
  }
}

// Enforces the retention the Setup page promises. Scoped to the one container.
export async function deleteExpired(container, nowMs = Date.now(), days = DEFAULT_RETENTION_DAYS) {
  const cutoff = nowMs - days * DAY_MS
  let deleted = 0
  for await (const item of container.listBlobsFlat()) {
    const modified = item.properties?.lastModified?.getTime?.()
    if (typeof modified === "number" && modified < cutoff) {
      await container.deleteBlob(item.name)
      deleted++
    }
  }
  return deleted
}
