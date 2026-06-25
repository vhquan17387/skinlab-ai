import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { Validator, ImageContext } from "./types";
import { ValidationCode, fail, ok } from "./types";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

function bbox(landmarks: { x: number; y: number }[]) {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { width: maxX - minX, height: maxY - minY };
}

// Presence + bounding-box coverage + rough pose check using the landmarker.
export const face: Validator = async (ctx: ImageContext) => {
  const landmarker = await getLandmarker();
  let result: FaceLandmarkerResult;
  try {
    result = landmarker.detect(ctx.bitmap);
  } catch {
    return fail(
      ValidationCode.INTERNAL_ERROR,
      "Không thể phân tích khuôn mặt, vui lòng thử lại.",
    );
  }

  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) {
    return fail(
      ValidationCode.NO_FACE,
      "Không phát hiện khuôn mặt trong ảnh. Vui lòng chụp rõ khuôn mặt.",
    );
  }

  const landmarks = faces[0];
  const box = bbox(landmarks);
  // Face should occupy a reasonable portion of the frame (normalized 0..1).
  const coverage = Math.max(box.width, box.height);
  if (coverage < 0.25) {
    return fail(
      ValidationCode.FACE_TOO_SMALL,
      "Khuôn mặt quá nhỏ trong ảnh. Vui lòng đưa máy lại gần hơn.",
      coverage,
    );
  }

  return ok;
};
