"use client";

// Live multi-illumination skin scan.
//
// Instead of uploading static photos, we drive the phone screen as a controlled
// light source: flash [black, white, red, green, blue] full-screen while the
// front camera captures one frame per colour. The black frame is ambient (room
// light) and gets subtracted; the coloured frames give pseudo narrow-band
// reflectance so the melanin/haemoglobin separation is far cleaner than a random
// uploaded selfie. All processing runs in-browser (see lib/imaging/decompose).
//
// This is the v2 spike: it proves capture + decomposition quality on a real
// phone before we wire it into the submit/report pipeline.

import { useCallback, useEffect, useRef, useState } from "react";
import { decompose, ALL_LAYER_KEYS } from "@/lib/imaging/decompose";
import {
  detectLandmarks,
  buildFaceMask,
  estimateAffine,
  warpToReference,
} from "@/lib/imaging/facemesh";
import type {
  CaptureSet,
  FrameLike,
  IlluminationKey,
  LayerKey,
  DecomposeResult,
} from "@/lib/imaging/types";

// Wrap a frame in an offscreen canvas so MediaPipe / warp can consume it.
function toCanvas(img: FrameLike): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const id = new ImageData(img.width, img.height);
  id.data.set(img.data);
  c.getContext("2d")!.putImageData(id, 0, 0);
  return c;
}

const PROC_WIDTH = 480; // downscale width for processing (speed)

// Capture sequence: css colour to paint full-screen + settle time before grab.
const SEQUENCE: { key: IlluminationKey; css: string; label: string }[] = [
  { key: "ambient", css: "#000000", label: "Ánh sáng nền" },
  { key: "white", css: "#ffffff", label: "Trắng" },
  { key: "red", css: "#ff0000", label: "Đỏ" },
  { key: "green", css: "#00ff00", label: "Lục" },
  { key: "blue", css: "#0000ff", label: "Lam" },
];

const SETTLE_MS = 380; // let the screen render + camera exposure adapt

type Phase = "idle" | "starting" | "ready" | "capturing" | "processing" | "done" | "error";

const LAYER_ORDER: (LayerKey | "original")[] = [
  "original",
  "spots",
  "brownSpots",
  "redAreas",
  "pores",
  "texture",
  "wrinkles",
];

const LAYER_LABEL: Record<LayerKey | "original", string> = {
  original: "Ảnh gốc",
  spots: "Spots",
  brownSpots: "Brown Spots",
  redAreas: "Red Areas",
  pores: "Pores",
  texture: "Texture",
  wrinkles: "Wrinkles",
};

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

