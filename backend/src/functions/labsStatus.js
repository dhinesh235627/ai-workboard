import { app } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"
import { grantFoundryAccess } from "../lib/foundryAccess.js"

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"
// No login system exists yet, so there's no per-learner Azure AD identity to
// read from a session. Defaults to whoever owns this subscription so the
// real permission grant can be proven end-to-end; once real auth exists,
// this should come from the signed-in user instead.
const DEFAULT_LEARNER_OBJECT_ID = process.env.DEFAULT_LEARNER_OBJECT_ID

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
    const projectName = request.query.get("projectName")
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
      let accessError = null
      if (state === "Succeeded" && accountName && projectName) {
        portalUrl = `https://portal.azure.com/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${accountName}/overview`
        if (DEFAULT_LEARNER_OBJECT_ID) {
          try {
            await grantFoundryAccess(
              {
                credential,
                subscriptionId,
                resourceGroup: RESOURCE_GROUP,
                accountName,
                projectName,
                learnerObjectId: DEFAULT_LEARNER_OBJECT_ID,
              },
              (msg) => context.log(msg)
            )
          } catch (err) {
            // Don't fail the whole status check over this — the resource is
            // real and ready either way; the learner just won't be able to
            // build an agent in the portal until this grant succeeds on a
            // later poll.
            context.error("Failed to grant Foundry access", err)
            accessError = "Resource is ready, but granting portal access failed — see logs."
          }
        }
      } else if (state === "Succeeded" && storageAccountName) {
        portalUrl = `https://portal.azure.com/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/overview`
      }

      return { jsonBody: { state, stage, portalUrl, accessError } }
    } catch (err) {
      context.error("Failed to read deployment status", err)
      return { status: 500, jsonBody: { error: "Failed to read status", detail: String(err.message || err) } }
    }
  },
})
