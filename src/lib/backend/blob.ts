import "server-only";
import type { BlobStore } from "./types";
import { selectedBackend } from "./select";
import { LocalBlobStore } from "./local/blob-store";
import { SupabaseBlobStore } from "./supabase/blob-store";

let cached: BlobStore | undefined;

export function getBlobStore(): BlobStore {
  if (!cached) {
    cached =
      selectedBackend() === "supabase"
        ? new SupabaseBlobStore()
        : new LocalBlobStore();
  }
  return cached;
}
