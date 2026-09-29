// Ported from video_analysis/src/components/VideoBot.tsx — the detection
// engine only (camera capture, Human + coco-ssd detection loop, calibration,
// debouncing). That file also had its own light-themed JSX; this hook keeps
// none of that and just returns state/refs/actions so a caller can render it
// however it wants (see frontend/src/pages/Setup.tsx for the dark-theme
// consumer). Logic below is intentionally left as close to the original as
// possible — it's carefully tuned (see the original's inline comments for
// *why* each constant/margin/window size is what it is).
import * as cocoSsd from "@tensorflow-models/coco-ssd"
import * as tf from "@tensorflow/tfjs"
// Vendored locally (src/vendor/) instead of imported from the package: the
// nobundle build reuses this project's own @tensorflow/tfjs instance rather
// than bundling a second internal copy (which is what caused the "dual
// TFJS instance" kernel-registration crash the reference project hit earlier
// with face-api.js) — but @vladmandic/human's published package.json
// "exports" map is missing the required "./" prefix on every subpath key, so
// this deep import isn't actually resolvable through the package itself.
// Vendoring the one file sidesteps that packaging bug without giving up the
// safer nobundle build.
import Human from "../vendor/human.esm-nobundle.js"
import { useEffect, useRef, useState } from "react"
import {
  areEyesClosed,
  DISTRACTING_OBJECT_CLASSES,
  getEyeAspectRatio,
  getGazeOffset,
  hasDrifted,
  objectConfidenceThreshold,
} from "./attention"

const humanConfig = {
  modelBasePath: "/models/human/",
  backend: "webgl" as const,
  debug: false,
  face: {
    enabled: true,
    // "rotation correction... used to correctly analyze faces under high
    // angles" — off by default, but exactly what head-yaw/gaze accuracy
    // depends on for anything but a dead-straight face
    detector: { rotation: true, maxDetected: 5 },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false }, // coco-ssd already covers this
  gesture: { enabled: false },
  segmentation: { enabled: false },
}

export type AttentionStatus =
  | "idle"
  | "loading"
  | "cancelling"
  | "calibrating"
  | "engaged"
  | "no-face"
  | "multiple-faces"
  | "looking-away"
  | "gaze-away"
  | "eyes-closed"
  | "object-detected"
  | "error"

export const STATUS_TEXT: Record<AttentionStatus, string> = {
  idle: "Not started",
  loading: "Loading models…",
  cancelling: "Cancelling…",
  calibrating: "Calibrating — look at the screen normally for a moment",
  engaged: "Engaged",
  "no-face": "No face detected — stepped away?",
  "multiple-faces": "More than one person in frame",
  "looking-away": "Head turned away from the screen",
  "gaze-away": "Eyes looking away from the screen",
  "eyes-closed": "Eyes closed",
  "object-detected": "Distracting object detected",
  error: "Camera or model error",
}

export type FaceSignals = {
  faceCount: number
  headAway: boolean
  gazeAway: boolean
  eyesClosed: boolean
  debug: {
    yaw: number
    yawBaseline: number
    ear: number
    earBaseline: number
    gazeStrength: number
    gazeStrengthBaseline: number
  } | null
}

