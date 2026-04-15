import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/repositories/db.js";
import { logger } from "../src/utils/logger.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrationsDir = join(root, "migrations");

async function migrate() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    logger.info("Running migration.", { file });
    await pool.query(sql);
  }

  await pool.end();
  logger.info("Migrations complete.");
}

migrate().catch(async (error) => {
  logger.error("Migration failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  await pool.end();
  process.exit(1);
});
