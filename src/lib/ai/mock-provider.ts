import type {
  SkinAnalysisProvider,
  SkinAnalysisInput,
  RawSkinAnalysisResult,
  RawSkinSignal,
  SkinAxis,
} from "./types";

// Deterministic FNV-1a hash → stable pseudo-random scores per submissionId.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededValue(seed: number, idx: number, scale: number): number {
  const x = fnv1a(`${seed}:${idx}`);
  return (x % (scale + 1));
}

const AXES: {
  key: string;
  label: string;
  axis: SkinAxis;
  scale: number;
  rationale: string;
}[] = [
  { key: "acne", label: "Mụn", axis: "severity", scale: 10, rationale: "[MOCK] Quan sát một vài nốt nhỏ ở vùng cằm và hai bên má, không có viêm rõ." },
  { key: "wrinkles", label: "Nếp nhăn", axis: "severity", scale: 10, rationale: "[MOCK] Vùng trán và đuôi mắt có nếp nhăn mảnh, lộ rõ hơn khi biểu cảm." },
  { key: "pigmentation", label: "Sạm/nám", axis: "severity", scale: 10, rationale: "[MOCK] Vài đốm sắc tố nhạt ở gò má, ranh giới không rõ." },
  { key: "redness", label: "Mẩn đỏ", axis: "severity", scale: 10, rationale: "[MOCK] Ửng đỏ nhẹ quanh cánh mũi, phần còn lại của da khá đều." },
  { key: "dryness", label: "Khô da", axis: "severity", scale: 10, rationale: "[MOCK] Bề mặt má hơi khô, không thấy bong tróc." },
  { key: "oiliness", label: "Da dầu", axis: "severity", scale: 10, rationale: "[MOCK] Vùng chữ T (trán, mũi) hơi bóng dầu." },
  { key: "pores", label: "Lỗ chân lông to", axis: "severity", scale: 10, rationale: "[MOCK] Lỗ chân lông to vừa ở hai bên cánh mũi." },
  { key: "darkcircles", label: "Quầng thâm mắt", axis: "severity", scale: 10, rationale: "[MOCK] Vùng dưới mắt thâm nhẹ, hơi rõ ở bên trái." },
  { key: "hydration", label: "Độ ẩm", axis: "quality", scale: 10, rationale: "[MOCK] Da nhìn chung đủ ẩm, bề mặt mịn ở vùng má." },
  { key: "evenness", label: "Đều màu da", axis: "quality", scale: 10, rationale: "[MOCK] Tông da khá đồng đều, chênh lệch nhẹ giữa trán và má." },
];

export class MockSkinAnalysisProvider implements SkinAnalysisProvider {
  readonly name = "mock";

  async analyze(input: SkinAnalysisInput): Promise<RawSkinAnalysisResult> {
    const seed = fnv1a(input.submissionId);
    const signals: RawSkinSignal[] = AXES.map((a, i) => ({
      key: a.key,
      label: a.label,
      axis: a.axis,
      value: seededValue(seed, i, a.scale),
      scale: a.scale,
      rationale: a.rationale,
    }));
    return {
      provider: this.name,
      providerModel: "deterministic-v1",
      signals,
      summary:
        "[MOCK] Đây là dữ liệu mẫu, không phải phân tích ảnh thật. Da nhìn chung ở mức ổn, tập trung kiểm soát dầu vùng chữ T và dưỡng ẩm đều.",
      primaryConcerns: [
        {
          key: "oiliness",
          label: "Da dầu vùng chữ T",
          why: "[MOCK] Trán và mũi bóng dầu rõ nhất, là nguyên nhân chính gây bí lỗ chân lông.",
        },
        {
          key: "pores",
          label: "Lỗ chân lông to",
          why: "[MOCK] Lỗ chân lông hai bên cánh mũi to vừa, đi kèm tình trạng dầu.",
        },
      ],
      routine: {
        morning: [
          { step: "[MOCK] Sữa rửa mặt dịu nhẹ", ingredients: ["Glycerin"], note: "Rửa nhẹ, nước ấm." },
          { step: "[MOCK] Serum kiểm soát dầu", ingredients: ["Niacinamide"], note: "Giúp giảm bóng dầu, se lỗ chân lông." },
          { step: "[MOCK] Kem chống nắng", ingredients: ["SPF 30+"], note: "Bắt buộc mỗi sáng." },
        ],
        evening: [
          { step: "[MOCK] Tẩy trang + rửa mặt", note: "Làm sạch sâu cuối ngày." },
          { step: "[MOCK] Tẩy tế bào chết hóa học", ingredients: ["BHA"], note: "2-3 lần/tuần, tăng dần." },
          { step: "[MOCK] Kem dưỡng ẩm nhẹ", ingredients: ["Hyaluronic Acid"], note: "Kết cấu mỏng, không bí." },
        ],
        weekly: [
          { step: "[MOCK] Mặt nạ đất sét", ingredients: ["Kaolin"], note: "1 lần/tuần cho vùng chữ T." },
        ],
      },
      expectations:
        "[MOCK] Thường sau 4-6 tuần dùng đều sẽ thấy da bớt bóng dầu và lỗ chân lông thông thoáng hơn.",
      seeDoctorIf: [
        "[MOCK] Mụn viêm sưng đau, lan rộng hoặc để lại sẹo.",
        "[MOCK] Da kích ứng kéo dài sau khi dùng sản phẩm mới.",
      ],
      recommendations: [
        "[MOCK] Làm sạch dịu nhẹ 2 lần/ngày, tránh chà xát mạnh.",
        "[MOCK] Dùng kem dưỡng ẩm phù hợp, ưu tiên kết cấu nhẹ cho vùng chữ T.",
        "[MOCK] Thoa kem chống nắng mỗi sáng để hạn chế sạm nám.",
      ],
      details: { note: "Mock provider — no external API call." },
    };
  }
}
