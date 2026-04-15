import cron from "node-cron";
import { env } from "../config/env.js";
import { refreshPrmgRates } from "./refreshPrmgRates.js";
import { logger } from "../utils/logger.js";

let started = false;
let lastRunStartedAt: Date | null = null;
let lastRunCompletedAt: Date | null = null;
let lastRunStatus: string | null = null;

export function startScheduler() {
  if (started || !env.ENABLE_SCHEDULER) return;

  cron.schedule(env.REFRESH_CRON, async () => {
    lastRunStartedAt = new Date();
    logger.info("Scheduled PRMG refresh triggered.");
    const result = await refreshPrmgRates();
    lastRunCompletedAt = new Date();
    lastRunStatus = result.status;
  });

  started = true;
  logger.info("Pricing scheduler started.", { cron: env.REFRESH_CRON });
}

export function getSchedulerHealth() {
  return {
    enabled: env.ENABLE_SCHEDULER,
    started,
    cron: env.REFRESH_CRON,
    lastRunStartedAt: lastRunStartedAt?.toISOString() ?? null,
    lastRunCompletedAt: lastRunCompletedAt?.toISOString() ?? null,
    lastRunStatus,
  };
}
