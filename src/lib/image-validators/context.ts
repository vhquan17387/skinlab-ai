import type { ImageContext } from "./types";
import type { ImageKind } from "@/lib/constants";

const MAX_ANALYSIS_EDGE = 512;

/**
 * Build an ImageContext: decode the file to a bitmap, then downscale to a
 * small canvas (≤512px long edge) and extract ImageData for cheap pixel stats.
 */
export async function createImageContext(
  file: File,
  kind?: ImageKind,
): Promise<ImageContext> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(width, height));
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  const analysisData = ctx.getImageData(0, 0, dw, dh);

  return { file, kind, width, height, bitmap, analysisData };
}
