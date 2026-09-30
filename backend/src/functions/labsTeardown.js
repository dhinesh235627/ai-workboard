import { app } from "@azure/functions"
import { runTeardown } from "../lib/teardown.js"

// Manual trigger for the same teardown logic labsTeardownTimer runs on a
// schedule — lets this be tested from localhost without needing the Azurite
// storage emulator that a real timer trigger requires.
app.http("labsTeardown", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "labs/teardown",
  handler: async (_request, context) => {
    try {
      const result = await runTeardown((msg) => context.log(msg))
      return { jsonBody: result }
    } catch (err) {
      context.error("Teardown run failed", err)
      return { status: 500, jsonBody: { error: String(err.message || err) } }
    }
  },
})
