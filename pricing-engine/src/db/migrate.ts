import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { logger } from "../utils/logger.js";

const migrationsDir = join(process.cwd(), "migrations");

export async function runMigrations(pool: Pool) {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    logger.info("Running migration.", { file });
    await pool.query(sql);
  }

  logger.info("Migrations complete.");
}
