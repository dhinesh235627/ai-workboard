import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import QRCode from "qrcode"
import { readFileSync } from "node:fs"
import { ISSUER } from "./certStore.js"

const font = (name) => readFileSync(new URL(`../assets/fonts/${name}`, import.meta.url))

// Landscape A4, same cream-paper look as the certificate card on the Results page.
const W = 841.89
const H = 595.28
const M = 64
const PAPER = rgb(0.961, 0.949, 0.918) // #F5F2EA
const INK = rgb(0.102, 0.102, 0.102) // #1A1A1A
const MUTED = rgb(0.42, 0.396, 0.349) // #6B6559
const BODY = rgb(0.29, 0.275, 0.243) // #4A463E
const WHITE = rgb(1, 1, 1)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Letter-spaced text (pdf-lib has no tracking option). Returns the width drawn.
function spaced(page, text, { x, y, size, font: f, color, space, align = "left" }) {
  const width = [...text].reduce((w, ch) => w + f.widthOfTextAtSize(ch, size) + space, -space)
  let cx = align === "right" ? x - width : align === "center" ? x - width / 2 : x
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font: f, color })
    cx += f.widthOfTextAtSize(ch, size) + space
  }
  return width
}

// Mock ROBO&AI mark: a rounded robot-head square with antenna, eyes and mouth.
function drawLogo(page, x, y, size) {
  const s = size / 48
  page.drawSvgPath("M12 0 H36 A12 12 0 0 1 48 12 V36 A12 12 0 0 1 36 48 H12 A12 12 0 0 1 0 36 V12 A12 12 0 0 1 12 0 Z", {
    x, y: y + size, scale: s, color: INK,
  })
  page.drawLine({ start: { x: x + 24 * s, y: y + 46 * s }, end: { x: x + 24 * s, y: y + 54 * s }, thickness: 1.6 * s, color: INK })
  page.drawCircle({ x: x + 24 * s, y: y + 56 * s, size: 2.6 * s, color: INK })
  page.drawCircle({ x: x + 16 * s, y: y + 28 * s, size: 4.5 * s, color: PAPER })
  page.drawCircle({ x: x + 32 * s, y: y + 28 * s, size: 4.5 * s, color: PAPER })
  page.drawLine({ start: { x: x + 15 * s, y: y + 14 * s }, end: { x: x + 33 * s, y: y + 14 * s }, thickness: 2.4 * s, color: PAPER })
}

