import { app } from "@azure/functions"
import { COURSES, ID_PATTERN, PASS_MARK, getCertificate, issueCertificate } from "../lib/certStore.js"
import { buildCertificatePdf } from "../lib/certPdf.js"

// Where the QR code on the PDF points. Set CERT_VERIFY_BASE_URL per environment
// (http://localhost:5173 locally, the site's own origin when deployed).
const verifyUrlFor = (id) =>
  `${(process.env.CERT_VERIFY_BASE_URL || "https://ai-workboard-qa.azurewebsites.net").replace(/\/$/, "")}/verify/${id}`

// The embedded fonts are Latin only, so names are limited to Latin letters.
const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'-]{1,78}[A-Za-zÀ-ÖØ-öø-ÿ.]$/
const isScore = (n) => Number.isFinite(n) && n >= 0 && n <= 100

app.http("certificatesIssue", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "certificates",
  handler: async (request, context) => {
    let body
    try {
      body = await request.json()
    } catch {
      return { status: 400, jsonBody: { error: "Request body must be JSON" } }
    }

    const holderName = String(body?.holderName ?? "").trim().replace(/\s+/g, " ")
    if (!NAME_PATTERN.test(holderName)) {
      return { status: 400, jsonBody: { error: "holderName must be 3-80 characters: letters, spaces, . ' -" } }
    }
    const courseId = body?.courseId ?? "azure-ai-foundry-agent-builder"
    if (!COURSES[courseId]) {
      return { status: 400, jsonBody: { error: "Unknown courseId" } }
    }
    const scores = {
      overall: Number(body?.scores?.overall),
      quizzes: Number(body?.scores?.quizzes),
      lab: Number(body?.scores?.lab),
      rubric: Number(body?.scores?.rubric),
    }
    if (!Object.values(scores).every(isScore)) {
      return { status: 400, jsonBody: { error: "scores.overall, quizzes, lab and rubric must be numbers from 0 to 100" } }
    }
    if (scores.overall < PASS_MARK) {
      return { status: 422, jsonBody: { error: `An overall score of ${PASS_MARK} or higher is needed to earn this certificate` } }
    }

    try {
      const record = await issueCertificate({ holderName, courseId, scores })
      return { status: 201, jsonBody: { ...record, verifyUrl: verifyUrlFor(record.id) } }
    } catch (err) {
      context.error("Issuing certificate failed", err)
      return { status: 500, jsonBody: { error: "Could not issue the certificate" } }
    }
  },
})

app.http("certificatesGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "certificates/{id}",
  handler: async (request, context) => {
    const id = request.params.id
    if (!ID_PATTERN.test(id)) return { status: 404, jsonBody: { error: "Certificate not found" } }
    try {
      const record = await getCertificate(id)
      if (!record) return { status: 404, jsonBody: { error: "Certificate not found" } }
      return { jsonBody: { ...record, verifyUrl: verifyUrlFor(id) } }
    } catch (err) {
      context.error("Reading certificate failed", err)
      return { status: 500, jsonBody: { error: "Could not read the certificate" } }
    }
  },
})

app.http("certificatesPdf", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "certificates/{id}/pdf",
  handler: async (request, context) => {
    const id = request.params.id
    if (!ID_PATTERN.test(id)) return { status: 404, jsonBody: { error: "Certificate not found" } }
    try {
      const record = await getCertificate(id)
      if (!record) return { status: 404, jsonBody: { error: "Certificate not found" } }
      const pdf = await buildCertificatePdf(record, verifyUrlFor(id))
      return {
        status: 200,
        body: Buffer.from(pdf),
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="ROBOAI-Certificate-${id}.pdf"`,
          "Cache-Control": "no-store",
        },
      }
    } catch (err) {
      context.error("Building certificate PDF failed", err)
      return { status: 500, jsonBody: { error: "Could not build the certificate PDF" } }
    }
  },
})
