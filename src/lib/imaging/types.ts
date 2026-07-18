// Shared shapes for the skin-imaging pipeline. Kept dependency-free so the same
// code runs in the browser (from a <canvas> ImageData) and on the server (from a
// decoded pixel buffer) without pulling in DOM or Node types.

// A raw RGBA pixel buffer, identical in shape to the browser's ImageData.
export interface FrameLike {
  width: number;
  height: number;
  // RGBA, row-major, length = width * height * 4.
  data: Uint8ClampedArray;
}

// Which screen colour illuminated a captured frame.
//   ambient — screen black, only room light (used to subtract the room's colour cast)
//   white   — full white screen (broadband illumination)
//   red/green/blue — single-primary screen flash (pseudo narrow-band)
export type IlluminationKey = "ambient" | "white" | "red" | "green" | "blue";

// One capture run. `white` is the minimum required; the coloured frames make the
// melanin/hemoglobin separation sharper but the pipeline degrades gracefully
// without them (single-frame fallback for the legacy upload path).
export type CaptureSet = Partial<Record<IlluminationKey, FrameLike>>;

// The six VISIA-style visualisation layers we can synthesise from visible light.
// (UV Spots and Porphyrins are intentionally absent — they need UV hardware.)
export type LayerKey =
  | "spots"
  | "brownSpots"
  | "redAreas"
  | "pores"
  | "texture"
  | "wrinkles";

export interface LayerResult {
  key: LayerKey;
  labelVi: string;
  // Colourised RGBA overlay, same dimensions as the input, transparent where
  // there is no signal. Composited on top of the base photo by the caller.
  overlay: FrameLike;
  // Fraction of analysed skin pixels flagged by this layer, 0..1. A rough
  // "how much of the face is affected" number, shown as a percentage.
  coverage: number;
  // Convenience 0..100 "condition" score (100 = best/clearest) derived from
  // coverage, so callers have something to show before the AI layer runs.
  score: number;
  beta?: boolean;
}

export interface DecomposeResult {
  width: number;
  height: number;
  layers: Record<LayerKey, LayerResult>;
  // Per-pixel skin mask (1 = skin, 0 = not), useful for debugging/QA overlays.
  skinMask: Uint8Array;
  skinCoverage: number; // fraction of frame classified as skin
}
