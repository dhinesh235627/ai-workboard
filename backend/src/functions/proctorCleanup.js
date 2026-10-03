import { app } from "@azure/functions"
import { BlobServiceClient } from "@azure/storage-blob"
import { CONTAINER_NAME, DEFAULT_RETENTION_DAYS, deleteExpired } from "../lib/proctor.js"

// Enforces the "deleted after 30 days" promise on the Setup page. Only ever touches the
// proctor-snapshots container of the configured storage account.
app.timer("proctorCleanup", {
  schedule: "0 30 3 * * *", // daily 03:30
  handler: async (_timer, context) => {
    const conn = process.env.PROCTOR_STORAGE_CONNECTION || process.env.AzureWebJobsStorage
    if (!conn) return
    const days = Number(process.env.PROCTOR_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS
    const container = BlobServiceClient.fromConnectionString(conn).getContainerClient(CONTAINER_NAME)
    try {
      if (!(await container.exists())) return
      const n = await deleteExpired(container, Date.now(), days)
      context.log(`proctorCleanup removed ${n} snapshot(s) older than ${days} days`)
    } catch (err) {
      context.error("proctorCleanup failed", err)
    }
  },
})
