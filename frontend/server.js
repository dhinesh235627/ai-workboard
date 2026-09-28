import express from "express"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const distPath = path.join(__dirname, "dist")

app.use(express.static(distPath))

app.use((_req, res) => {
  res.sendFile(path.join(distPath, "index.html"))
})

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`ai_workboard frontend listening on port ${port}`)
})
