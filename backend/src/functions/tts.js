import { app } from "@azure/functions"

// POST { ssml }            -> mp3 from Azure Speech (Ava / Leo)
// POST { text, clone:true } -> mp3 from Fish Audio (team cloned voice, same call as SaaSH's fish_audio_engine)
// Keys stay server-side: SPEECH_KEY, SPEECH_REGION, FISH_AUDIO_API_KEY, FISH_VOICE_ID (+ optional FISH_AUDIO_MODEL).
const audio = (buf) => ({ body: Buffer.from(buf), headers: { "Content-Type": "audio/mpeg" } })

app.http("tts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tts",
  handler: async (req) => {
    const { ssml, text, clone, voiceId } = await req.json().catch(() => ({}))

    if (clone) {
      const { FISH_AUDIO_API_KEY, FISH_AUDIO_MODEL } = process.env
      const voice = typeof voiceId === "string" && /^[\w-]{6,64}$/.test(voiceId) ? voiceId : process.env.FISH_VOICE_ID // learner's own clone, else team default
      if (typeof text !== "string" || !text.trim() || text.length > 600) return { status: 400, body: "text required" }
      if (!FISH_AUDIO_API_KEY || !voice) return { status: 503, body: "cloned voice not configured" }
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
    }

    if (typeof ssml !== "string" || !ssml.startsWith("<speak") || ssml.length > 5000) {
      return { status: 400, body: "ssml required" }
    }
    const { SPEECH_KEY, SPEECH_REGION } = process.env
    if (!SPEECH_KEY || !SPEECH_REGION) return { status: 503, body: "speech not configured" }
    const r = await fetch(`https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    })
    return r.ok ? audio(await r.arrayBuffer()) : { status: 502, body: `speech ${r.status}` }
  },
})
