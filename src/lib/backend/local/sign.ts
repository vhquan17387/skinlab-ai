// HMAC-SHA256 signing helpers using Web Crypto API so the exact same code
// runs on both Node and the Edge runtime (middleware).

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(message: string, secret: string): Promise<string> {
  return toHex(await hmac(message, secret));
}

/** Build `path=...&exp=...&sig=...` query for a local signed URL. */
export async function signLocalUrl(
  path: string,
  ttlSeconds: number,
  secret: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacHex(`${path}|${exp}`, secret);
  const qs = new URLSearchParams({ path, exp: String(exp), sig });
  return `/api/files?${qs.toString()}`;
}

export async function verifyLocalUrl(
  path: string,
  exp: string,
  sig: string,
  secret: string,
): Promise<boolean> {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return false;
  if (Math.floor(Date.now() / 1000) > expNum) return false;
  const expected = await hmacHex(`${path}|${exp}`, secret);
  return constantTimeEqual(expected, sig);
}

// Base64url-encoded HMAC session payloads (auth) ----------------------------

export async function signSession(
  payload: object,
  secret: string,
): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadB64 = toBase64Url(new TextEncoder().encode(json));
  const sig = toBase64Url(await hmac(payloadB64, secret));
  return `${payloadB64}.${sig}`;
}

export async function verifySession<T = unknown>(
  token: string,
  secret: string,
): Promise<T | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = toBase64Url(await hmac(payloadB64, secret));
  if (!constantTimeEqual(expected, sig)) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
