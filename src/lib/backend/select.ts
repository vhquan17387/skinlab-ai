// Single source of truth for which backend is active.
export type BackendName = "local" | "supabase";

export function selectedBackend(): BackendName {
  const b = (process.env.BACKEND || "local").toLowerCase();
  return b === "supabase" ? "supabase" : "local";
}
