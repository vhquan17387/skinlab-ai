import type { Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";
import { computeLumaStats } from "./grayscale";

const MIN_MEAN = 55;
const MAX_MEAN = 215;

export const brightness: Validator = (ctx) => {
  const { mean } = computeLumaStats(ctx.analysisData);
  if (mean < MIN_MEAN) {
    return fail(
      ValidationCode.TOO_DARK,
      "Ảnh quá tối, vui lòng chụp ở nơi đủ sáng.",
      mean,
    );
  }
  if (mean > MAX_MEAN) {
    return fail(
      ValidationCode.TOO_BRIGHT,
      "Ảnh quá sáng/chói, vui lòng giảm ánh sáng hoặc tránh ngược sáng.",
      mean,
    );
  }
  return ok;
};
