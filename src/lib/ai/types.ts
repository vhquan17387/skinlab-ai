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
  // Per-axis observation from the image explaining the score (provider-generated).
  rationale?: string;
}

export interface SkinAnalysisImage {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}

// What the user told us about themselves and their concern. Fed to the
// provider so the analysis answers the user's actual question instead of
// producing a generic skin scan.
export interface SkinAnalysisContext {
  // skin_concern keys the user selected (e.g. ["acne", "pigmentation"]).
  concerns?: string[];
  // free-text the user wrote describing their problem.
  notes?: string;
  age?: number | null;
  gender?: string | null;
}

export interface SkinAnalysisInput {
  submissionId: string;
  images: {
    front: SkinAnalysisImage;
    left: SkinAnalysisImage;
    right: SkinAnalysisImage;
  };
  context?: SkinAnalysisContext;
}

// A prioritized problem: the few things that actually matter for this user,
// tying what the image shows to what the user worried about.
export interface PrimaryConcern {
  // matches a signal key when applicable (acne, pigmentation, ...), else free.
  key: string;
  label: string;
  // why this is a priority: observation on the image + link to user's concern.
  why: string;
}

// One concrete step in a routine. Ingredients are active ingredients
// (BHA, niacinamide, retinol, SPF...), never brand names.
export interface RoutineStep {
  step: string;
  ingredients?: string[];
  note?: string;
}

// The actionable plan derived from the analysis.
export interface SkinPlan {
  morning: RoutineStep[];
  evening: RoutineStep[];
  weekly?: RoutineStep[];
}

export interface RawSkinAnalysisResult {
  provider: string;
  providerModel?: string;
  signals: RawSkinSignal[];
  summary?: string;
  // Legacy flat tips; kept for backward compatibility.
  recommendations?: string[];
  // Prioritized problems for this specific user.
  primaryConcerns?: PrimaryConcern[];
  // Concrete morning/evening/weekly routine.
  routine?: SkinPlan;
  // What improvement to expect and roughly when.
  expectations?: string;
  // Signs that warrant seeing a dermatologist.
  seeDoctorIf?: string[];
  details?: Record<string, unknown>;
}

export interface NormalizedSkinScore {
  key: string;
  label: string;
  score: number; // 0..100, 100 = better
  rationale?: string;
}

export type BandLabel = "low" | "medium" | "high";

export interface NormalizedSkinAnalysisResult {
  scores: NormalizedSkinScore[];
  overall: number;
  bandLabel: BandLabel;
  summary?: string;
  recommendations?: string[];
  primaryConcerns?: PrimaryConcern[];
  routine?: SkinPlan;
  expectations?: string;
  seeDoctorIf?: string[];
}

export interface SkinAnalysisProvider {
  readonly name: string;
  analyze(input: SkinAnalysisInput): Promise<RawSkinAnalysisResult>;
}
