import { DefaultAzureCredential } from "@azure/identity"
import { ResourceManagementClient } from "@azure/arm-resources"

const RESOURCE_GROUP = process.env.LABS_RESOURCE_GROUP || "rg-ai-workboard-labs"
const PROJECTS_API_VERSION = "2026-07-15-preview"

// API version per resource type — the generic beginDeleteById call needs one.
const API_VERSION_BY_TYPE = {
  "Microsoft.Storage/storageAccounts": "2023-01-01",
  "Microsoft.CognitiveServices/accounts": "2025-06-01",
}

// A Cognitive Services / AI Foundry account refuses to delete while it still
// has child projects — confirmed directly against Azure: deleting the
// account first throws CannotDeleteResource naming the nested project id.
// Unlike a Storage Account, these children never appear as their own entries
// in listByResourceGroup, so they have to be listed and removed via the
// account's own child-resource REST path before the account itself can go.
async function deleteChildProjects(credential, subscriptionId, accountId, log) {
  const token = await credential.getToken("https://management.azure.com/.default")
  const authHeader = { Authorization: `Bearer ${token.token}` }

  const listRes = await fetch(`https://management.azure.com${accountId}/projects?api-version=${PROJECTS_API_VERSION}`, {
    headers: authHeader,
  })
  if (!listRes.ok) {
    throw new Error(`Failed to list projects for ${accountId}: ${listRes.status}`)
  }
  const { value: projects = [] } = await listRes.json()

  for (const project of projects) {
    log?.(`Deleting child project ${project.name} before its account`)
    const deleteRes = await fetch(`https://management.azure.com${project.id}?api-version=${PROJECTS_API_VERSION}`, {
      method: "DELETE",
      headers: authHeader,
    })
    if (!deleteRes.ok && deleteRes.status !== 404) {
      throw new Error(`Failed to delete project ${project.id}: ${deleteRes.status}`)
    }
  }
}

// Shared by both the timer trigger (real schedule, once deployed) and the
// manual HTTP endpoint (so this can be tested locally without the Azurite
// storage emulator that timer triggers otherwise require).
export async function runTeardown(log) {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID
  if (!subscriptionId) {
    throw new Error("AZURE_SUBSCRIPTION_ID is not configured")
  }

  const credential = new DefaultAzureCredential()
  const client = new ResourceManagementClient(credential, subscriptionId)

  const now = Date.now()
  const deleted = []
  const skipped = []

  for await (const resource of client.resources.listByResourceGroup(RESOURCE_GROUP)) {
    const expiresAt = resource.tags?.expiresAt
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : NaN

    if (!expiresAt || Number.isNaN(expiresAtMs)) {
      skipped.push({ name: resource.name, reason: "no expiresAt tag" })
      continue
    }
    if (expiresAtMs > now) {
      skipped.push({ name: resource.name, reason: "not expired yet", expiresAt })
      continue
    }

    const apiVersion = API_VERSION_BY_TYPE[resource.type]
    if (!apiVersion) {
      skipped.push({ name: resource.name, reason: `no known API version for type ${resource.type}` })
      continue
    }

    if (resource.type === "Microsoft.CognitiveServices/accounts") {
      await deleteChildProjects(credential, subscriptionId, resource.id, log)
    }

    log?.(`Deleting expired lab resource ${resource.name} (expired ${expiresAt})`)
    await client.resources.beginDeleteById(resource.id, apiVersion)
    deleted.push({ name: resource.name, expiresAt })
  }

  return { deleted, skipped, checkedAt: new Date(now).toISOString() }
}
