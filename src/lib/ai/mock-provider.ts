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
}[] = [
  { key: "acne", label: "Mụn", axis: "severity", scale: 10 },
  { key: "wrinkles", label: "Nếp nhăn", axis: "severity", scale: 10 },
  { key: "pigmentation", label: "Sạm/nám", axis: "severity", scale: 10 },
  { key: "redness", label: "Mẩn đỏ", axis: "severity", scale: 10 },
  { key: "dryness", label: "Khô da", axis: "severity", scale: 10 },
  { key: "oiliness", label: "Da dầu", axis: "severity", scale: 10 },
  { key: "pores", label: "Lỗ chân lông to", axis: "severity", scale: 10 },
  { key: "darkcircles", label: "Quầng thâm mắt", axis: "severity", scale: 10 },
  { key: "hydration", label: "Độ ẩm", axis: "quality", scale: 10 },
  { key: "evenness", label: "Đều màu da", axis: "quality", scale: 10 },
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
    }));
    return {
      provider: this.name,
      providerModel: "deterministic-v1",
      signals,
      details: { note: "Mock provider — no external API call." },
    };
  }
}
