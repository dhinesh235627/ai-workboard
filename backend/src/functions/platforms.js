import { app } from "@azure/functions"

// Placeholder data endpoint — mirrors the sample platform list the frontend
// currently hardcodes on the Dashboard page. Swap for a real data source later.
const PLATFORMS = [
  { mono: "AF", name: "Azure AI Foundry", status: "Live", meta: "6 labs · agents, RAG" },
  { mono: "CS", name: "Copilot Studio", status: "Live", meta: "4 labs · agent building" },
  { mono: "ML", name: "Azure Machine Learning", status: "Live", meta: "3 labs · endpoints" },
  { mono: "JS", name: "SAP Joule Studio", status: "Next", meta: "Joule for devs & consultants" },
  { mono: "BR", name: "AWS Bedrock", status: "Next", meta: "AgentCore labs" },
  { mono: "CL", name: "Claude & OpenAI certification prep", status: "Next", meta: "Exam-style practice" },
]

app.http("platforms", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "platforms",
  handler: async () => {
    return { jsonBody: PLATFORMS }
  },
})
