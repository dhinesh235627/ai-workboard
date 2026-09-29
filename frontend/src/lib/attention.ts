// face-api.js's hand-rolled head-yaw/gaze heuristics have been replaced by
// @vladmandic/human's real outputs: face.rotation.angle.yaw (real head pose,
// computed via solvePnP-style 3D geometry). Gaze and eyes-closed are our own
// math on top of Human's mesh/iris landmarks — Human's own built-in gaze
// calculation (src/face/angles.ts, calculateGaze) only tracks ONE eye at a
// time (whichever is more front-facing by z-depth), not both averaged,
// which produces exactly a left/right asymmetry: reliable one direction,
// weak the other, depending on which eye its heuristic happens to pick.
// getGazeOffset below always averages both eyes instead.

// Loosely typed on purpose: Human's FaceResult.mesh entries are 3-or-4-
// element tuples (x, y, z, [visibility]) with an optional trailing element,
// so TS types individual entries as possibly undefined — only x/y are used
// here, coalesced to 0, which never actually happens for a real mesh point.
type MeshPoint = readonly (number | undefined)[]

/** True once `value` has drifted far enough from its calibrated baseline
 * to count as a real deviation. Generic: used for both head-yaw (radians)
 * and gaze strength (Human's normalized 0..~0.5 magnitude) — each caller
 * picks its own margin since the two are on different scales. */
export function hasDrifted(value: number, baseline: number, margin: number): boolean {
  return Math.abs(value - baseline) > margin
}

function distance(a: MeshPoint, b: MeshPoint) {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0))
}

// Verified against @vladmandic/human's real MediaPipe FaceMesh landmark
// groups (src/face/facemeshcoords.ts) — these are the standard 6-point
// eye-corner/eyelid indices used across MediaPipe-based blink detectors,
// confirmed to exist in Human's rightEyeUpper0/rightEyeLower0/left* arrays.
const RIGHT_EYE_EAR_POINTS = [33, 160, 158, 133, 153, 144]
const LEFT_EYE_EAR_POINTS = [263, 387, 385, 362, 380, 374]

function eyeAspectRatioFromMesh(mesh: readonly MeshPoint[], indices: number[]) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => mesh[i])
  const vertical1 = distance(p2, p6)
  const vertical2 = distance(p3, p5)
  const horizontal = distance(p1, p4)
  if (horizontal === 0) return 1
  return (vertical1 + vertical2) / (2 * horizontal)
}

/** Eye Aspect Ratio (Soukupová & Čech), computed from Human's 468/478-point
 * face mesh instead of face-api.js's 68 points — same formula, much more
 * precise input landmarks. `mesh` is Human's FaceResult.mesh (or meshRaw),
 * indexed directly by MediaPipe's raw landmark id. */
export function getEyeAspectRatio(mesh: readonly MeshPoint[]): number {
  const rightEar = eyeAspectRatioFromMesh(mesh, RIGHT_EYE_EAR_POINTS)
  const leftEar = eyeAspectRatioFromMesh(mesh, LEFT_EYE_EAR_POINTS)
  return (rightEar + leftEar) / 2
}

/** A fixed EAR cutoff assumes everyone's "eyes open" ratio is the same
 * number — it isn't (eye shape, glasses, and camera angle all shift it).
 * Comparing against this person's own calibrated open-eye baseline instead
 * catches a real close (a proportional drop) regardless of their starting
 * point. */
export function areEyesClosed(ear: number, openBaseline: number): boolean {
  return ear < openBaseline * 0.75
}

// Corner landmark ids verified against Human's own facemeshcoords.ts, same
// source used for the EAR points above. Iris landmark ids: 468-472 is one
// eye's 5-point iris (center + 4 boundary), 473-477 the other.
const EYE_A_CORNERS: [number, number] = [33, 133]
const EYE_A_IRIS = [468, 469, 470, 471, 472]
const EYE_B_CORNERS: [number, number] = [362, 263]
const EYE_B_IRIS = [473, 474, 475, 476, 477]

function irisOffset(
  mesh: readonly MeshPoint[],
  corners: [number, number],
  irisIndices: number[],
  earPoints: number[],
): { dx: number; dy: number } {
  const [outer, inner] = corners
  const outerPt = mesh[outer]
  const innerPt = mesh[inner]
  const irisX = irisIndices.reduce((sum, i) => sum + (mesh[i]?.[0] ?? 0), 0) / irisIndices.length
  const irisY = irisIndices.reduce((sum, i) => sum + (mesh[i]?.[1] ?? 0), 0) / irisIndices.length
  const centerX = ((outerPt?.[0] ?? 0) + (innerPt?.[0] ?? 0)) / 2
  const centerY = ((outerPt?.[1] ?? 0) + (innerPt?.[1] ?? 0)) / 2
  const width = Math.abs((outerPt?.[0] ?? 0) - (innerPt?.[0] ?? 0))
  // Reuse the same EAR eyelid points as a height reference (p2/p3 upper,
  // p5/p6 lower) instead of a separate lookup
  const [, p2, p3, , p5, p6] = earPoints.map((i) => mesh[i])
  const height = (distance(p2, p6) + distance(p3, p5)) / 2
  if (width === 0 || height === 0) return { dx: 0, dy: 0 }
  return { dx: (irisX - centerX) / width, dy: (irisY - centerY) / height }
}

/** Real iris-position-based gaze deviation, averaged across both eyes —
 * unlike Human's own single-eye gaze.strength, this can't have a left/right
 * blind spot from only tracking whichever eye Human's heuristic picked. */
export function getGazeOffset(mesh: readonly MeshPoint[]): number {
  const a = irisOffset(mesh, EYE_A_CORNERS, EYE_A_IRIS, RIGHT_EYE_EAR_POINTS)
  const b = irisOffset(mesh, EYE_B_CORNERS, EYE_B_IRIS, LEFT_EYE_EAR_POINTS)
  const dx = (a.dx + b.dx) / 2
  const dy = (a.dy + b.dy) / 2
  return Math.sqrt(dx * dx + dy * dy)
}

// Narrowed from ["cell phone", "laptop", "book", "tv"] — a held phone was
// sometimes misread as "laptop" by coco-ssd (a real, known confusion for
// this lightweight model at certain angles), and since laptop was tracked,
// that misread got flagged. Only phone/book are actually wanted now.
export const DISTRACTING_OBJECT_CLASSES = new Set(["cell phone", "book"])

// coco-ssd's confidence for its correct class drops when an object is small,
// angled, or partially out of frame — lowering the global cutoff to catch
// those real cases also let a computer mouse (similar size/rectangular
// shape) get misread as "cell phone" at low confidence. "cell phone" gets
// its own higher bar; laptop/book/tv aren't reported as confused with
// anything else, so they keep the lower, more forgiving cutoff.
export function objectConfidenceThreshold(className: string): number {
  return className === "cell phone" ? 0.55 : 0.35
}
