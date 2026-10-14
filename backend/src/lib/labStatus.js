// Status contract for /api/labs/status. ARM access is injected (getDeployment, exists), so
// this is testable without Azure. Deployment history and resources have independent
// lifetimes (teardown deletes resources but leaves the record; a deleted record can leave a
// running paid account), so "missing" is only declared when BOTH are gone.

// Maps Azure's provisioningState onto the 4 stage labels the /labs UI shows.
export const STAGE_BY_STATE = { Accepted: 0, Running: 1, Succeeded: 4, Failed: -1, Canceled: -1 }

// Retryable = throttling, 5xx, or a genuine transport error. An error with no HTTP status that is
// NOT a transport error (for example a credential/config failure) must surface as a plain 500,
// otherwise the learner would see "Reconnecting..." forever.
const TRANSPORT_CODE = /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH|ESOCKET|UND_ERR|REQUEST_SEND_ERROR)/
const retryable = (err) => {
  if (!err) return false
  if (err.statusCode !== undefined) return err.statusCode === 429 || err.statusCode >= 500
  return TRANSPORT_CODE.test(String(err.code || "")) || err.name === "AbortError" || /fetch failed|network|socket hang up/i.test(String(err.message || ""))
}
const isNotFound = (err) => err && (err.statusCode === 404 || err.code === "DeploymentNotFound")

const UNAVAILABLE = { status: 503, body: { state: "unavailable", retryable: true } }

// Returns { status, body }.
//   200 { state, stage }                       deployment found
//   200 { state: "unverified", stage: 1, resourceExists: true }   record gone, resource still there
//   404 { state: "missing" }                   record AND resource gone (or torn down after success)
//   503 { state: "unavailable", retryable }    throttling / 5xx / network / cannot tell
//   500 { error }                              anything else (auth, config)
export async function computeStatus({ getDeployment, exists, deploymentName, accountName, storageAccountName }) {
  const resource = accountName
    ? { type: "Microsoft.CognitiveServices/accounts", name: accountName }
    : storageAccountName
      ? { type: "Microsoft.Storage/storageAccounts", name: storageAccountName }
      : null

  const resourceExists = async () => {
    if (!resource) return null // nothing to check against
    return exists(resource.type, resource.name)
  }

  let dep
  try {
    dep = await getDeployment(deploymentName)
  } catch (err) {
    if (isNotFound(err)) {
      try {
        const present = await resourceExists()
        if (present === true) return { status: 200, body: { state: "unverified", stage: 1, resourceExists: true } }
        if (present === false) return { status: 404, body: { state: "missing" } }
        return UNAVAILABLE // no identifiers: cannot tell whether a lab still runs
      } catch {
        return UNAVAILABLE
      }
    }
    if (retryable(err)) return UNAVAILABLE
    return { status: 500, body: { error: "Failed to read status" } }
  }

  const state = dep?.properties?.provisioningState || "Accepted"
  const stage = STAGE_BY_STATE[state] ?? 0

  if (state === "Succeeded") {
    try {
      const present = await resourceExists()
      if (present === false) return { status: 404, body: { state: "missing" } }
    } catch {
      return UNAVAILABLE
    }
  }
  return { status: 200, body: { state, stage } }
}
