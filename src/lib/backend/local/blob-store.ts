import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { BlobStore, PutBlobInput } from "@/lib/backend/types";
import { signLocalUrl } from "./sign";

export function getStorageDir(): string {
  return resolve(process.env.LOCAL_STORAGE_DIR || ".local-storage");
}

function getSecret(): string {
  const s = process.env.LOCAL_STORAGE_SECRET;
  if (!s) throw new Error("LOCAL_STORAGE_SECRET is not set");
  return s;
}

/**
 * Resolve a storage-relative path to an absolute path, refusing anything that
 * escapes the storage root (path traversal protection).
 */
export function resolveSafePath(path: string): string | null {
  const root = getStorageDir();
  const abs = resolve(root, path);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export class LocalBlobStore implements BlobStore {
  async put(input: PutBlobInput): Promise<{ path: string }> {
    const abs = resolveSafePath(input.path);
    if (!abs) throw new Error("Invalid storage path");
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.bytes);
    await writeFile(`${abs}.meta`, JSON.stringify({ contentType: input.contentType }));
    return { path: input.path };
  }

  async get(
    path: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const abs = resolveSafePath(path);
    if (!abs) return null;
    try {
      const bytes = await readFile(abs);
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await readFile(`${abs}.meta`, "utf8"));
        if (meta?.contentType) contentType = meta.contentType;
      } catch {
        /* no sidecar — fall back */
      }
      return { bytes: new Uint8Array(bytes), contentType };
    } catch {
      return null;
    }
  }

  async signedUrl(path: string, ttlSeconds: number): Promise<string> {
    return signLocalUrl(path, ttlSeconds, getSecret());
  }
}

export { join as joinStoragePath };
