import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { resolveSafePath } from "@/lib/backend/local/blob-store";
import { verifyLocalUrl } from "@/lib/backend/local/sign";

export const runtime = "nodejs";

// Serves private images for BACKEND=local. Verifies the HMAC signature + expiry,
// blocks path traversal, and streams the file with its stored content-type.
export async function GET(req: NextRequest) {
  if ((process.env.BACKEND || "local").toLowerCase() !== "local") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const path = searchParams.get("path");
  const exp = searchParams.get("exp");
  const sig = searchParams.get("sig");
  const secret = process.env.LOCAL_STORAGE_SECRET;

  if (!path || !exp || !sig || !secret) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const valid = await verifyLocalUrl(path, exp, sig, secret);
  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  // Path traversal protection.
  const abs = resolveSafePath(path);
  if (!abs) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  let bytes: Buffer;
  let contentType = "application/octet-stream";
  try {
    bytes = await readFile(abs);
    try {
      const meta = JSON.parse(await readFile(`${abs}.meta`, "utf8"));
      if (meta?.contentType) contentType = meta.contentType;
    } catch {
      /* no sidecar */
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
