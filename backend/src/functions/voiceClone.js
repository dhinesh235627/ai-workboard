import { app } from "@azure/functions"
import { BlobServiceClient } from "@azure/storage-blob"
import { randomUUID } from "node:crypto"

const container = () => BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage).getContainerClient("cloned-voices")

// POST multipart { voices: <wav>, texts: <transcript> } -> { voiceId }
// Creates a private Fish Audio voice model from the learner's own recording (same /model call as SaaSH's
// fish_audio_engine.create_voice_profile). The key stays server-side: FISH_AUDIO_API_KEY.
app.http("voiceClone", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "voice-clone",
  handler: async (req) => {
    const { FISH_AUDIO_API_KEY } = process.env
    if (!FISH_AUDIO_API_KEY) return { status: 503, body: "cloned voice not configured" }

    const form = await req.formData().catch(() => null)
    const file = form?.get("voices")
    if (!file || typeof file === "string" || !file.size) return { status: 400, body: "voices file required" }
    if (file.size > 5 * 1024 * 1024) return { status: 413, body: "sample too large" }

    const out = new FormData()
    out.set("type", "tts")
    out.set("title", "learnly-team-voice")
    out.set("train_mode", "fast")
    out.set("visibility", "private")
    const texts = form.get("texts")
    if (typeof texts === "string" && texts) out.set("texts", texts.slice(0, 500))
    out.set("voices", file, "sample.wav")

    const r = await fetch("https://api.fish.audio/model", {
      method: "POST",
      headers: { Authorization: `Bearer ${FISH_AUDIO_API_KEY}` },
      body: out,
    })
    if (!r.ok) return { status: 502, body: `fish ${r.status}` }
    const { _id } = await r.json()
    if (!_id) return { status: 502, body: "fish: no voice id" }

    // One blob per person: voices/<person_id>.json (not browser-local). Azurite locally via AzureWebJobsStorage.
    const personId = randomUUID()
    const name = String(form.get("name") ?? "").trim().slice(0, 40) || "My voice"
    const body = JSON.stringify({ personId, name, voiceId: _id, createdAt: new Date().toISOString() })
    const c = container()
    await c.createIfNotExists()
    await c.getBlockBlobClient(`${personId}.json`).upload(body, body.length, { blobHTTPHeaders: { blobContentType: "application/json" } })
    return { jsonBody: { personId, name, voiceId: _id } }
  },
})

// GET -> [{ personId, name, voiceId }] every cloned voice saved in blob storage
app.http("voiceCloneList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "voice-clone",
  handler: async () => {
    const c = container()
    const out = []
    if (await c.exists()) {
      for await (const b of c.listBlobsFlat()) {
        const v = JSON.parse((await c.getBlobClient(b.name).downloadToBuffer()).toString())
        out.push({ personId: v.personId, name: v.name, voiceId: v.voiceId, createdAt: v.createdAt })
      }
    }
    return { jsonBody: out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  },
})
