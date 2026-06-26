import Anthropic from "@anthropic-ai/sdk";
import { SKIN_CONCERN_OPTIONS } from "../constants";
import type {
  SkinAnalysisProvider,
  SkinAnalysisInput,
  SkinAnalysisContext,
  RawSkinAnalysisResult,
  RawSkinSignal,
  PrimaryConcern,
  SkinPlan,
} from "./types";

// Default model is configurable; spec defaults to claude-opus-4-7, override via CLAUDE_MODEL
// (claude-sonnet-4-6 ~2x cheaper, claude-haiku-4-5 ~5x cheaper).
const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `Bạn là một trợ lý phân tích hình ảnh da cho mục đích tham khảo về chăm sóc da (KHÔNG phải chẩn đoán y khoa).
Bạn nhận 3 ảnh: (1) ảnh khuôn mặt chính diện, (2) và (3) ảnh cận cảnh vùng da cần phân tích (có thể là vùng da bị tổn thương, không nhất thiết là toàn khuôn mặt).
Bạn CŨNG nhận thông tin người dùng tự khai: tuổi, giới tính, các mối lo về da họ chọn, và mô tả tự do. Nhiệm vụ của bạn là TRẢ LỜI ĐÚNG nỗi lo của họ chứ không đưa ra nhận xét chung chung — báo cáo phải khiến người dùng thấy "đúng vấn đề của tôi".

Hãy kết hợp cả 3 ảnh để đánh giá các trục da sau, trả về điểm số nguyên theo thang đo, VÀ với mỗi trục bắt buộc nêu "rationale".

Quy ước trục (axis):
- "severity": 0 = không có vấn đề, càng cao càng nghiêm trọng (thang 0-10).
- "quality": 0 = kém, càng cao càng tốt (thang 0-10).

Các trục cần đánh giá (key): acne (severity), wrinkles (severity), pigmentation (severity),
redness (severity), dryness (severity), oiliness (severity), pores (severity),
darkcircles (severity), hydration (quality), evenness (quality).

YÊU CẦU VỀ "rationale" (cho từng trục):
- Viết bằng tiếng Việt, 1-2 câu, mô tả ĐIỀU THỰC SỰ QUAN SÁT ĐƯỢC trên ảnh dẫn tới điểm đó:
  vị trí (vùng trán/má/cằm/mũi/quanh mắt), mức độ, biểu hiện cụ thể.
- KHÔNG lặp lại định nghĩa trục (vd đừng viết "mức độ mụn trên da"); phải là quan sát riêng của ảnh này.
- Nếu ảnh mờ/thiếu sáng/không thấy rõ vùng đó, hãy nói rõ trong rationale.

Ngoài ra trả về (PHẦN QUAN TRỌNG NHẤT — đây là thứ giúp báo cáo hữu ích thay vì vô thưởng vô phạt):

- "summary": 2-4 câu nhận xét tổng quan. PHẢI đối chiếu giữa điều người dùng lo và điều ảnh cho thấy. Nếu nỗi lo của họ khớp với ảnh, xác nhận và nói mức độ. Nếu KHÔNG khớp (vd họ lo mụn nhưng ảnh cho thấy vấn đề chính là sạm nám), hãy nói thẳng điều đó.

- "primaryConcerns": 1-3 vấn đề ĐÁNG ƯU TIÊN NHẤT cho riêng người dùng này (không liệt kê đủ 10 trục). Chọn dựa trên: mức severity cao trên ảnh GIAO với mối lo người dùng khai. Mỗi mục gồm key (trùng key trục nếu có), label (tiếng Việt), và "why" giải thích vì sao nó là ưu tiên (gắn quan sát trên ảnh + liên hệ nỗi lo người dùng). Sắp xếp quan trọng nhất trước.

- "routine": lộ trình chăm sóc CỤ THỂ chia "morning", "evening", và "weekly" (tùy chọn). Mỗi bước gồm:
  - "step": tên bước (vd "Sữa rửa mặt dịu nhẹ", "Serum cấp ẩm", "Kem chống nắng").
  - "ingredients": danh sách HOẠT CHẤT nên tìm (vd ["BHA", "Niacinamide"], ["Retinol"], ["SPF 30+"]). TUYỆT ĐỐI KHÔNG nêu tên thương hiệu hay sản phẩm cụ thể — chỉ hoạt chất/loại.
  - "note": tần suất / cách dùng / lưu ý (vd "2-3 lần/tuần, tăng dần", "tránh dùng chung với BHA cùng buổi").
  Routine phải bám theo primaryConcerns ở trên, không phải lời khuyên chung cho mọi người.

- "expectations": 1-2 câu về việc bao lâu mới thấy cải thiện và dấu hiệu tiến triển để người dùng theo dõi (vd "Mụn viêm thường giảm sau 4-6 tuần dùng đều; nếu sau 8 tuần không cải thiện nên cân nhắc gặp bác sĩ").

- "seeDoctorIf": 2-4 dấu hiệu nên đi khám bác sĩ da liễu (vd "mụn viêm nặng, đau, để lại sẹo", "đốm sắc tố thay đổi nhanh kích thước/màu"). Diễn đạt mang tính cảnh báo an toàn, KHÔNG chẩn đoán bệnh.

- "recommendations": 3-5 gợi ý ngắn gọn bổ sung (thói quen, lối sống) bám theo quan sát.

KHÔNG dùng ngôn từ chẩn đoán bệnh, không kê đơn thuốc. Chỉ mô tả quan sát bề mặt da và gợi ý chăm sóc mang tính tham khảo.`;

