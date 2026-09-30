import { app } from "@azure/functions"
import { runTeardown } from "../lib/teardown.js"

// Runs every 15 minutes once deployed. Requires a real (or emulated, via
// Azurite) AzureWebJobsStorage to schedule against — that's a timer trigger's
// own bookkeeping, unrelated to the resources it manages. Use the
// /api/labs/teardown HTTP endpoint to run this same logic locally without
// needing Azurite.
app.timer("labsTeardownTimer", {
  schedule: "0 */15 * * * *",
  handler: async (_myTimer, context) => {
    const result = await runTeardown((msg) => context.log(msg))
    context.log(`Teardown check complete: deleted ${result.deleted.length}, skipped ${result.skipped.length}`)
  },
})
