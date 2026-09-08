import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../migrations"),
    resolve(here, "../../migrations"),
    resolve(process.cwd(), "migrations"),
  ];
  const migrationsDir = candidates.find((path) => {
    try {
      readdirSync(path);
      return true;
    } catch {
      return false;
    }
  });
  if (!migrationsDir) throw new Error("migrations directory not found");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  if (migrationFiles.length === 0) throw new Error("migration file not found");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const filename of migrationFiles) {
      await client.query(readFileSync(resolve(migrationsDir, filename), "utf8"));
      console.log("migrate ok", filename);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
