// Skin-imaging decomposition — the core of SkinAI v2.
//
// Given a set of frames captured under controlled screen illumination, it
// synthesises VISIA-style visualisation layers from *visible* light only:
//
//   • Melanin / erythema separation via per-channel optical density.
//     Red light barely interacts with haemoglobin, so red-band reflectance
//     tracks melanin; haemoglobin absorbs green strongly, so (od_green − od_red)
//     tracks redness. These are the classic Dawson/Diffey melanin & erythema
//     indices, computed per pixel.
//   • Localised layers (spots, pores, texture, wrinkles) via multi-scale local
//     contrast — deviation of a map from its neighbourhood, which also cancels
//     the uneven lighting a phone can't fully control.
//
// Everything works on plain RGBA buffers, so the same function runs against a
// browser <canvas> ImageData and (later) a server-side decoded buffer.

import type {
  CaptureSet,
  DecomposeResult,
  FrameLike,
  IlluminationKey,
  LayerKey,
  LayerResult,
} from "./types";

const EPS = 1 / 255; // avoids log(0) on a fully-absorbed channel

// Colour + Vietnamese label per layer, matching the VISIA report vocabulary.
const LAYER_META: Record<
  LayerKey,
  { labelVi: string; rgb: [number, number, number]; beta?: boolean }
> = {
  spots: { labelVi: "Đốm sắc tố (Spots)", rgb: [255, 205, 0] },
  brownSpots: { labelVi: "Sắc tố nâu (Brown Spots)", rgb: [150, 90, 35] },
  redAreas: { labelVi: "Vùng đỏ (Red Areas)", rgb: [230, 40, 40] },
  pores: { labelVi: "Lỗ chân lông (Pores)", rgb: [0, 180, 220] },
  texture: { labelVi: "Kết cấu da (Texture)", rgb: [90, 205, 130] },
  wrinkles: { labelVi: "Nếp nhăn (Wrinkles)", rgb: [120, 130, 255], beta: true },
};

// ---------------------------------------------------------------------------
// Summed-area table (integral image) for O(1) box means at any radius.
// ---------------------------------------------------------------------------
class Integral {
  private readonly w: number;
  private readonly h: number;
  private readonly sat: Float64Array; // (w+1) * (h+1)

  constructor(src: Float32Array, w: number, h: number) {
    this.w = w;
    this.h = h;
    const sw = w + 1;
    this.sat = new Float64Array(sw * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      const satRow = (y + 1) * sw;
      const satPrev = y * sw;
      const srcRow = y * w;
      for (let x = 0; x < w; x++) {
        rowSum += src[srcRow + x];
        this.sat[satRow + x + 1] = this.sat[satPrev + x + 1] + rowSum;
      }
    }
  }

  // Mean over the box centred at (x,y) with the given radius (clamped to edges).
  mean(x: number, y: number, r: number): number {
    const sw = this.w + 1;
    const x0 = x - r < 0 ? 0 : x - r;
    const y0 = y - r < 0 ? 0 : y - r;
    const x1 = x + r >= this.w ? this.w - 1 : x + r;
    const y1 = y + r >= this.h ? this.h - 1 : y + r;
    const a = this.sat[y0 * sw + x0];
    const b = this.sat[y0 * sw + (x1 + 1)];
    const c = this.sat[(y1 + 1) * sw + x0];
    const d = this.sat[(y1 + 1) * sw + (x1 + 1)];
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    return (d - b - c + a) / count;
  }
}

// ---------------------------------------------------------------------------
// Reflectance extraction with ambient subtraction.
// ---------------------------------------------------------------------------
function channelAt(frame: FrameLike, i4: number, ch: 0 | 1 | 2): number {
  return frame.data[i4 + ch];
}

