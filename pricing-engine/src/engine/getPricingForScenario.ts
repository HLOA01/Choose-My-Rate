import { pool } from "../db/repositories/db.js";
import { getPlatformControl } from "../db/repositories/platformControlRepository.js";
import { getRowsForVersion } from "../db/repositories/pricingRowRepository.js";
import { getLatestLiveVersion } from "../db/repositories/pricingVersionRepository.js";
import type { PricingQuoteResponse } from "../types/pricing.js";
import type { PricingScenario } from "../types/scenario.js";
import { filterEligiblePrograms } from "./filterEligiblePrograms.js";
import { getMissingScenarioFields } from "./mapScenarioToProducts.js";
import { rankBestExecution } from "./rankBestExecution.js";

export async function getPricingForScenario(
  scenario: Partial<PricingScenario>,
): Promise<PricingQuoteResponse> {
  const control = await getPlatformControl(pool);

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
    return {
      status: "needs_more_info",
      banner: control.pricingStatus === "warning" ? control.bannerMessage : null,
      missingFields,
      message: "More information is needed to generate pricing.",
      options: [],
      leadCaptureEnabled: control.leadCaptureEnabled,
      callbackEnabled: control.callbackEnabled,
    };
  }

  const liveVersion = await getLatestLiveVersion(pool, "PRMG");
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

  const rows = await getRowsForVersion(pool, liveVersion.id);
  const eligible = filterEligiblePrograms(rows, scenario as PricingScenario);

  if (!eligible.length) {
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
    options: rankBestExecution(eligible, scenario as PricingScenario),
    leadCaptureEnabled: control.leadCaptureEnabled,
    callbackEnabled: control.callbackEnabled,
  };
}
