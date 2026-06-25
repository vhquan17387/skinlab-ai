import type { Validator } from "./types";
import { ValidationCode, fail, ok } from "./types";

const MIN_EDGE = 480; // px on the shorter edge

export const size: Validator = (ctx) => {
  const shortEdge = Math.min(ctx.width, ctx.height);
  if (shortEdge < MIN_EDGE) {
    return fail(
      ValidationCode.SIZE_TOO_SMALL,
      `Ảnh có độ phân giải quá thấp (${ctx.width}×${ctx.height}). Vui lòng chụp ảnh lớn hơn, rõ nét hơn.`,
      shortEdge,
    );
  }
  return ok;
};