// Build a per-pixel reflectance map (0..1) for one spectral band. Prefers the
// matching single-primary frame (red/green/blue) when present, else falls back
// to the white frame's channel. The ambient frame (room light) is subtracted so
// the map reflects only the light we actively projected.
function reflectanceBand(
  set: CaptureSet,
  band: "red" | "green" | "blue",
  ch: 0 | 1 | 2,
  n: number,
): Float32Array {
  const lit = set[band] ?? set.white;
  if (!lit) throw new Error("decompose: need at least a white frame");
  const ambient = set.ambient;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i4 = i * 4;
    let v = channelAt(lit, i4, ch);
    if (ambient) v -= channelAt(ambient, i4, ch);
    if (v < 1) v = 1;
    let r = v / 255;
    if (r < EPS) r = EPS;
    else if (r > 1) r = 1;
    out[i] = r;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Skin mask — lenient RGB heuristic just to keep overlays off hair/background.
// ---------------------------------------------------------------------------
function skinMask(base: FrameLike, n: number): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const i4 = i * 4;
    const r = base.data[i4];
    const g = base.data[i4 + 1];
    const b = base.data[i4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isSkin =
      r > 45 &&
      g > 25 &&
      b > 15 &&
      r >= g &&
      g >= b * 0.8 &&
      r - b > 8 &&
      max - min > 8 &&
      max < 252; // drop blown-out specular highlights
    if (isSkin) {
      mask[i] = 1;
      count++;
    }
  }
  return { mask, count };
}

// Positive local contrast of a map: max(0, map − boxMean(map, radius)).
function localExcess(map: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Integral(map, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = map[i] - sat.mean(x, y, r);
      out[i] = d > 0 ? d : 0;
    }
  }
  return out;
}

// Difference of two box scales (band-pass): boxMean(small) − boxMean(large),
// positive part. Isolates blob-sized structures (spots).
function dogPositive(
  map: Float32Array,
  w: number,
  h: number,
  rSmall: number,
  rLarge: number,
): Float32Array {
  const sat = new Integral(map, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = sat.mean(x, y, rSmall) - sat.mean(x, y, rLarge);
      const i = y * w + x;
      out[i] = d > 0 ? d : 0;
    }
  }
  return out;
}

// Local standard deviation of a map (texture energy).
function localStd(map: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Integral(map, w, h);
  const sq = new Float32Array(w * h);
  for (let i = 0; i < map.length; i++) sq[i] = map[i] * map[i];
  const satSq = new Integral(sq, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = sat.mean(x, y, r);
      const v = satSq.mean(x, y, r) - m * m;
      const i = y * w + x;
      out[i] = v > 0 ? Math.sqrt(v) : 0;
    }
  }
  return out;
}

// Robust scale = high percentile over skin pixels (via a 256-bin histogram),
// so a few hot pixels don't wash out the colourisation.
function robustScale(map: Float32Array, mask: Uint8Array, pct: number): number {
  let max = 0;
  for (let i = 0; i < map.length; i++) if (mask[i] && map[i] > max) max = map[i];
  if (max <= 0) return 1;
  const bins = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < map.length; i++) {
    if (!mask[i]) continue;
    const bi = Math.min(255, (map[i] / max) * 255) | 0;
    bins[bi]++;
    total++;
  }
  const target = total * pct;
  let acc = 0;
  for (let b = 0; b < 256; b++) {
    acc += bins[b];
    if (acc >= target) return ((b + 1) / 256) * max;
  }
  return max;
}

// Colourise a magnitude map into an RGBA overlay, and report coverage.
function colourise(
  map: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
  rgb: [number, number, number],
  skinCount: number,
  opts: { threshold: number; maxAlpha: number; percentile: number },
): { overlay: FrameLike; coverage: number } {
  const scale = robustScale(map, mask, opts.percentile);
  const data = new Uint8ClampedArray(w * h * 4);
  let flagged = 0;
  for (let i = 0; i < map.length; i++) {
    if (!mask[i]) continue;
    const norm = map[i] / scale;
    if (norm < opts.threshold) continue;
    flagged++;
    const a = Math.min(1, norm) * opts.maxAlpha;
    const i4 = i * 4;
    data[i4] = rgb[0];
    data[i4 + 1] = rgb[1];
    data[i4 + 2] = rgb[2];
    data[i4 + 3] = Math.round(a * 255);
  }
  return {
    overlay: { width: w, height: h, data },
    coverage: skinCount > 0 ? flagged / skinCount : 0,
  };
}

function toScore(coverage: number, k: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - coverage * k)));
}

