/**
 * Eye interaction controller — uses MediaPipe FaceLandmarker to detect iris
 * position for gaze estimation and face blendshapes for blink detection.
 *
 * Draws eye-contour + iris data points on an optional overlay canvas so the
 * user can see what the model sees.
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GazeTarget {
  /** Normalised horizontal gaze: 0 = screen-left, 1 = screen-right. */
  x: number;
  /** Normalised vertical gaze: 0 = top, 1 = bottom. */
  y: number;
  /** 0-1 confidence (currently fixed at 0.8 when a face is detected). */
  confidence: number;
}

export interface EyeTrackingState {
  initialized: boolean;
  tracking: boolean;
  calibrated: boolean;
  error: string | null;
}

export type GazeCallback = (target: GazeTarget) => void;
export type BlinkCallback = () => void;
export type WinkSide = 'left' | 'right';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG = '[EyeTracking]';

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// MediaPipe face-mesh landmark indices
const LEFT_EYE_CONTOUR = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
const RIGHT_EYE_CONTOUR = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
  398,
];
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

const LEFT_EYE_INNER = 33;
const LEFT_EYE_OUTER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;

const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

const BLINK_THRESHOLD = 0.45;
const BLINK_COOLDOWN_MS = 600;
// Wink detection uses a close-hold-release pattern:
// 1. One eye closes while the other stays open → start tracking
// 2. If both eyes close → cancel (it was a blink)
// 3. When the closed eye opens again, if held long enough → commit the wink
const WINK_CLOSE_THRESHOLD = 0.32;
const WINK_RELEASE_THRESHOLD = 0.24;
const WINK_ASYMMETRY_THRESHOLD = 0.10;
const WINK_OTHER_EYE_MAX = 0.55;
const WINK_MIN_HOLD_FRAMES = 3;
const WINK_COOLDOWN_MS = 800;
const GAZE_SMOOTH_WINDOW = 5;
const GAZE_H_MIN = 0.36;
const GAZE_H_MAX = 0.64;
const GAZE_V_MIN = 0.20;
const GAZE_V_MAX = 0.80;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let landmarker: FaceLandmarker | null = null;
let trackingVideo: HTMLVideoElement | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let isTracking = false;
let rafId: number | null = null;

let latestGaze: GazeTarget | null = null;
let blinkFlag = false;
let lastBlinkTime = 0;
let leftWinkFlag = false;
let rightWinkFlag = false;
let lastWinkTime = 0;
// Wink state machine: tracks a potential wink from close → hold → release
let winkCandidate: 'left' | 'right' | null = null;
let winkHoldFrames = 0;
const gazeBuffer: Array<{ x: number; y: number }> = [];

let state: EyeTrackingState = {
  initialized: false,
  tracking: false,
  calibrated: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initializeEyeTracking(): Promise<EyeTrackingState> {
  console.log(`${LOG} Initializing FaceLandmarker...`);
  const t0 = performance.now();

  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
  console.log(`${LOG} WASM loaded in ${(performance.now() - t0).toFixed(0)}ms`);

  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });

  console.log(
    `${LOG} FaceLandmarker ready (total ${(performance.now() - t0).toFixed(0)}ms)`,
  );

  state = { initialized: true, tracking: false, calibrated: false, error: null };
  return { ...state };
}

export function startTracking(
  videoEl: HTMLVideoElement,
  canvasEl?: HTMLCanvasElement,
): void {
  trackingVideo = videoEl;
  overlayCanvas = canvasEl ?? null;
  overlayCtx = overlayCanvas?.getContext('2d') ?? null;
  isTracking = true;
  state = { ...state, tracking: true };
  console.log(`${LOG} Tracking started`);
  processFrame();
}

export function stopTracking(): void {
  isTracking = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  state = { ...state, tracking: false };
  console.log(`${LOG} Tracking stopped`);
}

export function getCurrentGazeTarget(): GazeTarget | null {
  return latestGaze;
}

export function detectBlinkSelection(): boolean {
  if (blinkFlag) {
    blinkFlag = false;
    return true;
  }
  return false;
}

/** Returns 'left' | 'right' if a wink was detected since last call, or null. */
export function detectWink(): WinkSide | null {
  if (rightWinkFlag) {
    rightWinkFlag = false;
    leftWinkFlag = false;
    return 'right';
  }
  if (leftWinkFlag) {
    leftWinkFlag = false;
    rightWinkFlag = false;
    return 'left';
  }
  return null;
}

export function getState(): EyeTrackingState {
  return { ...state };
}

