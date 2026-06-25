import type { ImageContext, Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";

export interface LumaStats {
  values: Float32Array; // per-pixel luminance 0..255
  mean: number;
  std: number;
  meanSaturation: number; // 0..1
}

/** Compute luminance + saturation stats from downscaled ImageData. */
export function computeLumaStats(data: ImageData): LumaStats {
  const { data: px } = data;
  const n = px.length / 4;
  const values = new Float32Array(n);
  let sum = 0;
  let satSum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    values[j] = luma;
    sum += luma;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let j = 0; j < n; j++) {
    const d = values[j] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  return { values, mean, std, meanSaturation: satSum / n };
}

// Reject (near) grayscale photos — skin analysis needs colour information.
export const grayscale: Validator = (ctx: ImageContext) => {
  const { meanSaturation } = computeLumaStats(ctx.analysisData);
  if (meanSaturation < 0.06) {
    return fail(
      ValidationCode.LOW_CONTRAST,
      "Ảnh có vẻ là ảnh đen trắng. Vui lòng dùng ảnh màu chụp rõ khuôn mặt.",
      meanSaturation,
    );
  }
  return ok;
};
