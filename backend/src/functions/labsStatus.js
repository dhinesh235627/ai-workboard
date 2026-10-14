import { app } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"
import { grantFoundryAccess } from "../lib/foundryAccess.js"
import { computeStatus } from "../lib/labStatus.js"
import { API_VERSION_BY_TYPE } from "../lib/teardown.js"

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"
// No login system exists yet, so there's no per-learner Azure AD identity to
// read from a session. Defaults to whoever owns this subscription so the
// real permission grant can be proven end-to-end; once real auth exists,
// this should come from the signed-in user instead.
const DEFAULT_LEARNER_OBJECT_ID = process.env.DEFAULT_LEARNER_OBJECT_ID

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

    const result = await computeStatus({
      getDeployment: (name) => client.deployments.get(RESOURCE_GROUP, name),
      exists: async (type, name) => {
        const [namespace, resourceType] = type.split("/")
        try {
          await client.resources.get(RESOURCE_GROUP, namespace, "", resourceType, name, API_VERSION_BY_TYPE[type])
          return true
        } catch (err) {
          if (err.statusCode === 404) return false
          throw err
        }
      },
      deploymentName, accountName, storageAccountName,
    })
    if (result.status !== 200) {
      if (result.status >= 500) context.error(`labs status ${result.status}`)
      return { status: result.status, jsonBody: result.body }
    }

    const { state, stage } = result.body
    let portalUrl = null
    let accessError = null
    if (state === "Succeeded" && accountName && projectName) {
      portalUrl = `https://portal.azure.com/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.CognitiveServices/accounts/${accountName}/overview`
      if (DEFAULT_LEARNER_OBJECT_ID) {
        try {
          await grantFoundryAccess(
            { credential, subscriptionId, resourceGroup: RESOURCE_GROUP, accountName, projectName, learnerObjectId: DEFAULT_LEARNER_OBJECT_ID },
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

    return { jsonBody: { ...result.body, portalUrl, accessError } }
  },
})
