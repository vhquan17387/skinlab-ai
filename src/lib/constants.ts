export const DISCLAIMER_TEXT =
  "Kết quả phân tích chỉ mang tính tham khảo, không phải chẩn đoán y khoa và không thay thế việc thăm khám với bác sĩ da liễu.";

export const SKIN_CONCERN_OPTIONS = [
  { value: "acne", label: "Mụn" },
  { value: "wrinkles", label: "Nếp nhăn" },
  { value: "pigmentation", label: "Sạm/nám" },
  { value: "redness", label: "Mẩn đỏ" },
  { value: "dryness", label: "Khô da" },
  { value: "oiliness", label: "Da dầu" },
  { value: "pores", label: "Lỗ chân lông to" },
  { value: "darkcircles", label: "Quầng thâm mắt" },
] as const;

export const SKIN_CONCERN_VALUES = SKIN_CONCERN_OPTIONS.map((o) => o.value);
export type SkinConcern = (typeof SKIN_CONCERN_OPTIONS)[number]["value"];

// Mô tả ngắn cho từng trục da, hiển thị kèm điểm trên báo cáo.
// Key trùng với key của signal do provider trả về (xem claude-provider.ts / mock-provider.ts).
export const SIGNAL_DESCRIPTION_VI: Record<string, string> = {
  acne: "Mức độ mụn quan sát được trên bề mặt da. Điểm càng cao nghĩa là càng ít mụn.",
  wrinkles: "Mức độ nếp nhăn và rãnh trên da. Điểm càng cao nghĩa là da càng căng mịn.",
  pigmentation: "Mức độ sạm, nám, đốm nâu. Điểm càng cao nghĩa là sắc tố càng ít, da càng sáng đều.",
  redness: "Mức độ mẩn đỏ, kích ứng. Điểm càng cao nghĩa là da càng ít đỏ, ổn định hơn.",
  dryness: "Mức độ khô, bong tróc. Điểm càng cao nghĩa là da càng ít khô.",
  oiliness: "Mức độ dầu, bóng nhờn. Điểm càng cao nghĩa là da càng cân bằng dầu.",
  pores: "Mức độ lỗ chân lông to. Điểm càng cao nghĩa là lỗ chân lông càng nhỏ, mịn.",
  darkcircles: "Mức độ quầng thâm vùng mắt. Điểm càng cao nghĩa là vùng mắt càng tươi sáng.",
  hydration: "Độ ẩm tổng thể của da. Điểm càng cao nghĩa là da càng đủ ẩm.",
  evenness: "Độ đều màu của da. Điểm càng cao nghĩa là tông da càng đồng đều.",
};

// Giải thích ý nghĩa thang điểm, dùng chung cho báo cáo.
export const SCORE_SCALE_EXPLANATION_VI =
  "Mỗi trục được chấm theo thang 0–100, trong đó 100 luôn là tốt nhất. Với các trục \"vấn đề\" (mụn, nếp nhăn, sạm nám…), điểm cao nghĩa là vấn đề đó càng ít. Với các trục \"chất lượng\" (độ ẩm, đều màu), điểm cao nghĩa là da càng tốt. Điểm tổng quan là trung bình của tất cả các trục.";

// Ngưỡng xếp loại điểm tổng quan: ≥75 Tốt, ≥50 Trung bình, còn lại Cần cải thiện.
export const SCORE_BAND_EXPLANATION_VI = [
  { min: 75, label: "Tốt", hint: "75–100 điểm" },
  { min: 50, label: "Trung bình", hint: "50–74 điểm" },
  { min: 0, label: "Cần cải thiện", hint: "Dưới 50 điểm" },
] as const;

export const SUBMISSION_STATUSES = [
  "new",
  "processing",
  "completed",
  "need_retake",
  "failed",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const STATUS_LABEL_VI: Record<SubmissionStatus, string> = {
  new: "Mới",
  processing: "Đang phân tích",
  completed: "Hoàn tất",
  need_retake: "Cần chụp lại",
  failed: "Thất bại",
};

export const IMAGE_KINDS = ["front", "left", "right"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const IMAGE_KIND_LABEL_VI: Record<ImageKind, string> = {
  front: "Khuôn mặt chính diện",
  left: "Vùng da 1",
  right: "Vùng da 2",
};

// Gợi ý dưới mỗi ô upload ảnh.
export const IMAGE_KIND_HINT_VI: Record<ImageKind, string> = {
  front: "Chụp rõ toàn khuôn mặt, chính diện.",
  left: "Chụp cận cảnh vùng da cần phân tích (mặt hoặc vùng da bị tổn thương).",
  right: "Chụp cận cảnh một vùng da khác (hoặc cùng vùng ở góc khác).",
};

export const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL || 600);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];
