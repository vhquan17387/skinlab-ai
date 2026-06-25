import type { Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";
import { computeLumaStats } from "./grayscale";

const MIN_STD = 28; // standard deviation of luminance

export const contrast: Validator = (ctx) => {
  const { std } = computeLumaStats(ctx.analysisData);
  if (std < MIN_STD) {
    return fail(
      ValidationCode.LOW_CONTRAST,
      "Ảnh bị mờ nhạt / thiếu độ tương phản. Vui lòng chụp lại nơi đủ sáng và rõ nét.",
      std,
    );
  }
  return ok;
};
