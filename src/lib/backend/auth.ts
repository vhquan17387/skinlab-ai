// IMPORTANT: this factory runs on the Edge runtime (middleware). It must NOT
// transitively import `pg` or any Node-only module. Only auth impls here.
import type { AuthBackend } from "./types";
import { selectedBackend } from "./select";
import { LocalAuthBackend } from "./local/auth";
import { SupabaseAuthBackend } from "./supabase/auth";

let cached: AuthBackend | undefined;

export function getAuthBackend(): AuthBackend {
  if (!cached) {
    cached =
      selectedBackend() === "supabase"
        ? new SupabaseAuthBackend()
        : new LocalAuthBackend();
  }
  return cached;
}
