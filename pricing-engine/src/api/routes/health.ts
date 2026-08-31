import { Router } from "express";
import type { PricingVersion } from "../../db/models/pricingVersion.js";
import type { RefreshLog } from "../../db/models/refreshLog.js";
import { pool } from "../../db/repositories/db.js";
import { getLatestLiveVersion } from "../../db/repositories/pricingVersionRepository.js";
import { getLastRefreshLog } from "../../db/repositories/refreshLogRepository.js";
import { getSchedulerHealth } from "../../jobs/scheduler.js";

export const healthRouter = Router();

interface HealthDependencies {
  getLatestLiveVersion: () => Promise<PricingVersion | null>;
  getLastRefreshLog: () => Promise<RefreshLog | null>;
  getSchedulerHealth: () => ReturnType<typeof getSchedulerHealth>;
}

export async function buildHealthResponse(dependencies: HealthDependencies) {
  const liveVersion = await dependencies.getLatestLiveVersion();
  const lastRefresh = await dependencies.getLastRefreshLog();

  return {
    status: "ok",
    scheduler: dependencies.getSchedulerHealth(),
    currentLivePricingVersion: liveVersion
      ? {
          id: liveVersion.id,
          lenderCode: liveVersion.lenderCode,
          publishedAt: liveVersion.publishedAt,
          sourceTimestamp: liveVersion.sourceTimestamp,
        }
      : null,
    lastRefresh,
  };
}

healthRouter.get("/", async (_req, res, next) => {
  try {
    res.json(
      await buildHealthResponse({
        getLatestLiveVersion: () => getLatestLiveVersion(pool, "PRMG"),
        getLastRefreshLog: () => getLastRefreshLog(pool, "PRMG"),
        getSchedulerHealth,
      }),
    );
  } catch (error) {
    next(error);
  }
});
