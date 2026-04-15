import { pool, withTransaction } from "../db/repositories/db.js";
import {
  releasePrmgRefreshLock,
  tryAcquirePrmgRefreshLock,
} from "../db/repositories/jobLockRepository.js";
import {
  completeRefreshLog,
  createRefreshLog,
} from "../db/repositories/refreshLogRepository.js";
import {
  countRowsForVersion,
  createPricingVersion,
  getLastSuccessfulSourceHash,
  getLatestLiveVersion,
  insertPricingRows,
  publishStagingVersion,
  updateVersionStatus,
} from "../db/repositories/pricingVersionRepository.js";
import { fetchPrmgRateSheet } from "../connectors/prmg/fetchPrmgRateSheet.js";
import { normalizePrmgData } from "../connectors/prmg/normalizePrmgData.js";
import { parsePrmgWorkbook } from "../connectors/prmg/parsePrmgWorkbook.js";
import { validatePrmgData } from "../connectors/prmg/validatePrmgData.js";
import { logger } from "../utils/logger.js";

export interface RefreshResult {
  status: "published" | "skipped" | "failed" | "locked";
  message: string;
  pricingVersionId?: string;
}

export async function refreshPrmgRates(): Promise<RefreshResult> {
  const lockClient = await pool.connect();
  const startedAt = new Date();
  let logId: string | null = null;

  try {
    const locked = await tryAcquirePrmgRefreshLock(lockClient);
    if (!locked) {
      logger.warn("PRMG refresh skipped because another refresh is running.");
      return {
        status: "locked",
        message: "Another PRMG refresh is already running.",
      };
    }

    logId = await createRefreshLog(pool, {
      lenderCode: "PRMG",
      startedAt,
      status: "running",
      message: "PRMG refresh started.",
    });

    const fetched = await fetchPrmgRateSheet();
    const lastHash = await getLastSuccessfulSourceHash(pool, "PRMG");

    if (lastHash && lastHash === fetched.sourceHash) {
      await completeRefreshLog(pool, {
        id: logId,
        status: "skipped",
        message: "No change detected in PRMG source file hash.",
      });
      return {
        status: "skipped",
        message: "No change detected in PRMG source file hash.",
      };
    }

    const parsed = parsePrmgWorkbook(fetched.buffer);
    const normalizedRows = normalizePrmgData(parsed.rows);
    const liveVersion = await getLatestLiveVersion(pool, "PRMG");
    const priorLiveRowCount = liveVersion ? await countRowsForVersion(pool, liveVersion.id) : null;

    const stagingVersion = await withTransaction(async (client) => {
      const version = await createPricingVersion(client, {
        lenderCode: "PRMG",
        sourceUrl: fetched.sourceUrl,
        sourceHash: fetched.sourceHash,
        sourceTimestamp: fetched.sourceTimestamp,
        refreshStartedAt: startedAt,
        status: "staging",
      });

      await insertPricingRows(client, version.id, normalizedRows);
      return version;
    });

    const validationSummary = validatePrmgData({
      sheetNames: parsed.sheetNames,
      rows: normalizedRows,
      priorLiveRowCount,
      effectiveDate: null,
    });

    if (!validationSummary.valid) {
      await updateVersionStatus(
        pool,
        stagingVersion.id,
        "failed",
        validationSummary,
        validationSummary.effectiveDate,
      );
      await completeRefreshLog(pool, {
        id: logId,
        status: "failed",
        message: "PRMG validation failed. Prior live pricing remains active.",
        pricingVersionId: stagingVersion.id,
        errorDetails: { errors: validationSummary.errors, warnings: validationSummary.warnings },
      });
      return {
        status: "failed",
        message: "PRMG validation failed. Prior live pricing remains active.",
        pricingVersionId: stagingVersion.id,
      };
    }

    const live = await publishStagingVersion({
      versionId: stagingVersion.id,
      lenderCode: "PRMG",
      validationSummary,
      effectiveDate: validationSummary.effectiveDate,
    });

    await completeRefreshLog(pool, {
      id: logId,
      status: "published",
      message: "PRMG pricing published live.",
      pricingVersionId: live.id,
    });

    logger.info("PRMG pricing published.", {
      pricingVersionId: live.id,
      rowCount: validationSummary.rowCount,
    });

    return {
      status: "published",
      message: "PRMG pricing published live.",
      pricingVersionId: live.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error.";
    logger.error("PRMG refresh failed.", { error: message });

    if (logId) {
      await completeRefreshLog(pool, {
        id: logId,
        status: "failed",
        message: "PRMG refresh failed. Prior live pricing remains active.",
        errorDetails: { message },
      });
    }

    return {
      status: "failed",
      message: "PRMG refresh failed. Prior live pricing remains active.",
    };
  } finally {
    try {
      await releasePrmgRefreshLock(lockClient);
    } catch (error) {
      logger.warn("Failed to release PRMG advisory lock.", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      lockClient.release();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshPrmgRates()
    .then((result) => {
      logger.info("Manual PRMG refresh complete.", { ...result });
      process.exit(result.status === "failed" ? 1 : 0);
    })
    .catch((error) => {
      logger.error("Manual PRMG refresh crashed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}
