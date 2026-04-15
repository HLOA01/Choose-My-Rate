import { Router } from "express";
import { pool } from "../../db/repositories/db.js";
import { getLatestLiveVersion } from "../../db/repositories/pricingVersionRepository.js";
import { getLastRefreshLog } from "../../db/repositories/refreshLogRepository.js";
import { getSchedulerHealth } from "../../jobs/scheduler.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res, next) => {
  try {
    const liveVersion = await getLatestLiveVersion(pool, "PRMG");
    const lastRefresh = await getLastRefreshLog(pool, "PRMG");
    res.json({
      status: "ok",
      scheduler: getSchedulerHealth(),
      currentLivePricingVersion: liveVersion
        ? {
            id: liveVersion.id,
            lenderCode: liveVersion.lenderCode,
            publishedAt: liveVersion.publishedAt,
            sourceTimestamp: liveVersion.sourceTimestamp,
          }
        : null,
      lastRefresh,
    });
  } catch (error) {
    next(error);
  }
});
