import {
  GestureRecognizer,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';

export interface DetectionResult {
  gesture: string | null;
  landmarks: Array<{ x: number; y: number; z: number }>;
  score: number;
}

const PREFIX = '[MediaPipe]';

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

function getModelPath(): string {
  return import.meta.env.BASE_URL + 'models/gesture_recognizer.task';
}

export async function initGestureRecognizer(): Promise<GestureRecognizer> {
  const modelPath = getModelPath();

  console.log(`${PREFIX} Initializing Gesture Recognizer...`);
  console.log(`${PREFIX}   WASM source: ${WASM_CDN}`);
  console.log(`${PREFIX}   Model path:  ${modelPath}`);
  console.log(`${PREFIX}   Delegate:    GPU`);
  console.log(`${PREFIX}   Mode:        VIDEO`);
  console.log(`${PREFIX}   Hands:       1`);

  const t0 = performance.now();

  console.log(`${PREFIX} Loading WASM vision fileset...`);
  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
  const t1 = performance.now();
  console.log(`${PREFIX} WASM loaded in ${(t1 - t0).toFixed(0)}ms`);

  console.log(`${PREFIX} Creating GestureRecognizer from model...`);
  const recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  const t2 = performance.now();
  console.log(`${PREFIX} Model loaded in ${(t2 - t1).toFixed(0)}ms`);
  console.log(
    `${PREFIX} GestureRecognizer ready (total init: ${(t2 - t0).toFixed(0)}ms)`,
  );

  return recognizer;
}

export function runDetectionLoop(
  recognizer: GestureRecognizer,
  video: HTMLVideoElement,
  onResult: (result: DetectionResult) => void,
  isRunningRef: { current: boolean },
): void {
  let frameCount = 0;
  let lastLogTime = performance.now();
  let lastGestureLogged: string | null = null;

  console.log(`${PREFIX} Detection loop starting...`);

  function detect() {
    if (!isRunningRef.current) {
      console.log(
        `${PREFIX} Detection loop stopped (isRunning=false) after ${frameCount} frames`,
      );
      return;
    }

    if (video.readyState < 2) {
      requestAnimationFrame(detect);
      return;
    }

    let results: GestureRecognizerResult;
    try {
      results = recognizer.recognizeForVideo(video, performance.now());
    } catch (err) {
      if (frameCount === 0) {
        console.warn(`${PREFIX} First recognizeForVideo call failed:`, err);
      }
      if (isRunningRef.current) requestAnimationFrame(detect);
      return;
    }

    frameCount += 1;

    let gesture: string | null = null;
    let score = 0;
    let landmarks: Array<{ x: number; y: number; z: number }> = [];

    if (results.landmarks && results.landmarks.length > 0) {
      landmarks = results.landmarks[0].map((l) => ({
        x: l.x,
        y: l.y,
        z: l.z,
      }));
    }

    if (results.gestures && results.gestures.length > 0) {
      const top = results.gestures[0][0];
      gesture = top.categoryName;
      score = top.score;
    }

    // Log gesture changes
    if (gesture !== lastGestureLogged) {
      if (gesture) {
        console.log(
          `${PREFIX} Gesture: ${gesture} (confidence: ${(score * 100).toFixed(1)}%) | hand landmarks: ${landmarks.length}`,
        );
      } else if (lastGestureLogged) {
        console.log(`${PREFIX} Gesture: none (hand lost or no gesture)`);
      }
      lastGestureLogged = gesture;
    }

    // FPS log every 5 seconds
    const now = performance.now();
    if (now - lastLogTime >= 5000) {
      const elapsed = (now - lastLogTime) / 1000;
      const fps = (frameCount / elapsed).toFixed(1);
      console.log(
        `${PREFIX} Loop stats: ${frameCount} frames, ~${fps} fps | hand: ${landmarks.length > 0 ? 'detected' : 'none'}`,
      );
      frameCount = 0;
      lastLogTime = now;
    }

    onResult({ gesture, landmarks, score });

    if (isRunningRef.current) {
      requestAnimationFrame(detect);
    }
  }

  requestAnimationFrame(detect);
}
