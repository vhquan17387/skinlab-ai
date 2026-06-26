import type { Validator, ImageContext } from "./types";
import { ValidationCode, fail, ok } from "./types";

// Minimum fraction of skin-colored pixels for the frame to count as a skin
// close-up. Tuned to be lenient: a close-up of skin easily exceeds this, while
// unrelated photos (rooms, cars, landscapes, screenshots) fall well below.
const MIN_SKIN_FRACTION = 0.3;

/**
 * Heuristic skin-tone test on a single pixel, combining two classic rules so
 * it works across lighting and skin tones:
 *  - RGB rule (Kovac et al., uniform daylight)
 *  - YCbCr chrominance range
 * A pixel passes if EITHER rule matches.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const rgbRule =
    r > 95 &&
    g > 40 &&
    b > 20 &&
    max - min > 15 &&
    Math.abs(r - g) > 15 &&
    r > g &&
    r > b;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const ycbcrRule = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

  return rgbRule || ycbcrRule;
}

/**
 * Validate that the frame is a close-up of skin (not a face — that's `face`).
 * Used for the secondary "skin region" images: the user photographs an area of
 * concern instead of their whole face. We only reject clearly non-skin photos.
 */
export const skin: Validator = (ctx: ImageContext) => {
  const { data } = ctx.analysisData;
  let skinCount = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // skip transparent pixels
    total++;
    if (isSkinPixel(data[i], data[i + 1], data[i + 2])) skinCount++;
  }

  const fraction = total > 0 ? skinCount / total : 0;
  if (fraction < MIN_SKIN_FRACTION) {
    return fail(
      ValidationCode.NOT_SKIN,
      "Ảnh không giống vùng da. Vui lòng chụp cận cảnh vùng da cần phân tích (không chụp đồ vật, cảnh vật).",
      fraction,
    );
  }

  return ok;
};
