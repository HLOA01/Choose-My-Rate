import { fetchPrmgRateSheet } from "../connectors/prmg/fetchPrmgRateSheet.js";
import { normalizePrmgData } from "../connectors/prmg/normalizePrmgData.js";
import { parsePrmgWorkbook } from "../connectors/prmg/parsePrmgWorkbook.js";
import type { PricingRow } from "../db/models/pricingRow.js";
import type { PricingQuoteResponse } from "../types/pricing.js";
import type { PricingScenario } from "../types/scenario.js";
import { filterEligiblePrograms } from "./filterEligiblePrograms.js";
import { getMissingScenarioFields } from "./mapScenarioToProducts.js";
import { rankBestExecution } from "./rankBestExecution.js";
import { selectBorrowerRateStackRows } from "./selectBorrowerRateStackRows.js";

interface DevPrmgSnapshot {
  sourceUrl: string;
  sourceHash: string;
  sourceTimestamp: Date | null;
  parsedRowCount: number;
  normalizedRowCount: number;
  rows: PricingRow[];
  loadedAt: Date;
}

let snapshotPromise: Promise<DevPrmgSnapshot> | null = null;

function toPricingRow(row: ReturnType<typeof normalizePrmgData>[number], index: number): PricingRow {
  return {
    id: `dev-prmg-${index}`,
    pricingVersionId: "dev-prmg-xls",
    lenderCode: row.lenderCode,
    productCode: row.productCode,
    productName: row.productName,
    loanType: row.loanType,
    termMonths: row.termMonths,
    amortizationType: row.amortizationType,
    rate: row.rate,
    price: row.price,
    lockDays: row.lockDays,
    pointsOrCreditType: row.pointsOrCreditType,
    channel: row.channel,
    rawRowJson: row.rawRowJson,
    createdAt: new Date(),
  };
}

function programFallbackRows(scenario: Partial<PricingScenario>): PricingRow[] {
  const loanType = scenario.loanTypePreference || "conventional";
  const productName = `PRMG ${loanType.toUpperCase()} 30 Year Fixed`;
  const baseRate = loanType === "fha" ? 6.375 : loanType === "va" ? 6.25 : loanType === "jumbo" ? 6.875 : 6.75;
  const stack = [
    { rateOffset: -0.375, price: 1.125 },
    { rateOffset: -0.25, price: 0.75 },
    { rateOffset: -0.125, price: 0.375 },
    { rateOffset: 0, price: 0 },
    { rateOffset: 0.125, price: -0.375 },
    { rateOffset: 0.25, price: -0.75 },
    { rateOffset: 0.375, price: -1.0 },
  ];

  return stack.map((item, index) => ({
    id: `dev-prmg-fallback-${index}`,
    pricingVersionId: "dev-prmg-xls",
    lenderCode: "PRMG",
    productCode: `prmg-dev-${loanType}-${index}`,
    productName,
    loanType,
    termMonths: 360,
    amortizationType: "Fixed",
    rate: Number((baseRate + item.rateOffset).toFixed(3)),
    price: item.price,
    lockDays: 30,
    pointsOrCreditType: item.price >= 0 ? "points" : "credit",
    channel: "wholesale",
    rawRowJson: {
      source: "development_prmg_xls_fallback",
    },
    createdAt: new Date(),
  }));
}

export async function getDevPrmgSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetchPrmgRateSheet().then((fetched) => {
      const parsed = parsePrmgWorkbook(fetched.buffer);
      const normalized = normalizePrmgData(parsed.rows);

      return {
        sourceUrl: fetched.sourceUrl,
        sourceHash: fetched.sourceHash,
        sourceTimestamp: fetched.sourceTimestamp,
        parsedRowCount: parsed.rows.length,
        normalizedRowCount: normalized.length,
        rows: normalized.map(toPricingRow),
        loadedAt: new Date(),
      };
    });
  }

  return snapshotPromise;
}

export async function getDevPrmgHealth() {
  const snapshot = await getDevPrmgSnapshot();

  return {
    enabled: true,
    sourceUrl: snapshot.sourceUrl,
    sourceHash: snapshot.sourceHash,
    sourceTimestamp: snapshot.sourceTimestamp,
    parsedRowCount: snapshot.parsedRowCount,
    normalizedRowCount: snapshot.normalizedRowCount,
    loadedAt: snapshot.loadedAt,
  };
}

export async function getDevPrmgPricingForScenario(
  scenario: Partial<PricingScenario>,
): Promise<PricingQuoteResponse> {
  const missingFields = getMissingScenarioFields(scenario);
  if (missingFields.length) {
    const zipOnlyMissing = missingFields.length === 1 && missingFields[0] === "zipCode";
    return {
      status: "needs_more_info",
      banner: zipOnlyMissing
        ? "ZIP needed for more accurate pricing."
        : "Development PRMG pricing engine is connected.",
      missingFields,
      message: zipOnlyMissing
        ? "ZIP code is needed for more accurate PRMG pricing."
        : "More information is needed to generate pricing.",
      options: [],
      leadCaptureEnabled: true,
      callbackEnabled: true,
    };
  }

  const snapshot = await getDevPrmgSnapshot();
  const completeScenario = scenario as PricingScenario;
  const eligible = filterEligiblePrograms(snapshot.rows, completeScenario);
  const selectedRows = selectBorrowerRateStackRows(eligible, completeScenario);
  const rows = selectedRows.length ? selectedRows : programFallbackRows(scenario);
  const options = rankBestExecution(rows, completeScenario).slice(0, 24);

  return {
    status: "live",
    banner: eligible.length
      ? "Development PRMG XLS pricing is connected."
      : "Development PRMG XLS pricing is connected; using a PRMG-backed test stack until parser coverage is complete.",
    pricingVersionId: "dev-prmg-xls",
    pricingAsOf: (snapshot.sourceTimestamp ?? snapshot.loadedAt).toISOString(),
    message: eligible.length
      ? "Pricing returned from the PRMG XLS development feed."
      : "Pricing returned from the PRMG development fallback stack.",
    options,
    leadCaptureEnabled: true,
    callbackEnabled: true,
  };
}
