import { app } from "@azure/functions"

// POST { ssml } -> mp3. Key stays server-side (SPEECH_KEY, SPEECH_REGION).
app.http("tts", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tts",
  handler: async (req) => {
    const { ssml } = await req.json().catch(() => ({}))
    if (typeof ssml !== "string" || !ssml.startsWith("<speak") || ssml.length > 5000) {
      return { status: 400, body: "ssml required" }
    }
    const { SPEECH_KEY, SPEECH_REGION } = process.env
    const r = await fetch(`https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    })
    if (!r.ok) return { status: 502, body: `speech ${r.status}` }
    return { body: Buffer.from(await r.arrayBuffer()), headers: { "Content-Type": "audio/mpeg" } }
  },
})