export function useAttentionDetection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Runs the detection loop back-to-back with no fixed delay: the next
  // cycle starts as soon as the previous one finishes, capped only by how
  // fast the models actually run on this device (not a fixed interval).
  const loopActiveRef = useRef(false)
  const objectModelRef = useRef<cocoSsd.ObjectDetection | null>(null)
  const humanRef = useRef<InstanceType<typeof Human> | null>(null)
  const startingRef = useRef(false)
  const cancelStartRef = useRef(false)
  // Debounce: a status only takes effect once it's the majority (2 of the
  // last 3) recent readings — NOT "2 in a row." See the original VideoBot.tsx
  // for the full rationale (a real, confirmed bug with "2 in a row").
  const STATUS_WINDOW = 3
  const statusWindowRef = useRef<AttentionStatus[]>([])
  // Independent debounce for each raw signal, separate from the single
  // headline status. See original for rationale.
  const BOOLEAN_WINDOW = 3
  const headAwayWindowRef = useRef<boolean[]>([])
  const gazeAwayWindowRef = useRef<boolean[]>([])
  const eyesClosedWindowRef = useRef<boolean[]>([])
  // Calibration: head-yaw (radians) / gaze strength / EAR "normal" values
  // differ per person, per camera angle, and with/without glasses, so
  // instead of a fixed cutoff we sample a few seconds of "looking at the
  // screen normally" and compare against that baseline going forward.
  const CALIBRATION_SAMPLES_NEEDED = 10
  // The very first detection cycles right after Start can be unstable
  // (camera auto-exposure/focus still adjusting, models just warmed up) —
  // these cycles are thrown away entirely before calibration starts
  // counting anything.
  const CALIBRATION_WARMUP_CYCLES = 8
  const warmupCyclesRemainingRef = useRef(CALIBRATION_WARMUP_CYCLES)
  const calibrationSamplesRef = useRef<{ yaw: number[]; gazeStrength: number[]; ear: number[] }>({
    yaw: [],
    gazeStrength: [],
    ear: [],
  })
  const baselineRef = useRef<{ yaw: number; gazeStrength: number; ear: number } | null>(null)
  // Safety cap for the stability-check restart below — without this,
  // someone who's naturally fidgety could get stuck in "Calibrating" forever.
  const CALIBRATION_MAX_RESTARTS = 5
  const calibrationRestartsRef = useRef(0)
  // Raw landmark positions wobble a little every frame even when perfectly
  // still — averaging the last few readings before comparing to anything
  // smooths that out. Head-yaw is slow and sustained, so it tolerates heavy
  // smoothing; a quick eye-only glance is smaller and shorter-lived, so it
  // gets a shorter window so a real glance survives the average.
  const YAW_SMOOTHING_WINDOW = 3
  const GAZE_SMOOTHING_WINDOW = 1
  const yawHistoryRef = useRef<number[]>([])
  const earHistoryRef = useRef<number[]>([])
  const gazeStrengthHistoryRef = useRef<number[]>([])

  function smoothed(history: number[], value: number, window: number): number {
    history.push(value)
    if (history.length > window) history.shift()
    return history.reduce((a, b) => a + b, 0) / history.length
  }

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<AttentionStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [objectLabels, setObjectLabels] = useState<cocoSsd.DetectedObject[]>([])
  const [faceSignals, setFaceSignals] = useState<FaceSignals | null>(null)

  // The status actually committed (shown) so far — separate from
  // statusWindowRef, which tracks recent raw readings.
  const lastCommittedStatusRef = useRef<AttentionStatus>("idle")

  useEffect(() => {
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadModels(): Promise<boolean> {
    await tf.ready()
    if (cancelStartRef.current) return false
    // Human caches its own loaded-model state internally, so calling
    // load()/warmup() again on Stop -> Start doesn't re-fetch weights.
    if (!humanRef.current) humanRef.current = new Human(humanConfig)
    await humanRef.current.load()
    if (cancelStartRef.current) return false
    await humanRef.current.warmup()
    if (cancelStartRef.current) return false
    if (!objectModelRef.current) {
      objectModelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" })
    }
    return !cancelStartRef.current
  }

  async function start() {
    // Guards against a double-click while models/camera are still loading:
    // without this, a second start() grabs a second camera stream and calls
    // video.play() again, aborting the first play() with a browser error.
    if (startingRef.current || running) return
    startingRef.current = true
    cancelStartRef.current = false
    setErrorMessage(null)
    setStatus("loading")
    try {
      if (!(await loadModels())) return setStatus("idle")

      // 640x480 left very little detail in the eye/iris region for gaze and
      // eyes-closed to work with. "ideal" (not a hard constraint) requests
      // HD but still falls back gracefully on a camera that can't do 720p.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (cancelStartRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return setStatus("idle")
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setRunning(true)
      loopActiveRef.current = true
      runDetection()
    } catch (err) {
      console.error(err)
      setErrorMessage(err instanceof Error ? err.message : "Could not start camera")
      setStatus("error")
    } finally {
      startingRef.current = false
    }
  }

  function stop() {
    if (startingRef.current) {
      // A load is still in flight — flag it to bail out at its next check
      // point instead of tearing down state now.
      cancelStartRef.current = true
      setStatus("cancelling")
      return
    }
    loopActiveRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRunning(false)
    setStatus("idle")
    setObjectLabels([])
    setFaceSignals(null)
    statusWindowRef.current = []
    headAwayWindowRef.current = []
    gazeAwayWindowRef.current = []
    eyesClosedWindowRef.current = []
    calibrationSamplesRef.current = { yaw: [], gazeStrength: [], ear: [] }
    baselineRef.current = null
    yawHistoryRef.current = []
    earHistoryRef.current = []
    gazeStrengthHistoryRef.current = []
    warmupCyclesRemainingRef.current = CALIBRATION_WARMUP_CYCLES
    calibrationRestartsRef.current = 0
  }

  function commitStatus(next: AttentionStatus): AttentionStatus {
    const window = statusWindowRef.current
    window.push(next)
    if (window.length > STATUS_WINDOW) window.shift()

    const counts = new Map<AttentionStatus, number>()
    for (const s of window) counts.set(s, (counts.get(s) ?? 0) + 1)
    let winner: AttentionStatus | null = null
    let winnerCount = 0
    for (const [s, c] of counts) {
      if (c > winnerCount) {
        winner = s
        winnerCount = c
      }
    }
    if (winner && winnerCount >= 2) {
      setStatus(winner)
      lastCommittedStatusRef.current = winner
    }
    return lastCommittedStatusRef.current
  }

  function commitBoolean(windowRef: { current: boolean[] }, value: boolean): boolean {
    const window = windowRef.current
    window.push(value)
    if (window.length > BOOLEAN_WINDOW) window.shift()
    const trueCount = window.filter(Boolean).length
    return trueCount * 2 > window.length
  }

  async function runDetection() {
    if (!loopActiveRef.current) return
    try {
      await runDetectionInner()
    } catch (err) {
      console.error("detection loop error", err)
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setStatus("error")
      loopActiveRef.current = false
      return
    }
    // Schedule the next cycle only after this one fully finished, so cycles
    // never overlap. setTimeout (not requestAnimationFrame) on purpose: rAF
    // stops firing completely the moment the tab is hidden/backgrounded —
    // setTimeout keeps running in a background tab too.
    if (loopActiveRef.current) setTimeout(() => runDetection(), 0)
  }

  async function runDetectionInner() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Faces — real head-pose (rotation.angle) and gaze (rotation.gaze) come
    // straight from Human.
    const result = humanRef.current ? await humanRef.current.detect(video) : null
    const faces = result?.face ?? []

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Objects — coco-ssd scans for all 80 COCO classes internally, but we
    // only care about ones relevant to distraction.
    let objectHit: string | null = null
    let visibleLabels: cocoSsd.DetectedObject[] = []
    let personPresent = false
    if (objectModelRef.current) {
      const predictions = await objectModelRef.current.detect(video)
      personPresent = predictions.some((p) => p.class === "person" && p.score > 0.5)
      visibleLabels = predictions.filter(
        (p) => DISTRACTING_OBJECT_CLASSES.has(p.class) && p.score > objectConfidenceThreshold(p.class),
      )
      for (const p of visibleLabels) {
        objectHit = p.class
        const [x, y, width, height] = p.bbox
        ctx.strokeStyle = "#b3273d"
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, width, height)
        ctx.fillStyle = "#b3273d"
        ctx.font = "14px sans-serif"
        ctx.fillText(`${p.class} ${Math.round(p.score * 100)}%`, x, y > 14 ? y - 4 : y + 14)
      }
    }
    setObjectLabels(visibleLabels)

    function resetTracking() {
      calibrationSamplesRef.current = { yaw: [], gazeStrength: [], ear: [] }
      baselineRef.current = null
      yawHistoryRef.current = []
      earHistoryRef.current = []
      gazeStrengthHistoryRef.current = []
      calibrationRestartsRef.current = 0
      headAwayWindowRef.current = []
      gazeAwayWindowRef.current = []
      eyesClosedWindowRef.current = []
    }

    if (faces.length === 0) {
      setFaceSignals(null)
      resetTracking()
      // Even with rotation correction on, Human can still lose a face at an
      // extreme profile turn. coco-ssd's "person" class is far less angle-
      // sensitive, so if a person is still in frame, this is a turn, not
      // "stepped away".
      commitStatus(personPresent ? "looking-away" : "no-face")
    } else if (faces.length > 1) {
      setFaceSignals({ faceCount: faces.length, headAway: false, gazeAway: false, eyesClosed: false, debug: null })
      resetTracking()
      commitStatus("multiple-faces")
    } else {
      const face = faces[0]
      const rawYaw = face.rotation?.angle.yaw ?? 0
      const mesh = face.meshRaw && face.meshRaw.length >= 478 ? face.meshRaw : face.mesh
      // Our own both-eyes-averaged gaze, not Human's built-in single-eye
      // gaze.strength.
      const rawGazeStrength = getGazeOffset(mesh)

      const yawOffset = smoothed(yawHistoryRef.current, rawYaw, YAW_SMOOTHING_WINDOW)
      const ear = smoothed(earHistoryRef.current, getEyeAspectRatio(mesh), GAZE_SMOOTHING_WINDOW)
      const gazeStrength = smoothed(gazeStrengthHistoryRef.current, rawGazeStrength, GAZE_SMOOTHING_WINDOW)

      // Feed the smoothing histories during warmup (so they're primed with
      // real data once it ends) but throw the readings away otherwise.
      if (warmupCyclesRemainingRef.current > 0) {
        warmupCyclesRemainingRef.current -= 1
        setFaceSignals({ faceCount: 1, headAway: false, gazeAway: false, eyesClosed: false, debug: null })
        commitStatus("calibrating")
        return
      }

      if (!baselineRef.current) {
        const samples = calibrationSamplesRef.current
        samples.yaw.push(yawOffset)
        samples.ear.push(ear)
        samples.gazeStrength.push(gazeStrength)

        if (samples.yaw.length < CALIBRATION_SAMPLES_NEEDED) {
          setFaceSignals({ faceCount: 1, headAway: false, gazeAway: false, eyesClosed: false, debug: null })
          commitStatus("calibrating")
          return
        }

        // Requiring the samples to actually be STILL (a small spread) before
        // accepting them catches a real bug: if most/all samples land during
        // motion, the baseline itself ends up representing "turned."
        const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr)
        const MAX_YAW_SPREAD = 0.15
        if (spread(samples.yaw) > MAX_YAW_SPREAD && calibrationRestartsRef.current < CALIBRATION_MAX_RESTARTS) {
          calibrationRestartsRef.current += 1
          calibrationSamplesRef.current = { yaw: [], ear: [], gazeStrength: [] }
          setFaceSignals({ faceCount: 1, headAway: false, gazeAway: false, eyesClosed: false, debug: null })
          commitStatus("calibrating")
          return
        }
        calibrationRestartsRef.current = 0
        // Median, not mean: resists outlier samples during settling-in.
        const median = (arr: number[]) => {
          const sorted = [...arr].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
        }
        baselineRef.current = {
          yaw: median(samples.yaw),
          ear: median(samples.ear),
          gazeStrength: median(samples.gazeStrength),
        }
      }

      const baseline = baselineRef.current
      const headAway = hasDrifted(yawOffset, baseline.yaw, 0.26)
      const eyesClosed = areEyesClosed(ear, baseline.ear)
      const gazeAway = hasDrifted(gazeStrength, baseline.gazeStrength, 0.13)

      // Priority order matters here: if the head is also turned, that's
      // reported as "looking-away" (head), not "gaze-away" (eyes).
      const rawStatus: AttentionStatus = objectHit
        ? "object-detected"
        : headAway
          ? "looking-away"
          : eyesClosed
            ? "eyes-closed"
            : gazeAway
              ? "gaze-away"
              : "engaged"
      commitStatus(rawStatus)

      // Each panel boolean is debounced on its own instead of being derived
      // from the single committed status, so a genuine combined head+eye
      // movement shows both instead of one hiding under the other.
      setFaceSignals({
        faceCount: 1,
        headAway: commitBoolean(headAwayWindowRef, headAway),
        gazeAway: commitBoolean(gazeAwayWindowRef, gazeAway),
        eyesClosed: commitBoolean(eyesClosedWindowRef, eyesClosed),
        debug: {
          yaw: yawOffset,
          yawBaseline: baseline.yaw,
          ear,
          earBaseline: baseline.ear,
          gazeStrength,
          gazeStrengthBaseline: baseline.gazeStrength,
        },
      })
    }
  }

  return {
    status,
    faceSignals,
    objectLabels,
    errorMessage,
    running,
    videoRef,
    canvasRef,
    start,
    stop,
  }
}