// Vector QR code: every dark module is a rectangle, so it stays sharp at any zoom.
function drawQr(page, text, x, y, size) {
  const { size: n, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules
  const quiet = 3
  const cell = size / (n + quiet * 2)
  page.drawRectangle({ x: x - 6, y: y - 6, width: size + 12, height: size + 12, color: WHITE, borderColor: rgb(0.85, 0.83, 0.78), borderWidth: 0.6 })
  for (let row = 0; row < n; row++) {
    let col = 0
    while (col < n) {
      if (!data[row * n + col]) { col++; continue }
      let run = col
      while (run < n && data[row * n + run]) run++
      page.drawRectangle({
        x: x + (col + quiet) * cell,
        y: y + size - (row + quiet + 1) * cell,
        width: (run - col) * cell + 0.15, // tiny overlap hides hairline seams between modules
        height: cell + 0.15,
        color: INK,
      })
      col = run
    }
  }
}

export async function buildCertificatePdf(record, verifyUrl) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(`${record.courseTitle} — ${record.holderName}`)
  pdf.setAuthor(ISSUER)
  pdf.setSubject(`Certificate ${record.id}`)
  pdf.setCreator(ISSUER)
  const serif = await pdf.embedFont(font("instrument-serif-latin-400-normal.woff"), { subset: true })
  const sans = await pdf.embedFont(font("inter-latin-400-normal.woff"), { subset: true })
  const sansBold = await pdf.embedFont(font("inter-latin-600-normal.woff"), { subset: true })

  const page = pdf.addPage([W, H])
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER })
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: INK, borderWidth: 1.4 })
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: MUTED, borderWidth: 0.5 })

  // Header: logo + wordmark, verified-skill tag on the right
  drawLogo(page, M, H - 112, 36)
  spaced(page, "ROBO&AI", { x: M + 48, y: H - 100, size: 17, font: sansBold, color: INK, space: 2.6 })
  spaced(page, "VERIFIED SKILL", { x: W - M, y: H - 98, size: 9, font: sans, color: MUTED, space: 2.4, align: "right" })

  // Title block
  spaced(page, "CERTIFICATE OF COMPLETION", { x: M, y: H - 168, size: 9, font: sans, color: MUTED, space: 2.4 })
  const words = record.courseTitle.split(" ")
  const mid = Math.ceil(words.length / 2)
  const lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")]
  lines.forEach((line, i) => page.drawText(line, { x: M, y: H - 222 - i * 54, size: 52, font: serif, color: INK }))

  page.drawText("Awarded to", { x: M, y: H - 330, size: 12, font: sans, color: MUTED })
  let nameSize = 40
  while (serif.widthOfTextAtSize(record.holderName, nameSize) > 480 && nameSize > 18) nameSize -= 2
  page.drawText(record.holderName, { x: M, y: H - 368, size: nameSize, font: serif, color: INK })
  page.drawLine({ start: { x: M, y: H - 378 }, end: { x: M + 300, y: H - 378 }, thickness: 0.6, color: MUTED })
  page.drawText("for building and testing a grounded agent in a live Azure environment.", { x: M, y: H - 402, size: 12, font: sans, color: BODY })
  const s = record.scores
  page.drawText(`Overall ${s.overall}   ·   Quizzes ${s.quizzes}%   ·   Hands-on lab ${s.lab}%   ·   Evaluator rubric ${s.rubric}%`, {
    x: M, y: H - 424, size: 9.5, font: sans, color: MUTED,
  })

  // Seal on the right
  const sx = W - 170
  const sy = H - 250
  page.drawCircle({ x: sx, y: sy, size: 66, borderColor: INK, borderWidth: 1.2 })
  page.drawCircle({ x: sx, y: sy, size: 59, borderColor: MUTED, borderWidth: 0.5 })
  spaced(page, "ROBO&AI", { x: sx, y: sy + 4, size: 12, font: sansBold, color: INK, space: 1.6, align: "center" })
  spaced(page, "VERIFIED", { x: sx, y: sy - 12, size: 7, font: sans, color: MUTED, space: 2.2, align: "center" })
  spaced(page, String(new Date(record.issuedAt).getUTCFullYear()), { x: sx, y: sy - 24, size: 7, font: sans, color: MUTED, space: 2.2, align: "center" })

  // Footer: issue details, signature, QR
  page.drawText(`Issued ${formatDate(record.issuedAt)}`, { x: M, y: 118, size: 11, font: sans, color: MUTED })
  page.drawText(`ID ${record.id}`, { x: M, y: 101, size: 11, font: sansBold, color: INK })
  page.drawText(ISSUER, { x: M, y: 84, size: 11, font: sans, color: MUTED })

  // Mock signature scribble, line and signatory
  page.drawSvgPath("M0 0 C 10 -22, 18 10, 30 -6 S 52 -20, 60 -4 S 82 6, 96 -10 L 110 -4", {
    x: 330, y: 150, borderColor: INK, borderWidth: 1.3,
  })
  page.drawLine({ start: { x: 320, y: 128 }, end: { x: 470, y: 128 }, thickness: 0.6, color: MUTED })
  page.drawText("Arjun Mehta", { x: 320, y: 113, size: 10.5, font: sansBold, color: INK })
  page.drawText(`Director of Learning, ${ISSUER}`, { x: 320, y: 100, size: 8.5, font: sans, color: MUTED })

  drawQr(page, verifyUrl, W - M - 96, 90, 96)
  spaced(page, "SCAN TO VERIFY", { x: W - M - 48, y: 70, size: 7, font: sansBold, color: INK, space: 1.8, align: "center" })
  page.drawText(verifyUrl, { x: W - M - sans.widthOfTextAtSize(verifyUrl, 6.5), y: 58, size: 6.5, font: sans, color: MUTED })
  page.drawText("Prepares you for the vendor exam. Not a vendor certification.", { x: M, y: 50, size: 8, font: sans, color: MUTED })

  return pdf.save()
}
