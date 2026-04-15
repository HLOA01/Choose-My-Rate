import { pool, withTransaction } from "../src/db/repositories/db.js";
import {
  createPricingVersion,
  insertPricingRows,
  publishStagingVersion,
} from "../src/db/repositories/pricingVersionRepository.js";
import type { NormalizedPricingRow, ValidationSummary } from "../src/types/pricing.js";
import { logger } from "../src/utils/logger.js";

const rows: NormalizedPricingRow[] = [
  {
    lenderCode: "PRMG",
    productCode: "example-conventional-30",
    productName: "Conventional 30 Year Fixed",
    loanType: "conventional",
    termMonths: 360,
    amortizationType: "Fixed",
    rate: 6.25,
    price: 0.125,
    lockDays: 30,
    pointsOrCreditType: "points",
    channel: "wholesale",
    rawRowJson: { seed: true },
  },
  {
    lenderCode: "PRMG",
    productCode: "example-fha-30",
    productName: "FHA 30 Year Fixed",
    loanType: "fha",
    termMonths: 360,
    amortizationType: "Fixed",
    rate: 6.125,
    price: 0.25,
    lockDays: 30,
    pointsOrCreditType: "points",
    channel: "wholesale",
    rawRowJson: { seed: true },
  },
  {
    lenderCode: "PRMG",
    productCode: "example-conventional-credit-30",
    productName: "Conventional 30 Year Fixed with Credit",
    loanType: "conventional",
    termMonths: 360,
    amortizationType: "Fixed",
    rate: 6.625,
    price: -0.375,
    lockDays: 30,
    pointsOrCreditType: "credit",
    channel: "wholesale",
    rawRowJson: { seed: true },
  },
];

const validationSummary: ValidationSummary = {
  valid: true,
  errors: [],
  warnings: ["Seed pricing is for local API testing only."],
  rowCount: rows.length,
  priorLiveRowCount: null,
  effectiveDate: null,
};

async function seed() {
  const version = await withTransaction(async (client) => {
    const staging = await createPricingVersion(client, {
      lenderCode: "PRMG",
      sourceUrl: "seed://example-pricing",
      sourceHash: `seed-${Date.now()}`,
      sourceTimestamp: new Date(),
      refreshStartedAt: new Date(),
      status: "staging",
    });
    await insertPricingRows(client, staging.id, rows);
    return staging;
  });

  const live = await publishStagingVersion({
    versionId: version.id,
    lenderCode: "PRMG",
    validationSummary,
    effectiveDate: null,
  });

  logger.info("Seed pricing published.", { pricingVersionId: live.id });
  await pool.end();
}

seed().catch(async (error) => {
  logger.error("Seed failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  await pool.end();
  process.exit(1);
});