export interface DecomposeOptions {
  // Fraction of the smaller image dimension used as the "neighbourhood" radius
  // for local-contrast layers. Larger = coarser blobs.
  baseRadiusFrac?: number;
}

export function decompose(set: CaptureSet, opts: DecomposeOptions = {}): DecomposeResult {
  const base = set.white ?? set.red ?? set.green ?? set.blue;
  if (!base) throw new Error("decompose: capture set is empty");
  const { width: w, height: h } = base;
  const n = w * h;
  const minDim = Math.min(w, h);
  const R = Math.max(6, Math.round((opts.baseRadiusFrac ?? 0.05) * minDim));

  // Spectral reflectance per band (ambient-subtracted).
  const Rr = reflectanceBand(set, "red", 0, n);
  const Rg = reflectanceBand(set, "green", 1, n);
  const Rb = reflectanceBand(set, "blue", 2, n);

  // Optical density & pigment indices.
  const melanin = new Float32Array(n); // od_red  → melanin-dominated
  const erythema = new Float32Array(n); // od_green − od_red → redness
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const odR = -Math.log(Rr[i]);
    const odG = -Math.log(Rg[i]);
    melanin[i] = odR;
    erythema[i] = odG - odR;
    lum[i] = (Rr[i] + Rg[i] + Rb[i]) / 3;
  }

  const { mask, count: skinCount } = skinMask(base, n);

  // Layer maps.
  const brownMap = localExcess(melanin, w, h, R);
  const spotMap = dogPositive(melanin, w, h, Math.max(2, (R / 3) | 0), R);
  const redMap = localExcess(erythema, w, h, R);
  // "Darker than neighbourhood" signal: negate luminance so dips become peaks.
  const darkness = new Float32Array(n);
  for (let i = 0; i < n; i++) darkness[i] = -lum[i];
  // Pores: tiny dark dips at a small radius.
  const poreMap = localExcess(darkness, w, h, Math.max(2, (R / 6) | 0));
  const textureMap = localStd(lum, w, h, Math.max(2, (R / 3) | 0));
  // Wrinkles (beta): medium-scale dark bands.
  const wrinkleMap = localExcess(darkness, w, h, Math.max(3, (R / 2) | 0));

  const build = (
    key: LayerKey,
    map: Float32Array,
    o: { threshold: number; maxAlpha: number; percentile: number; scoreK: number },
  ): LayerResult => {
    const meta = LAYER_META[key];
    const { overlay, coverage } = colourise(map, mask, w, h, meta.rgb, skinCount, o);
    return {
      key,
      labelVi: meta.labelVi,
      overlay,
      coverage,
      score: toScore(coverage, o.scoreK),
      beta: meta.beta,
    };
  };

  const layers: Record<LayerKey, LayerResult> = {
    spots: build("spots", spotMap, { threshold: 0.35, maxAlpha: 0.85, percentile: 0.985, scoreK: 300 }),
    brownSpots: build("brownSpots", brownMap, { threshold: 0.25, maxAlpha: 0.7, percentile: 0.98, scoreK: 180 }),
    redAreas: build("redAreas", redMap, { threshold: 0.28, maxAlpha: 0.6, percentile: 0.98, scoreK: 180 }),
    pores: build("pores", poreMap, { threshold: 0.45, maxAlpha: 0.8, percentile: 0.99, scoreK: 400 }),
    texture: build("texture", textureMap, { threshold: 0.35, maxAlpha: 0.55, percentile: 0.98, scoreK: 150 }),
    wrinkles: build("wrinkles", wrinkleMap, { threshold: 0.5, maxAlpha: 0.7, percentile: 0.99, scoreK: 350 }),
  };

  return {
    width: w,
    height: h,
    layers,
    skinMask: mask,
    skinCoverage: n > 0 ? skinCount / n : 0,
  };
}

export const ALL_LAYER_KEYS: LayerKey[] = [
  "spots",
  "brownSpots",
  "redAreas",
  "pores",
  "texture",
  "wrinkles",
];

export type { CaptureSet, DecomposeResult, LayerKey, LayerResult, IlluminationKey };