export function cleanup(): void {
  stopTracking();
  landmarker?.close();
  landmarker = null;
  trackingVideo = null;
  overlayCanvas = null;
  overlayCtx = null;
  latestGaze = null;
  blinkFlag = false;
  leftWinkFlag = false;
  rightWinkFlag = false;
  winkCandidate = null;
  winkHoldFrames = 0;
  gazeBuffer.length = 0;
  state = { initialized: false, tracking: false, calibrated: false, error: null };
  console.log(`${LOG} Cleaned up`);
}

// Kept for API surface compatibility — reserved for future event-driven mode
export function onGaze(_cb: GazeCallback): void { /* reserved */ }
export function onBlink(_cb: BlinkCallback): void { /* reserved */ }

// ---------------------------------------------------------------------------
// Internal — per-frame processing
// ---------------------------------------------------------------------------

function processFrame(): void {
  if (!isTracking || !landmarker || !trackingVideo) return;

  if (trackingVideo.readyState < 2) {
    rafId = requestAnimationFrame(processFrame);
    return;
  }

  let results;
  try {
    results = landmarker.detectForVideo(trackingVideo, performance.now());
  } catch {
    rafId = requestAnimationFrame(processFrame);
    return;
  }

  // Resize canvas to match its CSS size for crisp drawing
  if (overlayCanvas && overlayCtx) {
    const dw = overlayCanvas.clientWidth;
    const dh = overlayCanvas.clientHeight;
    if (overlayCanvas.width !== dw || overlayCanvas.height !== dh) {
      overlayCanvas.width = dw;
      overlayCanvas.height = dh;
    }
    overlayCtx.clearRect(0, 0, dw, dh);
  }

  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
    const lm = results.faceLandmarks[0];

    if (overlayCtx && overlayCanvas) {
      drawEyeLandmarks(lm, overlayCtx, overlayCanvas.width, overlayCanvas.height);
    }

    computeGaze(lm);

    const categories = results.faceBlendshapes?.[0]?.categories as
      | Array<{ categoryName: string; score: number }>
      | undefined;
    checkBlink(categories);
  } else {
    latestGaze = null;
  }

  rafId = requestAnimationFrame(processFrame);
}

// ---------------------------------------------------------------------------
// Drawing — eye contour dots + iris data points
// ---------------------------------------------------------------------------

type Lm = Array<{ x: number; y: number; z: number }>;

