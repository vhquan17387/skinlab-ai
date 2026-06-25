import Anthropic from "@anthropic-ai/sdk";
import type {
  SkinAnalysisProvider,
  SkinAnalysisInput,
  RawSkinAnalysisResult,
  RawSkinSignal,
} from "./types";

// Default model is configurable; spec defaults to claude-opus-4-7, override via CLAUDE_MODEL
// (claude-sonnet-4-6 ~2x cheaper, claude-haiku-4-5 ~5x cheaper).
const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `Bạn là một trợ lý phân tích hình ảnh da mặt cho mục đích tham khảo về chăm sóc da (KHÔNG phải chẩn đoán y khoa).
Bạn nhận 3 ảnh khuôn mặt: chính diện, nghiêng trái, nghiêng phải.
Hãy đánh giá các trục da sau, trả về điểm số nguyên theo thang đo, VÀ với mỗi trục bắt buộc nêu "rationale".

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

Ngoài ra trả về:
- "summary": nhận xét tổng quan 2-4 câu về tình trạng da nhìn thấy trên ảnh.
- "recommendations": 3-5 gợi ý chăm sóc da cụ thể (mỗi gợi ý 1 câu), bám theo các quan sát ở trên.

KHÔNG dùng ngôn từ chẩn đoán bệnh. Chỉ mô tả quan sát bề mặt da mang tính tham khảo.`;

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
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["signals", "summary", "recommendations"],
} as const;

function mediaType(contentType: string): "image/jpeg" | "image/png" | "image/webp" {
  if (contentType === "image/png") return "image/png";
  if (contentType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
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
            { type: "text", text: "Ảnh chính diện:" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType(front.contentType),
                data: toBase64(front.bytes),
              },
            },
            { type: "text", text: "Ảnh nghiêng trái:" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType(left.contentType),
                data: toBase64(left.bytes),
              },
            },
            { type: "text", text: "Ảnh nghiêng phải:" },
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
              text: "Phân tích 3 ảnh trên và trả về các signals theo schema yêu cầu.",
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
