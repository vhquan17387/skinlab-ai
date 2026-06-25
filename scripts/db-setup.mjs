// Apply db/schema.sql to the database pointed to by DATABASE_URL.
// Usage: node scripts/db-setup.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://skinai:skinai@localhost:5432/skinai";

async function main() {
  const schemaPath = join(__dirname, "..", "db", "schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ Schema applied to", DATABASE_URL.replace(/:[^:@/]*@/, ":****@"));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ db:setup failed:", err.message);
  process.exit(1);
});
