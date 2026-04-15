import { runMigrations } from "../src/db/migrate.js";
import { pool } from "../src/db/repositories/db.js";
import { logger } from "../src/utils/logger.js";

async function migrate() {
  await runMigrations(pool);
  await pool.end();
}

migrate().catch(async (error) => {
  logger.error("Migration failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  await pool.end();
  process.exit(1);
});
