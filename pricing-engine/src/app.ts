import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { adminRouter } from "./api/routes/admin.js";
import { healthRouter } from "./api/routes/health.js";
import { pricingRouter } from "./api/routes/pricing.js";
import { pool } from "./db/repositories/db.js";
import { runMigrations } from "./db/migrate.js";
import { refreshPrmgRates } from "./jobs/refreshPrmgRates.js";
import { startScheduler } from "./jobs/scheduler.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRouter);
app.use("/pricing", pricingRouter);
app.use("/admin", adminRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Invalid request.",
      issues: error.issues,
    });
    return;
  }

  logger.error("Unhandled request error.", {
    error: error instanceof Error ? error.message : String(error),
  });

  res.status(500).json({
    message: "Pricing engine request failed.",
  });
});

async function start() {
  if (env.RUN_MIGRATIONS_ON_START) {
    await runMigrations(pool);
  }

  app.listen(env.PORT, () => {
    logger.info("Pricing engine listening.", { port: env.PORT });
    startScheduler();

    if (env.RUN_REFRESH_ON_START) {
      void refreshPrmgRates().then((result) => {
        logger.info("Startup PRMG refresh complete.", { ...result });
      });
    }
  });
}

start().catch((error) => {
  logger.error("Pricing engine failed to start.", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
