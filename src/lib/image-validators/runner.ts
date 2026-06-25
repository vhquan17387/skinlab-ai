import type { ImageContext, Validator, ValidationResult } from "./types";
import { ValidationCode } from "./types";

/** Run validators in order, stopping at the first failure. */
export async function runValidators(
  ctx: ImageContext,
  validators: Validator[],
): Promise<ValidationResult> {
  for (const validator of validators) {
    try {
      const result = await validator(ctx);
      if (!result.ok) return result;
    } catch (err) {
      return {
        ok: false,
        code: ValidationCode.INTERNAL_ERROR,
        message: "Lỗi khi kiểm tra ảnh, vui lòng thử lại.",
        metric: undefined,
      };
    }
  }
  return { ok: true };
}
