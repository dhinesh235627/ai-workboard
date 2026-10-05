// Speaks through the audio-mcp container (streamable HTTP + bearer token). The token never leaves the
// backend. One MCP session per clip (initialize -> tools/call); ponytail: pool the session if latency matters.
const headers = (token, sid) => ({
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${token}`,
  ...(sid && { "Mcp-Session-Id": sid }),
})

async function rpc(url, token, sid, body) {
  const r = await fetch(url, { method: "POST", headers: headers(token, sid), body: JSON.stringify(body), signal: AbortSignal.timeout(25000) })
  if (!r.ok) throw new Error(`mcp ${r.status}`)
  const newSid = r.headers.get("mcp-session-id") ?? sid
  if (!("id" in body)) return { sid: newSid }
  const text = await r.text()
  const json = r.headers.get("content-type")?.includes("event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop()
    : text
  return { sid: newSid, msg: JSON.parse(json) }
}

// args: { text | ssml, provider?, voice? } -> mp3 Buffer
export async function mcpSpeak(args, { url = process.env.AUDIO_MCP_URL, token = process.env.AUDIO_MCP_TOKEN } = {}) {
  if (!url || !token) throw new Error("audio-mcp not configured")
  const init = await rpc(url, token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ai-workboard", version: "1" } },
  })
  await rpc(url, token, init.sid, { jsonrpc: "2.0", method: "notifications/initialized" })
  const { msg } = await rpc(url, token, init.sid, {
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "text_to_speech", arguments: { ...args, format: "mp3", cache: true } },
  })
  const res = msg.result
  if (!res || res.isError) throw new Error("mcp tts failed")
  const out = res.structuredContent ?? JSON.parse(res.content[0].text)
  if (out.base64) return Buffer.from(out.base64, "base64")
  const r = await fetch(out.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) })
  if (!r.ok) throw new Error(`mcp audio ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}
