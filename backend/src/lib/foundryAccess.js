import { AuthorizationManagementClient } from "@azure/arm-authorization"
import { randomUUID } from "node:crypto"

// Renamed from "Azure AI User" — the ID is stable across the rename, per
// Microsoft's own docs, so it's used here instead of the display name.
const FOUNDRY_USER_ROLE_DEFINITION_ID = "53ca6127-db72-4b80-b1b0-d745d6d5456d"

// Azure has two separate permission systems that don't overlap: generic
// roles (Contributor etc.) control who can manage the *infrastructure*;
// Foundry's own "Foundry User" role controls who can actually build agents
// in the Foundry portal UI. Provisioning the infrastructure alone — which is
// all the account/project/deployment templates do — never grants this, so
// without this step every learner would land in a real project and
// immediately hit "you don't have permission to create agents here."
export async function grantFoundryAccess({ credential, subscriptionId, resourceGroup, accountName, projectName, learnerObjectId }, log) {
  const authClient = new AuthorizationManagementClient(credential, subscriptionId)
  const accountScope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}`
  const projectScope = `${accountScope}/projects/${projectName}`
  const roleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${FOUNDRY_USER_ROLE_DEFINITION_ID}`

  async function assign(scope, principalId, principalType) {
    try {
      await authClient.roleAssignments.create(scope, randomUUID(), {
        roleDefinitionId,
        principalId,
        principalType,
      })
      log?.(`Granted Foundry User to ${principalId} on ${scope}`)
    } catch (err) {
      // Re-running this after the first successful grant (the status
      // endpoint is polled repeatedly) hits "already exists" every time —
      // that's the expected steady state, not a failure.
      if (err.statusCode === 409 || /RoleAssignmentExists/i.test(String(err.message))) return
      throw err
    }
  }

  // The learner's own account needs it to use the Foundry portal at all.
  await assign(projectScope, learnerObjectId, "User")

  // The project's own managed identity needs it too, on the parent account —
  // without this, the project can't call the model it was just given.
  const projectIdentity = await getProjectPrincipalId(credential, subscriptionId, resourceGroup, accountName, projectName)
  if (projectIdentity) {
    await assign(accountScope, projectIdentity, "ServicePrincipal")
  }
}

async function getProjectPrincipalId(credential, subscriptionId, resourceGroup, accountName, projectName) {
  const token = await credential.getToken("https://management.azure.com/.default")
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}/projects/${projectName}?api-version=2026-07-15-preview`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } })
  if (!res.ok) return null
  const project = await res.json()
  return project.identity?.principalId || null
}
