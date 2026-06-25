import type { Validator } from "./types";
import { size } from "./size";
import { brightness } from "./brightness";
import { contrast } from "./contrast";
import { blur } from "./blur";
import { glare } from "./glare";
import { grayscale } from "./grayscale";
import { face } from "./face";

export { createImageContext } from "./context";
export { runValidators } from "./runner";
export * from "./types";

// TIER1: cheap pixel-statistics checks.
export const TIER1: Validator[] = [size, grayscale, brightness, contrast, blur, glare];

// TIER2: model-based checks (MediaPipe FaceLandmarker).
export const TIER2: Validator[] = [face];

export const DEFAULT_VALIDATORS: Validator[] = [...TIER1, ...TIER2];
