import { app } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { OP_ID_RE, provisionLab } from "../lib/foundryProvision.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(join(__dirname, "..", "infra", f), "utf8"))
const TEMPLATES = {
  storage: load("lab-test-resource.json"),
  foundryAccount: load("lab-foundry-account.json"),
  foundryProject: load("lab-foundry-project.json"),
}

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"

app.http("labsProvision", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "labs/provision",
  handler: async (request, context) => {
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID
    if (!subscriptionId) {
      return { status: 500, jsonBody: { error: "AZURE_SUBSCRIPTION_ID is not configured" } }
    }

    const body = await request.json().catch(() => ({}))
    const learnerId = body.learnerId || "local-test"
    const platform = body.platform || "foundry"
    // The client sends an operationId BEFORE asking for a lab. Every name is derived from it,
    // so asking again for the same operation finds the existing lab instead of making another.
    // Old clients that send none keep the previous (random-name) behaviour.
    const operationId = body.operationId ?? null
    if (operationId !== null && (typeof operationId !== "string" || !OP_ID_RE.test(operationId))) {
      return { status: 400, jsonBody: { error: "invalid operationId" } }
    }

    const credential = new DefaultAzureCredential()
    const client = new ResourceManagementClient(credential, subscriptionId)

    try {
      const lab = await provisionLab({
        client, rg: RESOURCE_GROUP, templates: TEMPLATES, learnerId, platform, operationId,
      })
      return { jsonBody: lab }
    } catch (err) {
      context.error("Failed to provision lab", err)
      // Azure reported the deployment itself as Failed/Canceled: asking again cannot help, so the
      // client must end this operation instead of retrying it.
      if (err.terminal) return { status: 409, jsonBody: { state: "failed", error: "Azure could not create the lab" } }
      return { status: 500, jsonBody: { error: "Failed to provision lab", detail: String(err.message || err) } }
    }
  },
})
