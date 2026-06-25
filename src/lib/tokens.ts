import { nanoid } from "nanoid";

// ~190 bits of entropy — not guessable, not the submission id.
export function newReportToken(): string {
  return nanoid(32);
}
