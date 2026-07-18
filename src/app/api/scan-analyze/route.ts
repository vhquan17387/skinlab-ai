import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { PrimaryConcern, SkinPlan } from "@/lib/ai/types";

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
Bạn nhận MỘT ảnh khuôn mặt chính diện được chụp trực tiếp dưới ánh sáng màn hình có kiểm soát (kiểu quét VISIA), KÈM các chỉ số đo được từ xử lý ảnh: tỉ lệ % vùng da mặt bị ảnh hưởng theo từng lớp (Spots, Brown Spots/melanin, Red Areas/mạch máu, Pores, Texture, Wrinkles). % càng cao = vấn đề đó càng nhiều.

Hãy KẾT HỢP quan sát trực quan trên ảnh với các chỉ số đo được để đưa ra phân tích. Nếu chỉ số đo và quan sát mắt thường mâu thuẫn, hãy nói rõ.

Trả về theo schema:
- "summary": 2-4 câu nhận xét tổng quan, bám vào lớp có % cao nhất và điều thấy trên ảnh.
- "primaryConcerns": 1-3 vấn đề đáng ưu tiên nhất (mỗi mục: key, label tiếng Việt, why — nêu quan sát trên ảnh + chỉ số đo liên quan). Sắp xếp quan trọng nhất trước.
- "routine": lộ trình chăm sóc cụ thể gồm "morning", "evening" (và "weekly" tùy chọn). Mỗi bước: "step" (tên bước), "ingredients" (HOẠT CHẤT như BHA, Niacinamide, Retinol, SPF 30+ — KHÔNG nêu tên thương hiệu), "note" (tần suất/lưu ý). Bám theo primaryConcerns.
- "expectations": 1-2 câu về thời gian thấy cải thiện và dấu hiệu theo dõi.
- "recommendations": 3-5 gợi ý thói quen/lối sống ngắn gọn.

Viết tiếng Việt. KHÔNG chẩn đoán bệnh, KHÔNG kê thuốc. Chỉ mô tả bề mặt da và gợi ý chăm sóc tham khảo.`;

const ROUTINE_STEPS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      step: { type: "string" },
      ingredients: { type: "array", items: { type: "string" } },
      note: { type: "string" },
    },
    required: ["step"],
  },
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    primaryConcerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          why: { type: "string" },
        },
        required: ["key", "label", "why"],
      },
    },
    routine: {
      type: "object",
      additionalProperties: false,
      properties: {
        morning: ROUTINE_STEPS_SCHEMA,
        evening: ROUTINE_STEPS_SCHEMA,
        weekly: ROUTINE_STEPS_SCHEMA,
      },
      required: ["morning", "evening"],
    },
    expectations: { type: "string" },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "primaryConcerns", "routine", "expectations", "recommendations"],
} as const;

interface ScanAnalyzeBody {
  imageBase64?: string; // JPEG/PNG base64 (no data: prefix)
  contentType?: string;
  coverages?: Record<string, number>; // 0..1 per layer
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

  const mediaType =
    body.contentType === "image/png" ? "image/png" : "image/jpeg";

  const client = new Anthropic({ apiKey });

  // output_config.format (structured outputs) may not be in this SDK version's
  // typed params; it's serialized into the request body regardless, so build the
  // literal untyped and cast at the call site (same approach as the main provider).
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
            text: "Phân tích ảnh KẾT HỢP các chỉ số đo trên rồi trả về theo schema yêu cầu.",
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

    let parsed: {
      summary?: string;
      primaryConcerns?: PrimaryConcern[];
      routine?: SkinPlan;
      expectations?: string;
      recommendations?: string[];
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Model trả về dữ liệu không hợp lệ." }, { status: 502 });
    }

    return NextResponse.json({
      model: MODEL,
      summary: parsed.summary,
      primaryConcerns: parsed.primaryConcerns ?? [],
      routine: parsed.routine ?? null,
      expectations: parsed.expectations,
      recommendations: parsed.recommendations ?? [],
    });
  } catch (err) {
    console.error("[scan-analyze] failed:", err);
    return NextResponse.json(
      { error: "Gọi phân tích AI thất bại. Vui lòng thử lại." },
      { status: 500 },
    );
  }
}
