import type {
  RawSkinAnalysisResult,
  NormalizedSkinAnalysisResult,
  NormalizedSkinScore,
  BandLabel,
} from "./types";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function bandOf(overall: number): BandLabel {
  if (overall >= 75) return "high";
  if (overall >= 50) return "medium";
  return "low";
}

/**
 * Normalize raw signals into 0..100 where 100 is always better.
 * - severity: score = (1 - value/scale) * 100
 * - quality:  score = (value/scale) * 100
 */
export function normalize(
  raw: RawSkinAnalysisResult,
): NormalizedSkinAnalysisResult {
  const scores: NormalizedSkinScore[] = raw.signals.map((s) => {
    const ratio = s.scale > 0 ? s.value / s.scale : 0;
    const fraction =
      s.axis === "severity" ? clamp01(1 - ratio) : clamp01(ratio);
    return {
      key: s.key,
      label: s.label,
      score: Math.round(fraction * 100),
      rationale: s.rationale,
    };
  });

  const overall =
    scores.length > 0
      ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
      : 0;

  return {
    scores,
    overall,
    bandLabel: bandOf(overall),
    summary: raw.summary,
    recommendations: raw.recommendations,
    primaryConcerns: raw.primaryConcerns,
    routine: raw.routine,
    expectations: raw.expectations,
    seeDoctorIf: raw.seeDoctorIf,
  };
}
