import { app } from "@azure/functions"
import { BlobServiceClient } from "@azure/storage-blob"
import { CONTAINER_NAME, MAX_BODY_CHARS, handleSnapshot, readBodyCapped } from "../lib/proctor.js"

// Local: Azurite (via AzureWebJobsStorage). Deployed: set PROCTOR_STORAGE_CONNECTION to
// a dedicated account, or it falls back to the app's own storage account.
function container() {
  const conn = process.env.PROCTOR_STORAGE_CONNECTION || process.env.AzureWebJobsStorage
  if (!conn) return null
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER_NAME)
}

app.http("proctorSnapshot", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "proctor/snapshot",
  handler: async (request, context) => {
    const c = container()
    if (!c) return { status: 500, jsonBody: { error: "snapshot storage is not configured" } }
    const contentLength = Number(request.headers.get("content-length")) || 0
    // Stop reading as soon as the body is too big, whether or not Content-Length was sent.
    const bodyText = contentLength > MAX_BODY_CHARS ? null : await readBodyCapped(request.body, MAX_BODY_CHARS)
    if (bodyText === null) return { status: 413, jsonBody: { error: "image too large" } }
    const res = await handleSnapshot({ bodyText, contentLength }, c)
    if (res.status >= 500) context.error("proctor snapshot failed")
    return res
  },
})
