import test from "node:test"
import assert from "node:assert/strict"
import { mcpSpeak } from "../src/lib/mcpTts.js"

// A fake MCP server: initialize (JSON + session id), initialized notification, tools/call (SSE reply, inline base64).
test("mcpSpeak: handshake, tool call over SSE, bearer token, session id", async () => {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ method: body.method, auth: init.headers.Authorization, sid: init.headers["Mcp-Session-Id"], args: body.params?.arguments })
    if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { headers: { "mcp-session-id": "S1", "content-type": "application/json" } })
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 })
    const payload = { jsonrpc: "2.0", id: 2, result: { structuredContent: { base64: Buffer.from("MP3").toString("base64") } } }
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, { headers: { "content-type": "text/event-stream" } })
  }
  try {
    const buf = await mcpSpeak({ text: "hi", provider: "fish_audio" }, { url: "http://x/mcp", token: "T" })
    assert.equal(buf.toString(), "MP3")
    assert.deepEqual(calls.map((c) => c.method), ["initialize", "notifications/initialized", "tools/call"])
    assert.ok(calls.every((c) => c.auth === "Bearer T"))
    assert.equal(calls[2].sid, "S1")
    assert.equal(calls[2].args.format, "mp3")
  } finally {
    globalThis.fetch = realFetch
  }
})

test("mcpSpeak: not configured throws", async () => {
  await assert.rejects(mcpSpeak({ text: "x" }, { url: "", token: "" }), /not configured/)
})
