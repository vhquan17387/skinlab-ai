import type { Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";
import { computeLumaStats } from "./grayscale";

// Fraction of near-white "blown-out" pixels indicating glare / reflection.
const BRIGHT_THRESHOLD = 245;
const MAX_BRIGHT_FRACTION = 0.12;

export const glare: Validator = (ctx) => {
  const { values } = computeLumaStats(ctx.analysisData);
  let bright = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= BRIGHT_THRESHOLD) bright++;
  }
  const fraction = bright / values.length;
  if (fraction > MAX_BRIGHT_FRACTION) {
    return fail(
      ValidationCode.GLARE_HIGH,
      "Ảnh bị lóa sáng/phản chiếu nhiều. Vui lòng tránh đèn flash hoặc ánh sáng chiếu trực tiếp.",
      fraction,
    );
  }
  return ok;
};
