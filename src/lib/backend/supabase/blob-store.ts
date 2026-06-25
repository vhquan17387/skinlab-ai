import { getServiceClient } from "./clients";
import type { BlobStore, PutBlobInput } from "@/lib/backend/types";

function bucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "skin-images";
}

export class SupabaseBlobStore implements BlobStore {
  private get db() {
    return getServiceClient();
  }

  async put(input: PutBlobInput): Promise<{ path: string }> {
    const { error } = await this.db.storage
      .from(bucket())
      .upload(input.path, input.bytes, {
        contentType: input.contentType,
        upsert: true,
      });
    if (error) throw error;
    return { path: input.path };
  }

  async get(
    path: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const { data, error } = await this.db.storage.from(bucket()).download(path);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    return { bytes: buf, contentType: data.type || "application/octet-stream" };
  }

  async signedUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.db.storage
      .from(bucket())
      .createSignedUrl(path, ttlSeconds);
    if (error || !data) throw error ?? new Error("Failed to sign URL");
    return data.signedUrl;
  }
}