export function ScanClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const grabCanvasRef = useRef<HTMLCanvasElement>(null); // hidden, for frame grabs
  const viewCanvasRef = useRef<HTMLCanvasElement>(null); // visible result canvas
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ css: string; label: string } | null>(null);
  const [ambientWarn, setAmbientWarn] = useState<string | null>(null);

  const framesRef = useRef<CaptureSet>({});
  const resultRef = useRef<DecomposeResult | null>(null);
  const whiteFrameRef = useRef<ImageData | null>(null);
  const [active, setActive] = useState<LayerKey | "original">("original");
  const [coverages, setCoverages] = useState<Record<string, number> | null>(null);
  const [faceFound, setFaceFound] = useState(true);

  // -------- camera lifecycle --------
  const startCamera = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      // Best-effort: lock exposure & white balance so screen flashes don't get
      // auto-corrected away. Support is spotty (good on Android Chrome, limited
      // on iOS Safari) — ignore failures.
      const track = stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [
            { exposureMode: "manual" },
            { whiteBalanceMode: "manual" },
            { focusMode: "manual" },
          ],
        } as unknown as MediaTrackConstraints);
      } catch {
        /* not supported — software normalisation compensates */
      }
      setPhase("ready");
    } catch (e) {
      setError(
        "Không truy cập được camera. Hãy cấp quyền camera và mở trang qua HTTPS (hoặc localhost).",
      );
      setPhase("error");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Grab the current video frame into an ImageData at processing resolution.
  const grabFrame = useCallback((): ImageData | null => {
    const v = videoRef.current;
    const c = grabCanvasRef.current;
    if (!v || !c || !v.videoWidth) return null;
    const w = PROC_WIDTH;
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Mirror-correct not needed for analysis; draw straight.
    ctx.drawImage(v, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }, []);

  // Quick ambient brightness check on the live preview.
  const checkAmbient = useCallback(() => {
    const img = grabFrame();
    if (!img) return;
    let sum = 0;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    const avg = sum / (d.length / 4);
    setAmbientWarn(
      avg > 130
        ? "Phòng đang khá sáng — vào chỗ tối hơn để kết quả chính xác hơn."
        : null,
    );
  }, [grabFrame]);

  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(checkAmbient, 800);
    return () => clearInterval(id);
  }, [phase, checkAmbient]);

  // -------- capture sequence --------
  const runCapture = useCallback(async () => {
    setPhase("capturing");
    const set: CaptureSet = {};
    for (const step of SEQUENCE) {
      setFlash({ css: step.css, label: step.label });
      // Two rAFs to ensure the colour is painted, then let exposure settle.
      await nextFrame();
      await nextFrame();
      await wait(SETTLE_MS);
      const img = grabFrame();
      if (img) {
        set[step.key] = img;
        if (step.key === "white") whiteFrameRef.current = img;
      }
    }
    setFlash(null);
    framesRef.current = set;

    setPhase("processing");
    await nextFrame();
    try {
      const white = set.white;
      if (!white) throw new Error("no white frame");
      const w = white.width;
      const h = white.height;

      // 1. Locate the face on the white frame → real skin mask + reference
      //    landmarks for aligning the coloured frames.
      const whiteLm = await detectLandmarks(toCanvas(white), w, h);
      let mask: Uint8Array | undefined;
      if (whiteLm) {
        mask = buildFaceMask(whiteLm, w, h);
        // 2. Warp each coloured frame onto the white frame. If its face can't be
        //    found, drop the band so decompose falls back to the white channel.
        for (const band of ["red", "green", "blue"] as IlluminationKey[]) {
          const frame = set[band];
          if (!frame) continue;
          const lm = await detectLandmarks(toCanvas(frame), w, h);
          const af = lm ? estimateAffine(lm, whiteLm) : null;
          if (af) set[band] = warpToReference(toCanvas(frame), af, w, h);
          else delete set[band];
        }
      }
      setFaceFound(!!whiteLm);

      const result = decompose(set, mask ? { mask } : {});
      resultRef.current = result;
      const cov: Record<string, number> = {};
      for (const k of ALL_LAYER_KEYS) cov[k] = result.layers[k].coverage;
      setCoverages(cov);
      setActive("original");
      setPhase("done");
    } catch (e) {
      setError("Xử lý ảnh thất bại. Thử chụp lại và giữ máy thật yên.");
      setPhase("error");
    }
  }, [grabFrame]);

  // -------- render selected layer onto the visible canvas --------
  useEffect(() => {
    if (phase !== "done") return;
    const base = whiteFrameRef.current;
    const result = resultRef.current;
    const c = viewCanvasRef.current;
    if (!base || !result || !c) return;
    c.width = base.width;
    c.height = base.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(base, 0, 0);
    if (active !== "original") {
      const overlay = result.layers[active].overlay;
      // Composite the per-pixel-alpha overlay via a temp canvas.
      const tmp = document.createElement("canvas");
      tmp.width = overlay.width;
      tmp.height = overlay.height;
      const tctx = tmp.getContext("2d");
      if (tctx) {
        const od = new ImageData(overlay.width, overlay.height);
        od.data.set(overlay.data);
        tctx.putImageData(od, 0, 0);
        ctx.drawImage(tmp, 0, 0);
      }
    }
  }, [active, phase]);

  const restart = useCallback(() => {
    framesRef.current = {};
    resultRef.current = null;
    whiteFrameRef.current = null;
    setCoverages(null);
    setActive("original");
    setPhase("ready");
  }, []);

  // -------- UI --------
  return (
    <div className="space-y-5">
      {/* Full-screen colour flash overlay during capture */}
      {flash && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center pb-10"
          style={{ backgroundColor: flash.css }}
          aria-hidden
        >
          <span className="rounded-full bg-black/40 px-4 py-1.5 text-sm font-medium text-white">
            Đang chụp: {flash.label} — giữ yên máy
          </span>
        </div>
      )}

      {phase === "idle" && (
        <div className="space-y-4">
          <Instructions />
          <button
            onClick={startCamera}
            className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground"
          >
            Bật camera
          </button>
        </div>
      )}

      {phase === "starting" && <p className="text-sm text-muted-foreground">Đang mở camera…</p>}

      {phase === "error" && (
        <div className="space-y-3">
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
          <button onClick={startCamera} className="rounded-md border px-4 py-2 text-sm">
            Thử lại
          </button>
        </div>
      )}

      {/* Live preview (ready / capturing) */}
      <div className={phase === "ready" || phase === "capturing" ? "block" : "hidden"}>
        <div className="relative mx-auto max-w-sm overflow-hidden rounded-xl bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full -scale-x-100" // mirror for natural selfie framing
          />
          {/* Face-align guide oval */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-3/4 w-3/5 rounded-[50%] border-2 border-white/70" />
          </div>
        </div>

        {phase === "ready" && (
          <div className="mt-4 space-y-3">
            {ambientWarn && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800">
                {ambientWarn}
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Đưa mặt vào khung bầu dục, giữ máy cách ~30cm. Khi chụp, màn hình sẽ nháy 5 màu
              trong ~2 giây — <b>giữ yên máy và khuôn mặt</b>.
            </p>
            <button
              onClick={runCapture}
              className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground"
            >
              Bắt đầu quét (5 lần nháy)
            </button>
          </div>
        )}
      </div>

      {phase === "processing" && (
        <p className="text-center text-sm text-muted-foreground">Đang phân tích các lớp da…</p>
      )}

      {/* Results */}
      {phase === "done" && (
        <div className="space-y-4">
          {!faceFound && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800">
              Không nhận diện được khuôn mặt rõ ràng — vùng phân tích có thể chưa chuẩn.
              Thử lại: đưa mặt vào giữa khung, đủ sáng, chính diện.
            </p>
          )}
          <canvas
            ref={viewCanvasRef}
            className="mx-auto w-full max-w-sm rounded-xl border"
          />
          <div className="flex flex-wrap justify-center gap-2">
            {LAYER_ORDER.map((k) => {
              const isBeta = k !== "original" && resultRef.current?.layers[k].beta;
              const cov = k !== "original" && coverages ? coverages[k] : null;
              return (
                <button
                  key={k}
                  onClick={() => setActive(k)}
                  className={
                    "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                    (active === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-secondary")
                  }
                >
                  {LAYER_LABEL[k]}
                  {isBeta ? " ·beta" : ""}
                  {cov != null ? ` (${Math.round(cov * 100)}%)` : ""}
                </button>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            % = tỉ lệ vùng da bị ảnh hưởng theo lớp đó (càng thấp càng tốt). Đây là bản thử
            nghiệm — chưa phải chẩn đoán y khoa.
          </p>
          <button
            onClick={restart}
            className="w-full rounded-md border px-4 py-2.5 text-sm font-medium"
          >
            Quét lại
          </button>
        </div>
      )}

      {/* hidden work canvas */}
      <canvas ref={grabCanvasRef} className="hidden" />
    </div>
  );
}

function Instructions() {
  return (
    <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
      <p className="font-medium">Cách quét cho kết quả tốt nhất</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Vào phòng hơi tối, tắt bớt đèn.</li>
        <li>Tăng độ sáng màn hình lên tối đa.</li>
        <li>Rửa mặt sạch, không trang điểm.</li>
        <li>Giữ máy cách mặt ~30cm và thật yên trong lúc màn hình nháy màu.</li>
      </ul>
    </div>
  );
}
