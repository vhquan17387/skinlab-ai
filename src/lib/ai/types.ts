// Provider-agnostic shapes for skin analysis.

export type SkinAxis = "severity" | "quality";

export interface RawSkinSignal {
  key: string;
  label: string;
  // severity: 0 = none/best, higher = worse.
  // quality:  0 = worst,     higher = better.
  axis: SkinAxis;
  value: number;
  scale: number; // value is in [0, scale]
}

export interface SkinAnalysisImage {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface SkinAnalysisInput {
  submissionId: string;
  images: {
    front: SkinAnalysisImage;
    left: SkinAnalysisImage;
    right: SkinAnalysisImage;
  };
}

export interface RawSkinAnalysisResult {
  provider: string;
  providerModel?: string;
  signals: RawSkinSignal[];
  details?: Record<string, unknown>;
}

export interface NormalizedSkinScore {
  key: string;
  label: string;
  score: number; // 0..100, 100 = better
}

export type BandLabel = "low" | "medium" | "high";

export interface NormalizedSkinAnalysisResult {
  scores: NormalizedSkinScore[];
  overall: number;
  bandLabel: BandLabel;
}

export interface SkinAnalysisProvider {
  readonly name: string;
  analyze(input: SkinAnalysisInput): Promise<RawSkinAnalysisResult>;
}
