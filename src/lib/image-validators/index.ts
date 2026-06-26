import type { Validator } from "./types";
import type { ImageKind } from "@/lib/constants";
import { size } from "./size";
import { brightness } from "./brightness";
import { contrast } from "./contrast";
import { blur } from "./blur";
import { glare } from "./glare";
import { grayscale } from "./grayscale";
import { face } from "./face";
import { skin } from "./skin";

export { createImageContext } from "./context";
export { runValidators } from "./runner";
export * from "./types";

// TIER1: cheap pixel-statistics checks.
export const TIER1: Validator[] = [size, grayscale, brightness, contrast, blur, glare];

// TIER2: model-based checks (MediaPipe FaceLandmarker).
export const TIER2: Validator[] = [face];

export const DEFAULT_VALIDATORS: Validator[] = [...TIER1, ...TIER2];

/**
 * Validators per image kind:
 *  - "front": full face required (TIER1 + face landmarker).
 *  - others ("left"/"right"): a skin close-up of the area of concern — TIER1
 *    plus a lenient skin-tone check instead of face detection.
 */
export function validatorsForKind(kind: ImageKind): Validator[] {
  return kind === "front" ? [...TIER1, face] : [...TIER1, skin];
}
