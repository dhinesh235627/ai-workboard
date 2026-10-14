import { TableClient } from "@azure/data-tables"
import { randomBytes } from "node:crypto"

// Issued certificates live in a Table Storage table inside the function app's
// own storage account (AzureWebJobsStorage), so no extra Azure resource is needed.
const TABLE = "certificates"
const PARTITION = "cert"
// No 0/O/1/I so an ID read off a printed certificate can't be mistyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export const ISSUER = "ROBO&AI"
export const PASS_MARK = 70
export const COURSES = {
  "azure-ai-foundry-agent-builder": { code: "AF", title: "Azure AI Foundry Agent Builder" },
}
export const ID_PATTERN = /^LRN-[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/

let clientPromise
function table() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const connection = process.env.AzureWebJobsStorage
      if (!connection) throw new Error("AzureWebJobsStorage is not configured")
      const client = TableClient.fromConnectionString(connection, TABLE, {
        allowInsecureConnection: connection.includes("UseDevelopmentStorage"),
      })
      await client.createTable() // no-op when the table already exists
      return client
    })().catch((err) => {
      clientPromise = undefined
      throw err
    })
  }
  return clientPromise
}

function newId(code) {
  const bytes = randomBytes(8)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")
  return `LRN-${code}-${chars.slice(0, 4)}-${chars.slice(4)}`
}

const toRecord = (e) => ({
  id: e.rowKey,
  holderName: e.holderName,
  courseId: e.courseId,
  courseTitle: e.courseTitle,
  issuer: ISSUER,
  issuedAt: e.issuedAt,
  status: e.status,
  scores: { overall: e.overall, quizzes: e.quizzes, lab: e.lab, rubric: e.rubric },
})

export async function issueCertificate({ holderName, courseId, scores }) {
  const course = COURSES[courseId]
  const client = await table()
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId(course.code)
    try {
      await client.createEntity({
        partitionKey: PARTITION,
        rowKey: id,
        holderName,
        courseId,
        courseTitle: course.title,
        issuedAt: new Date().toISOString(),
        status: "valid",
        overall: scores.overall,
        quizzes: scores.quizzes,
        lab: scores.lab,
        rubric: scores.rubric,
      })
      return toRecord(await client.getEntity(PARTITION, id))
    } catch (err) {
      if (err.statusCode !== 409) throw err // 409 = ID collision, pick another
    }
  }
  throw new Error("Could not allocate a unique certificate ID")
}

export async function getCertificate(id) {
  const client = await table()
  try {
    return toRecord(await client.getEntity(PARTITION, id))
  } catch (err) {
    if (err.statusCode === 404) return null
    throw err
  }
}
