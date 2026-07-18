// Face-geometry helpers for the scan pipeline (browser-only — uses <canvas> and
// the MediaPipe FaceLandmarker already bundled for image validation).
//
// Two jobs:
//   1. Build an accurate face-skin mask (face oval minus eyes/brows/lips) so the
//      analysis overlays land on skin only — not hair, background, eyes or lips.
//   2. Estimate a per-frame affine transform from 468 landmark correspondences so
//      the coloured flash frames can be warped into alignment with the white
//      frame before melanin/haemoglobin separation (kills motion halos).

import { getLandmarker } from "../image-validators/face";
import { FaceLandmarker } from "@mediapipe/tasks-vision";

export interface Pt {
  x: number;
  y: number;
}

// Detect the 468 landmarks for a frame, in pixel coordinates. null if no face.
export async function detectLandmarks(
  source: HTMLCanvasElement,
  w: number,
  h: number,
): Promise<Pt[] | null> {
  const landmarker = await getLandmarker();
  let result;
  try {
    result = landmarker.detect(source);
  } catch {
    return null;
  }
  const faces = result.faceLandmarks;
  if (!faces || faces.length === 0) return null;
  return faces[0].map((p) => ({ x: p.x * w, y: p.y * h }));
}

// Collect the unique landmark indices referenced by a MediaPipe connection list.
function indicesOf(connections: { start: number; end: number }[]): number[] {
  const set = new Set<number>();
  for (const c of connections) {
    set.add(c.start);
    set.add(c.end);
  }
  return [...set];
}

// Order a blob of points into a simple polygon by angle around their centroid.
// The face oval, eyes and lips are all convex enough for this to be exact.
function angularPolygon(pts: Pt[]): Pt[] {
  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}

function fillPolygon(ctx: CanvasRenderingContext2D, poly: Pt[]) {
  if (poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.fill();
}

// Build a binary skin mask from landmarks: face oval filled, then eyes / brows /
// lips punched out. Returns 1 = analyse, 0 = ignore.
export function buildFaceMask(landmarks: Pt[], w: number, h: number): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const poly = (conns: { start: number; end: number }[]) =>
    angularPolygon(indicesOf(conns).map((i) => landmarks[i]).filter(Boolean));

  // Face oval → white.
  ctx.fillStyle = "#fff";
  fillPolygon(ctx, poly(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL));

  // Punch out non-skin features.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#fff";
  for (const conns of [
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
  ]) {
    fillPolygon(ctx, poly(conns));
  }
  ctx.globalCompositeOperation = "source-over";

  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return mask;
}

// Solve a 3x3 linear system by Gaussian elimination. Returns null if singular.
function solve3(
  M: number[][],
  v: number[],
): [number, number, number] | null {
  const a = M.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++)
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-9) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

// Least-squares affine mapping src → dst (pixel coords).
// x' = a*x + b*y + c,  y' = d*x + e*y + f.
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function estimateAffine(src: Pt[], dst: Pt[]): Affine | null {
  const n = Math.min(src.length, dst.length);
  if (n < 3) return null;
  let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0;
  let SxX = 0, SyX = 0, SX = 0, SxY = 0, SyY = 0, SY = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = src[i];
    const X = dst[i].x, Y = dst[i].y;
    Sxx += x * x; Sxy += x * y; Sx += x; Syy += y * y; Sy += y;
    SxX += x * X; SyX += y * X; SX += X;
    SxY += x * Y; SyY += y * Y; SY += Y;
  }
  const M = [
    [Sxx, Sxy, Sx],
    [Sxy, Syy, Sy],
    [Sx, Sy, n],
  ];
  const rx = solve3(M, [SxX, SyX, SX]);
  const ry = solve3(M, [SxY, SyY, SY]);
  if (!rx || !ry) return null;
  return { a: rx[0], b: rx[1], c: rx[2], d: ry[0], e: ry[1], f: ry[2] };
}

// Warp a source frame into the reference frame using the affine, returning
// ImageData at (w,h). Identity if `af` is null.
export function warpToReference(
  source: HTMLCanvasElement,
  af: Affine | null,
  w: number,
  h: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (af) {
    // Canvas setTransform(m11,m12,m21,m22,dx,dy):
    //   x' = m11*x + m21*y + dx ;  y' = m12*x + m22*y + dy
    ctx.setTransform(af.a, af.d, af.b, af.e, af.c, af.f);
  }
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}
