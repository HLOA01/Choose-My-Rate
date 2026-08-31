import { pool } from "../db/repositories/db.js";
import { getPlatformControl } from "../db/repositories/platformControlRepository.js";
import { getRowsForVersion } from "../db/repositories/pricingRowRepository.js";
import { getLatestLiveVersion } from "../db/repositories/pricingVersionRepository.js";
import type { PlatformControl } from "../db/models/platformControl.js";
import type { PricingRow } from "../db/models/pricingRow.js";
import type { PricingVersion } from "../db/models/pricingVersion.js";
import type { PricingQuoteResponse } from "../types/pricing.js";
import type { PricingScenario } from "../types/scenario.js";
import { filterEligiblePrograms } from "./filterEligiblePrograms.js";
import { getMissingScenarioFields } from "./mapScenarioToProducts.js";
import { rankBestExecution } from "./rankBestExecution.js";
import { selectBorrowerRateStackRows } from "./selectBorrowerRateStackRows.js";

interface PricingDependencies {
  getPlatformControl: () => Promise<PlatformControl>;
  getLatestLiveVersion: () => Promise<PricingVersion | null>;
  getRowsForVersion: (versionId: string) => Promise<PricingRow[]>;
}

export async function getPricingForScenarioWithDependencies(
  scenario: Partial<PricingScenario>,
  dependencies: PricingDependencies,
): Promise<PricingQuoteResponse> {
  const control = await dependencies.getPlatformControl();

  if (control.pricingStatus === "paused") {
    return {
      status: "paused",
      banner: null,
      message:
        control.pauseMessage ??
        "Due to current market conditions, online pricing is temporarily unavailable. Please leave your information and one of our mortgage advisors will contact you.",
      options: [],
      leadCaptureEnabled: control.leadCaptureEnabled,
      callbackEnabled: control.callbackEnabled,
    };
  }

  const missingFields = getMissingScenarioFields(scenario);
  if (missingFields.length) {
    const zipOnlyMissing = missingFields.length === 1 && missingFields[0] === "zipCode";
    return {
      status: "needs_more_info",
      banner: zipOnlyMissing
        ? "ZIP needed for more accurate pricing."
        : control.pricingStatus === "warning" ? control.bannerMessage : null,
      missingFields,
      message: zipOnlyMissing
        ? "ZIP code is needed for more accurate pricing."
        : "More information is needed to generate pricing.",
      options: [],
      leadCaptureEnabled: control.leadCaptureEnabled,
      callbackEnabled: control.callbackEnabled,
    };
  }

  const liveVersion = await dependencies.getLatestLiveVersion();
  if (!liveVersion) {
    return {
      status: "no_live_pricing",
      banner: control.pricingStatus === "warning" ? control.bannerMessage : null,
      message: "Pricing is not available yet.",
      options: [],
      leadCaptureEnabled: true,
      callbackEnabled: true,
    };
  }

  const completeScenario = scenario as PricingScenario;
  const rows = await dependencies.getRowsForVersion(liveVersion.id);
  const eligible = filterEligiblePrograms(rows, completeScenario);
  const rateStackRows = selectBorrowerRateStackRows(eligible, completeScenario);

  if (!rateStackRows.length) {
    return {
      status: "no_eligible_options",
      banner: control.pricingStatus === "warning" ? control.bannerMessage : null,
      pricingVersionId: liveVersion.id,
      pricingAsOf: liveVersion.publishedAt?.toISOString() ?? liveVersion.createdAt.toISOString(),
      message: "No eligible pricing options were found for this scenario.",
      options: [],
      leadCaptureEnabled: true,
      callbackEnabled: true,
    };
  }

  return {
    status: control.pricingStatus,
    banner: control.pricingStatus === "warning" ? control.bannerMessage : null,
    pricingVersionId: liveVersion.id,
    pricingAsOf: liveVersion.publishedAt?.toISOString() ?? liveVersion.createdAt.toISOString(),
    options: rankBestExecution(rateStackRows, completeScenario),
    leadCaptureEnabled: control.leadCaptureEnabled,
    callbackEnabled: control.callbackEnabled,
  };
}

export async function getPricingForScenario(
  scenario: Partial<PricingScenario>,
): Promise<PricingQuoteResponse> {
  return getPricingForScenarioWithDependencies(scenario, {
    getPlatformControl: () => getPlatformControl(pool),
    getLatestLiveVersion: () => getLatestLiveVersion(pool, "PRMG"),
    getRowsForVersion: (versionId) => getRowsForVersion(pool, versionId),
  });
}
