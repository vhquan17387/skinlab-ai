import "server-only";
import type { SkinAnalysisProvider } from "./types";
import { MockSkinAnalysisProvider } from "./mock-provider";
import { ClaudeSkinAnalysisProvider } from "./claude-provider";

export { normalize } from "./normalize";
export type * from "./types";

// Select provider via SKIN_AI_PROVIDER. Adding a provider = new class + a case here.
export function getSkinAnalysisProvider(): SkinAnalysisProvider {
  const name = (process.env.SKIN_AI_PROVIDER || "mock").toLowerCase();
  switch (name) {
    case "claude":
      return new ClaudeSkinAnalysisProvider();
    case "mock":
    default:
      return new MockSkinAnalysisProvider();
  }
}