function drawEyeLandmarks(
  lm: Lm,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  // Eye contour — small cyan dots
  ctx.fillStyle = 'rgba(0, 255, 255, 0.75)';
  for (const idx of LEFT_EYE_CONTOUR) {
    const pt = lm[idx];
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const idx of RIGHT_EYE_CONTOUR) {
    const pt = lm[idx];
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Iris boundary — bright green dots
  ctx.fillStyle = '#00ff88';
  for (const idx of LEFT_IRIS) {
    const pt = lm[idx];
    const r = idx === 468 ? 4 : 3;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const idx of RIGHT_IRIS) {
    const pt = lm[idx];
    const r = idx === 473 ? 4 : 3;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Iris center crosshairs
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.5;
  for (const idx of [468, 473]) {
    const pt = lm[idx];
    const px = pt.x * w;
    const py = pt.y * h;
    ctx.beginPath();
    ctx.moveTo(px - 7, py);
    ctx.lineTo(px + 7, py);
    ctx.moveTo(px, py - 7);
    ctx.lineTo(px, py + 7);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Gaze estimation — iris ratio within eye bounds → normalised screen coords
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function computeGaze(lm: Lm): void {
  if (lm.length < 478) {
    latestGaze = null;
    return;
  }

  const leftIris = lm[468];
  const rightIris = lm[473];

  // Horizontal ratio: where is the iris between inner and outer corners?
  const lw = lm[LEFT_EYE_OUTER].x - lm[LEFT_EYE_INNER].x;
  const rw = lm[RIGHT_EYE_OUTER].x - lm[RIGHT_EYE_INNER].x;
  const lrx = lw !== 0 ? (leftIris.x - lm[LEFT_EYE_INNER].x) / lw : 0.5;
  const rrx = rw !== 0 ? (rightIris.x - lm[RIGHT_EYE_INNER].x) / rw : 0.5;
  const avgX = (lrx + rrx) / 2;

  // Vertical ratio: where is the iris between top/bottom lids?
  const lh = lm[LEFT_EYE_BOTTOM].y - lm[LEFT_EYE_TOP].y;
  const rh = lm[RIGHT_EYE_BOTTOM].y - lm[RIGHT_EYE_TOP].y;
  const lry = lh > 0 ? (leftIris.y - lm[LEFT_EYE_TOP].y) / lh : 0.5;
  const rry = rh > 0 ? (rightIris.y - lm[RIGHT_EYE_TOP].y) / rh : 0.5;
  const avgY = (lry + rry) / 2;

  // Expand from typical iris range to full 0-1
  const expX = clamp((avgX - GAZE_H_MIN) / (GAZE_H_MAX - GAZE_H_MIN), 0, 1);
  const expY = clamp((avgY - GAZE_V_MIN) / (GAZE_V_MAX - GAZE_V_MIN), 0, 1);

  // Mirror horizontally (CSS scaleX(-1) on the video)
  const screenX = 1 - expX;
  const screenY = expY;

  // Moving-average smoothing
  gazeBuffer.push({ x: screenX, y: screenY });
  if (gazeBuffer.length > GAZE_SMOOTH_WINDOW) gazeBuffer.shift();

  const sx = gazeBuffer.reduce((s, g) => s + g.x, 0) / gazeBuffer.length;
  const sy = gazeBuffer.reduce((s, g) => s + g.y, 0) / gazeBuffer.length;

  latestGaze = { x: sx, y: sy, confidence: 0.8 };
}

// ---------------------------------------------------------------------------
// Blink detection via face blendshapes
// ---------------------------------------------------------------------------

function checkBlink(
  categories?: Array<{ categoryName: string; score: number }>,
): void {
  if (!categories) return;

  const now = performance.now();

  const leftScore =
    categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
  const rightScore =
    categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;

  const bothClosed = leftScore > BLINK_THRESHOLD && rightScore > BLINK_THRESHOLD;

  // --- Full blink (both eyes): answer selection ---
  if (bothClosed && now - lastBlinkTime >= BLINK_COOLDOWN_MS) {
    blinkFlag = true;
    lastBlinkTime = now;
    lastWinkTime = now;
    winkCandidate = null;
    winkHoldFrames = 0;
    console.log(
      `${LOG} Blink detected (L: ${leftScore.toFixed(2)}, R: ${rightScore.toFixed(2)})`,
    );
    return;
  }

  // --- Wink state machine: close → hold → release ---
  if (now - lastWinkTime < WINK_COOLDOWN_MS) {
    winkCandidate = null;
    winkHoldFrames = 0;
    return;
  }

  const rightClosed =
    rightScore > WINK_CLOSE_THRESHOLD &&
    rightScore - leftScore > WINK_ASYMMETRY_THRESHOLD &&
    leftScore < WINK_OTHER_EYE_MAX;
  const leftClosed =
    leftScore > WINK_CLOSE_THRESHOLD &&
    leftScore - rightScore > WINK_ASYMMETRY_THRESHOLD &&
    rightScore < WINK_OTHER_EYE_MAX;

  if (winkCandidate === null) {
    // No wink in progress — check if one is starting
    if (rightClosed) {
      winkCandidate = 'right';
      winkHoldFrames = 1;
    } else if (leftClosed) {
      winkCandidate = 'left';
      winkHoldFrames = 1;
    }
  } else {
    // Wink in progress — track the same eye until it releases.
    if (bothClosed) {
      // Both eyes closed → it's becoming a blink, cancel the wink.
      winkCandidate = null;
      winkHoldFrames = 0;
    } else if (winkCandidate === 'right') {
      if (rightClosed) {
        winkHoldFrames++;
      } else if (rightScore < WINK_RELEASE_THRESHOLD) {
        // Right-eye release after sufficient hold commits a right wink.
        if (winkHoldFrames >= WINK_MIN_HOLD_FRAMES) {
          rightWinkFlag = true;
          lastWinkTime = now;
          lastBlinkTime = now;
          console.log(
            `${LOG} Right wink committed on release after ${winkHoldFrames} frames` +
            ` (L: ${leftScore.toFixed(2)}, R: ${rightScore.toFixed(2)})`,
          );
        }
        winkCandidate = null;
        winkHoldFrames = 0;
      } else {
        // Ambiguous transition (noise); drop candidate instead of false-firing.
        winkCandidate = null;
        winkHoldFrames = 0;
      }
    } else {
      if (leftClosed) {
        winkHoldFrames++;
      } else if (leftScore < WINK_RELEASE_THRESHOLD) {
        // Left-eye release after sufficient hold commits a left wink.
        if (winkHoldFrames >= WINK_MIN_HOLD_FRAMES) {
          leftWinkFlag = true;
          lastWinkTime = now;
          lastBlinkTime = now;
          console.log(
            `${LOG} Left wink committed on release after ${winkHoldFrames} frames` +
            ` (L: ${leftScore.toFixed(2)}, R: ${rightScore.toFixed(2)})`,
          );
        }
        winkCandidate = null;
        winkHoldFrames = 0;
      } else {
        // Ambiguous transition (noise); drop candidate instead of false-firing.
        winkCandidate = null;
        winkHoldFrames = 0;
      }
    }
  }
}
