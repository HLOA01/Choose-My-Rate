import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { adminRouter } from "./api/routes/admin.js";
import { healthRouter } from "./api/routes/health.js";
import { pricingRouter } from "./api/routes/pricing.js";
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

app.listen(env.PORT, () => {
  logger.info("Pricing engine listening.", { port: env.PORT });
  startScheduler();
});