// Reused schema for a list of routine steps (inlined rather than $ref'd, since
// structured-output schema support for $ref/$defs is not guaranteed).
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

// JSON schema forcing the response shape via output_config.format.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          axis: { type: "string", enum: ["severity", "quality"] },
          value: { type: "integer" },
          scale: { type: "integer" },
          rationale: { type: "string" },
        },
        required: ["key", "label", "axis", "value", "scale", "rationale"],
      },
    },
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
    seeDoctorIf: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: [
    "signals",
    "summary",
    "primaryConcerns",
    "routine",
    "expectations",
    "seeDoctorIf",
    "recommendations",
  ],
} as const;

function mediaType(contentType: string): "image/jpeg" | "image/png" | "image/webp" {
  if (contentType === "image/png") return "image/png";
  if (contentType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

// Render the user's self-reported context as a text block for the prompt so
// the analysis is anchored to what the user actually worried about.
function formatContext(ctx: SkinAnalysisContext | undefined): string {
  if (!ctx) return "Người dùng không cung cấp thêm thông tin.";
  const lines: string[] = [];
  if (ctx.age != null) lines.push(`- Tuổi: ${ctx.age}`);
  if (ctx.gender) lines.push(`- Giới tính: ${ctx.gender}`);
  if (ctx.concerns && ctx.concerns.length > 0) {
    const labels = ctx.concerns
      .map((c) => SKIN_CONCERN_OPTIONS.find((o) => o.value === c)?.label || c)
      .join(", ");
    lines.push(`- Mối lo người dùng tự chọn: ${labels}`);
  }
  if (ctx.notes && ctx.notes.trim()) {
    lines.push(`- Mô tả người dùng tự ghi: "${ctx.notes.trim()}"`);
  }
  return lines.length > 0
    ? lines.join("\n")
    : "Người dùng không cung cấp thêm thông tin.";
}

export class ClaudeSkinAnalysisProvider implements SkinAnalysisProvider {
  readonly name = "claude";
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set (required for SKIN_AI_PROVIDER=claude)");
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  }

  async analyze(input: SkinAnalysisInput): Promise<RawSkinAnalysisResult> {
    const { front, left, right } = input.images;
    const contextText = formatContext(input.context);

    // `output_config.format` (structured outputs) and `cache_control` are recent
    // API features that may not be in the installed SDK's typed params. They are
    // still serialized into the request body at runtime, so we build the literal
    // untyped and cast at the call site.
    const params = {
      model: this.model,
      max_tokens: 4096,
      // Cache the (stable) system prompt.
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Force the JSON response shape.
      output_config: {
        format: {
          type: "json_schema",
          schema: OUTPUT_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Thông tin người dùng tự khai (dùng để cá nhân hóa phân tích và xếp ưu tiên):\n${contextText}`,
            },
            { type: "text", text: "Ảnh khuôn mặt chính diện:" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType(front.contentType),
                data: toBase64(front.bytes),
              },
            },
            { type: "text", text: "Ảnh cận cảnh vùng da 1:" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType(left.contentType),
                data: toBase64(left.bytes),
              },
            },
            { type: "text", text: "Ảnh cận cảnh vùng da 2:" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType(right.contentType),
                data: toBase64(right.bytes),
              },
            },
            {
              type: "text",
              text: "Phân tích 3 ảnh trên KẾT HỢP với thông tin người dùng tự khai, rồi trả về kết quả theo schema yêu cầu. Ưu tiên trả lời đúng mối lo người dùng đã nêu.",
            },
          ],
        },
      ],
    };

    const response = await this.client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming,
    );

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";

    let parsed: {
      signals?: RawSkinSignal[];
      summary?: string;
      recommendations?: string[];
      primaryConcerns?: PrimaryConcern[];
      routine?: SkinPlan;
      expectations?: string;
      seeDoctorIf?: string[];
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("Claude provider returned non-JSON output");
    }
    const signals = Array.isArray(parsed.signals) ? parsed.signals : [];
    const summary =
      typeof parsed.summary === "string" ? parsed.summary : undefined;
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r): r is string => typeof r === "string")
      : undefined;
    const primaryConcerns = Array.isArray(parsed.primaryConcerns)
      ? parsed.primaryConcerns
      : undefined;
    const routine =
      parsed.routine &&
      Array.isArray(parsed.routine.morning) &&
      Array.isArray(parsed.routine.evening)
        ? parsed.routine
        : undefined;
    const expectations =
      typeof parsed.expectations === "string" ? parsed.expectations : undefined;
    const seeDoctorIf = Array.isArray(parsed.seeDoctorIf)
      ? parsed.seeDoctorIf.filter((r): r is string => typeof r === "string")
      : undefined;

    // Cache-usage fields may be absent from this SDK version's Usage type but
    // are present on the wire response.
    const usage = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
    return {
      provider: this.name,
      providerModel: this.model,
      signals,
      summary,
      recommendations,
      primaryConcerns,
      routine,
      expectations,
      seeDoctorIf,
      details: {
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        },
      },
    };
  }
}
