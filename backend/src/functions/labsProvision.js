import { app } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_TEMPLATE = JSON.parse(
  readFileSync(join(__dirname, "..", "infra", "lab-test-resource.json"), "utf8")
)
const FOUNDRY_ACCOUNT_TEMPLATE = JSON.parse(
  readFileSync(join(__dirname, "..", "infra", "lab-foundry-account.json"), "utf8")
)
const FOUNDRY_PROJECT_TEMPLATE = JSON.parse(
  readFileSync(join(__dirname, "..", "infra", "lab-foundry-project.json"), "utf8")
)

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"
const LAB_LIFETIME_MS = 2 * 60 * 60 * 1000 // 2 hours, matches the /labs UI copy

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10)
}

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
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + LAB_LIFETIME_MS).toISOString()

    const credential = new DefaultAzureCredential()
    const client = new ResourceManagementClient(credential, subscriptionId)

    // Only "foundry" gets the real AI Foundry account + project + model —
    // the other platform tabs (Copilot Studio, Azure ML, ...) each need their
    // own non-ARM integration that hasn't been built yet, so they still fall
    // back to the placeholder Storage Account that proved the pipeline.
    if (platform !== "foundry") {
      const deploymentName = `lab-${randomSuffix()}`
      const storageAccountName = `labsa${randomSuffix()}`
      try {
        await client.deployments.beginCreateOrUpdate(RESOURCE_GROUP, deploymentName, {
          properties: {
            mode: "Incremental",
            template: STORAGE_TEMPLATE,
            parameters: {
              storageAccountName: { value: storageAccountName },
              learnerId: { value: learnerId },
              createdAt: { value: createdAt },
              expiresAt: { value: expiresAt },
            },
          },
        })
      } catch (err) {
        context.error("Failed to start lab deployment", err)
        return { status: 500, jsonBody: { error: "Failed to start deployment", detail: String(err.message || err) } }
      }
      return { jsonBody: { deploymentName, storageAccountName, resourceGroup: RESOURCE_GROUP, createdAt, expiresAt } }
    }

    const suffix = randomSuffix()
    const accountName = `labfoundry${suffix}`
    const projectName = "sandbox-project"
    const accountDeploymentName = `lab-acct-${suffix}`
    const projectDeploymentName = `lab-proj-${suffix}`

    try {
      // Step 1: create the account and actually wait for it — the project
      // step below depends on the account's identity being real, not just
      // "provisioningState: Succeeded".
      await client.deployments.beginCreateOrUpdateAndWait(RESOURCE_GROUP, accountDeploymentName, {
        properties: {
          mode: "Incremental",
          template: FOUNDRY_ACCOUNT_TEMPLATE,
          parameters: {
            accountName: { value: accountName },
            learnerId: { value: learnerId },
            createdAt: { value: createdAt },
            expiresAt: { value: expiresAt },
          },
        },
      })

      // Step 2: kick off the project + model deployment — this one is what
      // the frontend polls /api/labs/status against, same as before.
      await client.deployments.beginCreateOrUpdate(RESOURCE_GROUP, projectDeploymentName, {
        properties: {
          mode: "Incremental",
          template: FOUNDRY_PROJECT_TEMPLATE,
          parameters: {
            accountName: { value: accountName },
            projectName: { value: projectName },
            learnerId: { value: learnerId },
            expiresAt: { value: expiresAt },
          },
        },
      })
    } catch (err) {
      context.error("Failed to provision Foundry lab", err)
      return { status: 500, jsonBody: { error: "Failed to provision Foundry lab", detail: String(err.message || err) } }
    }

    return {
      jsonBody: {
        deploymentName: projectDeploymentName,
        accountName,
        projectName,
        resourceGroup: RESOURCE_GROUP,
        createdAt,
        expiresAt,
      },
    }
  },
})
