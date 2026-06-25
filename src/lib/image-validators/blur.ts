import type { Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";
import { computeLumaStats } from "./grayscale";

// Variance of the Laplacian — a standard sharpness metric. Low variance = blurry.
const MIN_LAPLACIAN_VAR = 70;

export const blur: Validator = (ctx) => {
  const { analysisData } = ctx;
  const w = analysisData.width;
  const h = analysisData.height;
  const { values } = computeLumaStats(analysisData);

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * values[i] -
        values[i - 1] -
        values[i + 1] -
        values[i - w] -
        values[i + w];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return ok;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  if (variance < MIN_LAPLACIAN_VAR) {
    return fail(
      ValidationCode.BLUR_HIGH,
      "Ảnh quá mờ, vui lòng giữ máy ổn định và lấy nét vào khuôn mặt.",
      variance,
    );
  }
  return ok;
};
