// Runs against a private Azurite (own port, own temp folder). Never starts a Functions
// host and imports no credential classes, so it cannot reach real Azure.
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"
import { BlobServiceClient } from "@azure/storage-blob"
import {
  CONTAINER_NAME, MAX_BODY_CHARS, MAX_IMAGE_BYTES, MAX_SLOTS, deleteExpired, handleSnapshot, readBodyCapped, saveSnapshot, validateSnapshot,
} from "../src/lib/proctor.js"

const PORT = 12100
const CONN =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  `BlobEndpoint=http://127.0.0.1:${PORT}/devstoreaccount1;`
const AZURITE = fileURLToPath(new URL("../node_modules/azurite/dist/src/blob/main.js", import.meta.url))

let proc, dir, container

const waitPort = (port) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const tryOnce = () => {
    const s = net.connect(port, "127.0.0.1")
    s.on("connect", () => { s.destroy(); resolve() })
    s.on("error", () => {
      s.destroy()
      if (Date.now() - t0 > 20000) reject(new Error("azurite did not start"))
      else setTimeout(tryOnce, 200)
    })
  }
  tryOnce()
})

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "azurite-proctor-"))
  proc = spawn(process.execPath, [AZURITE, "--blobPort", String(PORT), "--location", dir, "--silent", "--skipApiVersionCheck"], { stdio: "ignore" })
  await waitPort(PORT)
  container = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER_NAME)
})

after(() => {
  proc?.kill()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* azurite may still hold files */ }
})

