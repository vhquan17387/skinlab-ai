import type { ImageKind } from "@/lib/constants";

export enum ValidationCode {
  SIZE_TOO_SMALL = "size_too_small",
  BLUR_HIGH = "blur_high",
  TOO_DARK = "too_dark",
  TOO_BRIGHT = "too_bright",
  LOW_CONTRAST = "low_contrast",
  GLARE_HIGH = "glare_high",
  NO_FACE = "no_face",
  FACE_TOO_SMALL = "face_too_small",
  WRONG_ANGLE = "wrong_angle",
  INTERNAL_ERROR = "internal_error",
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationCode; message: string; metric?: number };

export interface ImageContext {
  file: File;
  kind?: ImageKind;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  // Downscaled (max 512px on the long edge) pixel data for cheap stats.
  analysisData: ImageData;
}

export type Validator = (
  ctx: ImageContext,
) => ValidationResult | Promise<ValidationResult>;

export const ok: ValidationResult = { ok: true };

export function fail(
  code: ValidationCode,
  message: string,
  metric?: number,
): ValidationResult {
  return { ok: false, code, message, metric };
}
