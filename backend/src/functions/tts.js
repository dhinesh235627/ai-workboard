import { app } from "@azure/functions"
import { mcpSpeak } from "../lib/mcpTts.js"

// POST { text, voiceId? } -> mp3 from Fish Audio. voiceId is the learner's own clone, or omitted to use the
// gendered default below (FISH_VOICE_MALE / FISH_VOICE_FEMALE, keyed by the Ava/Leo pick on the frontend).
// Azure Speech TTS was removed - Fish Audio is the only voice path now.
// Keys stay server-side: FISH_AUDIO_API_KEY, FISH_VOICE_MALE, FISH_VOICE_FEMALE (+ optional FISH_AUDIO_MODEL).
const audio = (buf) => ({ body: Buffer.from(buf), headers: { "Content-Type": "audio/mpeg" } })
const DEFAULT_VOICE_MALE = process.env.FISH_VOICE_MALE || "47eec8ee3b7941b58ef57b1b7294202e"
const DEFAULT_VOICE_FEMALE = process.env.FISH_VOICE_FEMALE || "c2623f0c075b4492ac367989aee1576f"

app.http("tts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tts",
  handler: async (req) => {
    const { text, voiceId, gender } = await req.json().catch(() => ({}))
    if (typeof text !== "string" || !text.trim() || text.length > 600) return { status: 400, body: "text required" }
    const voice = typeof voiceId === "string" && /^[\w-]{6,64}$/.test(voiceId) ? voiceId
      : gender === "male" ? DEFAULT_VOICE_MALE : DEFAULT_VOICE_FEMALE

    // Preferred path: the audio-mcp container (AUDIO_MCP_URL + AUDIO_MCP_TOKEN). Any failure falls back to the direct call below.
    if (process.env.AUDIO_MCP_URL && process.env.AUDIO_MCP_TOKEN) {
      try {
        return audio(await mcpSpeak({ text: text.trim(), provider: "fish_audio", voice }))
      } catch { /* fall through to the direct provider */ }
    }

    const { FISH_AUDIO_API_KEY, FISH_AUDIO_MODEL } = process.env
    if (!FISH_AUDIO_API_KEY) return { status: 503, body: "fish audio not configured" }
    const r = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FISH_AUDIO_API_KEY}`,
        "Content-Type": "application/json",
        model: FISH_AUDIO_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify({ text: text.trim(), reference_id: voice, format: "mp3" }),
    })
    return r.ok ? audio(await r.arrayBuffer()) : { status: 502, body: `fish ${r.status}` }
  },
})
