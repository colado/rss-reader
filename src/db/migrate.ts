import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

// Make __dirname work whether you're using ESM ("type": "module") or not
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const sqlPath = join(__dirname, "sql", "001_init.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Put it in .env or export it.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Migration ran ✅");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
