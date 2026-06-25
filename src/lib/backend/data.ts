import "server-only";
import type { DataStore } from "./types";
import { selectedBackend } from "./select";
import { PostgresDataStore } from "./postgres/data-store";
import { SupabaseDataStore } from "./supabase/data-store";

let cached: DataStore | undefined;

export function getDataStore(): DataStore {
  if (!cached) {
    cached =
      selectedBackend() === "supabase"
        ? new SupabaseDataStore()
        : new PostgresDataStore();
  }
  return cached;
}