const jpeg = (extra = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64 + extra, 7)])
const dataUrl = (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`
const LID = "11111111-2222-3333-4444-555555555555"
const body = (over = {}) => ({ learnerId: LID, sessionId: "sess-0001-aaaa", reason: "tab-switch", capturedAt: new Date().toISOString(), image: dataUrl(jpeg()), ...over })
let sessionCounter = 0
const freshSession = () => `sess-${String(++sessionCounter).padStart(4, "0")}-test`

test("validator accepts a valid JPEG snapshot", () => {
  const r = validateSnapshot(body())
  assert.equal(r.ok, true)
  assert.equal(r.value.bytes[0], 0xff)
})

test("validator rejects bad ids, bad reason, non-JPEG, wrong data URL, oversize", () => {
  for (const id of ["../x", "short", "has space 12345678", "ünïcödé-12345678", "a/b-12345678", "x".repeat(65)]) {
    assert.equal(validateSnapshot(body({ learnerId: id })).status, 400, `learnerId ${id}`)
    assert.equal(validateSnapshot(body({ sessionId: id })).status, 400, `sessionId ${id}`)
  }
  assert.equal(validateSnapshot(body({ reason: "flag" })).status, 400)
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(64)])
  assert.equal(validateSnapshot(body({ image: dataUrl(png) })).status, 400)
  assert.equal(validateSnapshot(body({ image: "data:image/png;base64,AAAA" })).status, 400)
  assert.equal(validateSnapshot(body({ image: "not a data url" })).status, 400)
  assert.equal(validateSnapshot(body({ image: dataUrl(jpeg(MAX_IMAGE_BYTES)) })).status, 413)
  assert.equal(validateSnapshot(null).status, 400)
})

test("implausible client time is replaced by server time", () => {
  const now = Date.parse("2026-10-03T10:00:00Z")
  assert.equal(validateSnapshot(body({ capturedAt: "1999-01-01T00:00:00Z" }), now).value.capturedAt, new Date(now).toISOString())
  assert.equal(validateSnapshot(body({ capturedAt: "garbage" }), now).value.capturedAt, new Date(now).toISOString())
})

test("upload lands at the expected path, is image/jpeg, and the container is private", async () => {
  const sess = freshSession()
  const res = await handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: sess })) }, container)
  assert.equal(res.status, 201)
  assert.equal(res.jsonBody.blobPath, `${CONTAINER_NAME}/${LID}/${sess}/000.jpg`)
  const props = await container.getBlockBlobClient(`${LID}/${sess}/000.jpg`).getProperties()
  assert.equal(props.contentType, "image/jpeg")
  assert.equal(props.metadata.reason, "tab-switch")
  const access = await container.getAccessPolicy()
  assert.ok(!access.blobPublicAccess, "container must have no public access")
})

test("handler returns 400/413 shapes and never leaks internals", async () => {
  assert.equal((await handleSnapshot({ bodyText: "{not json" }, container)).status, 400)
  assert.equal((await handleSnapshot({ bodyText: JSON.stringify(body({ learnerId: "../x" })) }, container)).status, 400)
  assert.equal((await handleSnapshot({ bodyText: "x", contentLength: 99 * 1024 * 1024 }, container)).status, 413)
  const broken = { createIfNotExists: async () => { throw new Error("secret connection string xyz") } }
  const r = await handleSnapshot({ bodyText: JSON.stringify(body()) }, broken)
  assert.equal(r.status, 500)
  assert.ok(!JSON.stringify(r.jsonBody).includes("secret"))
})

test(`120 concurrent uploads to one session yield exactly ${MAX_SLOTS} blobs and 20 x 429`, async () => {
  const sess = freshSession()
  const results = await Promise.all(
    Array.from({ length: 120 }, () => handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: sess })) }, container)),
  )
  const created = results.filter((r) => r.status === 201).length
  const limited = results.filter((r) => r.status === 429).length
  assert.equal(created, MAX_SLOTS)
  assert.equal(limited, 20)
  let n = 0
  for await (const _ of container.listBlobsFlat({ prefix: `${LID}/${sess}/` })) n++
  assert.equal(n, MAX_SLOTS)
  const paths = new Set(results.filter((r) => r.status === 201).map((r) => r.jsonBody.blobPath))
  assert.equal(paths.size, MAX_SLOTS, "no two requests may share a slot")
})

test("race near the limit: 99 existing + 5 concurrent -> exactly 1 more", async () => {
  const sess = freshSession()
  for (let i = 0; i < 99; i++) {
    const v = validateSnapshot(body({ sessionId: sess })).value
    const r = await saveSnapshot(container, v)
    assert.equal(r.ok, true)
  }
  const results = await Promise.all(
    Array.from({ length: 5 }, () => handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: sess })) }, container)),
  )
  assert.equal(results.filter((r) => r.status === 201).length, 1)
  assert.equal(results.filter((r) => r.status === 429).length, 4)
})

test("different sessions and learners have independent caps", async () => {
  const a = await handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: freshSession() })) }, container)
  const b = await handleSnapshot({ bodyText: JSON.stringify(body({ learnerId: "99999999-8888-7777-6666-555555555555", sessionId: freshSession() })) }, container)
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  assert.ok(b.jsonBody.blobPath.includes("99999999-8888-7777-6666-555555555555"))
})

test("retention: deleteExpired removes a blob older than 30 days and keeps a fresh one", async () => {
  const sess = freshSession()
  await handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: sess })) }, container)
  // Nothing is old yet.
  assert.equal(await deleteExpired(container, Date.now(), 30), 0)
  const exists = (name) => container.getBlockBlobClient(name).exists()
  assert.equal(await exists(`${LID}/${sess}/000.jpg`), true)
  // Pretend it is 31 days later: every blob uploaded so far is now expired.
  const removed = await deleteExpired(container, Date.now() + 31 * 24 * 60 * 60 * 1000, 30)
  assert.ok(removed >= 1)
  assert.equal(await exists(`${LID}/${sess}/000.jpg`), false)
  // A blob uploaded afterwards is fresh relative to "now" and survives.
  const r2 = await handleSnapshot({ bodyText: JSON.stringify(body({ sessionId: freshSession() })) }, container)
  assert.equal(await deleteExpired(container, Date.now(), 30), 0)
  assert.equal(await exists(r2.jsonBody.blobPath.replace(`${CONTAINER_NAME}/`, "")), true)
})

test("readBodyCapped: reads a normal body, and stops early on an oversized chunked body", async () => {
  const stream = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close() } })
  assert.equal(await readBodyCapped(stream(["ab", "cd"]), 100), "abcd")
  assert.equal(await readBodyCapped(null, 100), "")
  // No Content-Length is ever consulted: the cap is enforced while reading.
  let pulled = 0
  const endless = new ReadableStream({ pull(c) { pulled++; c.enqueue(new TextEncoder().encode("x".repeat(1000))) } })
  assert.equal(await readBodyCapped(endless, 5000), null)
  assert.ok(pulled < 20, "stopped reading soon after the limit (pulled " + pulled + " chunks)")
  assert.ok(MAX_BODY_CHARS > 1_000_000)
})
