import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

// Per the claude-api skill: default to claude-opus-4-8 for vision quality, but
// honour a project-level CLAUDE_MODEL override (this project pins haiku for cost).
const MODEL = process.env.SCAN_CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-opus-4-8";

const LAYER_LABEL_VI: Record<string, string> = {
  spots: "Đốm sắc tố (Spots)",
  brownSpots: "Sắc tố nâu / melanin (Brown Spots)",
  redAreas: "Vùng đỏ / mạch máu (Red Areas)",
  pores: "Lỗ chân lông (Pores)",
  texture: "Kết cấu / độ nhám da (Texture)",
  wrinkles: "Nếp nhăn (Wrinkles, beta)",
};

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích da cho mục đích tham khảo chăm sóc da (KHÔNG phải chẩn đoán y khoa).
Bạn nhận MỘT ảnh khuôn mặt chính diện chụp trực tiếp dưới ánh sáng màn hình có kiểm soát (kiểu quét VISIA), KÈM các chỉ số đo được từ xử lý ảnh: tỉ lệ % vùng da mặt bị ảnh hưởng theo từng lớp (Spots, Brown Spots, Red Areas, Pores, Texture, Wrinkles). % càng cao = vấn đề đó càng nhiều → điểm càng thấp.

Hãy CHẤM ĐIỂM theo thang 10 cho các tiêu chí kiểu bản đánh giá VISIA, kết hợp quan sát trực quan trên ảnh với các chỉ số đo được. Nếu chỉ số và mắt thường mâu thuẫn, ưu tiên nêu rõ trong nhận xét.

Trả về "metrics" gồm ĐÚNG 10 mục theo thứ tự và "key" sau:
1. spots — Đốm nhìn thấy (Spots)
2. wrinkles — Nếp nhăn (Wrinkles)
3. texture — Bề mặt da (Texture)
4. pores — Lỗ chân lông (Pores)
5. uvSpots — Sắc tố ẩn (UV Spots)
6. brownSpots — Sắc tố nâu (Brown Spots)
7. redAreas — Vùng đỏ (Red Areas)
8. porphyrins — Dầu/bít tắc nang lông (Porphyrins)
9. hydration — Độ ẩm và độ căng
10. evenness — Độ đồng đều màu da

QUY TẮC:
- Với uvSpots và porphyrins: đặt "measurable" = false, "score" = 0, và "assessment" giải thích ảnh thường KHÔNG đo được (cần máy VISIA / ảnh UV). Với porphyrins có thể ước đoán bít tắc/mụn nhìn thấy nhưng nói rõ là ước đoán.
- Các mục còn lại: "measurable" = true, "score" là số thực 0–10 (1 chữ số thập phân), "assessment" 1-2 câu mô tả quan sát cụ thể trên ảnh + liên hệ chỉ số đo (vị trí: trán/má/mũi/rãnh mũi-má/quanh mắt...).
- "overall": điểm tổng thể 0–10 (trung bình có trọng số các mục đo được). "overallLabel": xếp loại ngắn (vd "khá tốt đến rất tốt").
- "groups": phân loại tên tiêu chí thành "best" (mạnh nhất), "moderate" (mức khá), "needsAttention" (cần lưu ý nhất).
- "skinAge": ước lượng tuổi da: "low", "high", "center" (số tuổi) và "reasons" (2-5 lý do dựa trên nếp nhăn, độ đầy/đàn hồi, sắc tố, vùng dưới mắt...). Nêu rõ nếu tóc mái/ánh sáng/trang điểm làm giảm độ chính xác.
- "recommendations": 3-5 gợi ý chăm sóc ngắn gọn (thói quen/hoạt chất như BHA, Niacinamide, SPF — KHÔNG nêu thương hiệu).

Viết tiếng Việt. KHÔNG chẩn đoán bệnh, KHÔNG kê thuốc. Nhắc rằng đây KHÔNG phải điểm VISIA thật và không thay khám da liễu (ánh sáng, góc chụp, trang điểm, xử lý ảnh có thể làm da trông khác thực tế).`;

const METRIC_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      key: { type: "string" },
      label: { type: "string" },
      measurable: { type: "boolean" },
      score: { type: "number" },
      assessment: { type: "string" },
    },
    required: ["key", "label", "measurable", "score", "assessment"],
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    metrics: METRIC_SCHEMA,
    overall: { type: "number" },
    overallLabel: { type: "string" },
    groups: {
      type: "object",
      additionalProperties: false,
      properties: {
        best: { type: "array", items: { type: "string" } },
        moderate: { type: "array", items: { type: "string" } },
        needsAttention: { type: "array", items: { type: "string" } },
      },
      required: ["best", "moderate", "needsAttention"],
    },
    skinAge: {
      type: "object",
      additionalProperties: false,
      properties: {
        low: { type: "number" },
        high: { type: "number" },
        center: { type: "number" },
        reasons: { type: "array", items: { type: "string" } },
      },
      required: ["low", "high", "center", "reasons"],
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["metrics", "overall", "overallLabel", "groups", "skinAge", "recommendations"],
} as const;

interface ScanAnalyzeBody {
  imageBase64?: string;
  contentType?: string;
  coverages?: Record<string, number>;
}

function formatCoverages(cov: Record<string, number> | undefined): string {
  if (!cov) return "Không có chỉ số đo.";
  return Object.entries(cov)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${LAYER_LABEL_VI[k] ?? k}: ${Math.round(v * 100)}%`)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY chưa được cấu hình." }, { status: 500 });
  }

  let body: ScanAnalyzeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi không hợp lệ." }, { status: 400 });
  }
  if (!body.imageBase64) {
    return NextResponse.json({ error: "Thiếu ảnh để phân tích." }, { status: 400 });
  }

  const mediaType = body.contentType === "image/png" ? "image/png" : "image/jpeg";
  const client = new Anthropic({ apiKey });

  // output_config.format (structured outputs) may not be in this SDK version's
  // typed params; it's serialized into the request body regardless — build the
  // literal untyped and cast at the call site (same as the main provider).
  const params = {
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Ảnh khuôn mặt quét dưới ánh sáng màn hình. Chỉ số đo được (tỉ lệ vùng da mặt bị ảnh hưởng theo lớp, cao = nhiều hơn):\n${formatCoverages(body.coverages)}`,
          },
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: body.imageBase64 },
          },
          {
            type: "text",
            text: "Chấm điểm 10 tiêu chí, điểm tổng, phân nhóm, ước lượng tuổi da và gợi ý theo schema.",
          },
        ],
      },
    ],
  };

  try {
    const response = await client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming,
    );
    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Model trả về dữ liệu không hợp lệ." }, { status: 502 });
    }

    return NextResponse.json({ model: MODEL, ...parsed });
  } catch (err) {
    console.error("[scan-analyze] failed:", err);
    return NextResponse.json(
      { error: "Gọi phân tích AI thất bại. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
