import { app } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"

// Maps Azure's real deployment provisioningState onto the same 4 stage
// labels the /labs UI already shows, so swapping the fake timer for this
// endpoint doesn't require changing the visual design at all.
const STAGE_BY_STATE = {
  Accepted: 0,
  Running: 1,
  Succeeded: 4,
  Failed: -1,
  Canceled: -1,
}

app.http("labsStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "labs/status",
  handler: async (request, context) => {
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID
    if (!subscriptionId) {
      return { status: 500, jsonBody: { error: "AZURE_SUBSCRIPTION_ID is not configured" } }
    }

    const deploymentName = request.query.get("deploymentName")
    const storageAccountName = request.query.get("storageAccountName")
    const accountName = request.query.get("accountName")
    if (!deploymentName) {
      return { status: 400, jsonBody: { error: "deploymentName is required" } }
    }

    const credential = new DefaultAzureCredential()
    const client = new ResourceManagementClient(credential, subscriptionId)

    try {
      const deployment = await client.deployments.get(RESOURCE_GROUP, deploymentName)
      const state = deployment.properties?.provisioningState || "Accepted"
      const stage = STAGE_BY_STATE[state] ?? 0

      let portalUrl = null
      if (state === "Succeeded" && accountName) {
        portalUrl = `https://portal.azure.com/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${accountName}/overview`
      } else if (state === "Succeeded" && storageAccountName) {
        portalUrl = `https://portal.azure.com/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/overview`
      }

      return { jsonBody: { state, stage, portalUrl } }
    } catch (err) {
      context.error("Failed to read deployment status", err)
      return { status: 500, jsonBody: { error: "Failed to read status", detail: String(err.message || err) } }
    }
  },
})
