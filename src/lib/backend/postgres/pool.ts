import { Pool } from "pg";

// Reuse a single pool across hot-reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __skinaiPgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__skinaiPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set (required for BACKEND=local)");
    }
    globalThis.__skinaiPgPool = new Pool({ connectionString, max: 10 });
  }
  return globalThis.__skinaiPgPool;
}
