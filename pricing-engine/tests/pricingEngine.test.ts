import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlatformControl } from "../src/db/models/platformControl.js";
import type { PricingRow } from "../src/db/models/pricingRow.js";
import type { PricingVersion } from "../src/db/models/pricingVersion.js";
import type { RefreshLog } from "../src/db/models/refreshLog.js";
import type { PricingScenario } from "../src/types/scenario.js";

process.env.DATABASE_URL ||= "postgres://user:password@127.0.0.1:5432/choose_my_rate_test";
process.env.ADMIN_API_KEY ||= "test-admin-key";

const now = new Date("2026-08-31T12:00:00.000Z");

function control(overrides: Partial<PlatformControl> = {}): PlatformControl {
  return {
    id: "control",
    pricingStatus: "live",
    bannerMessage: null,
    pauseMessage: null,
    callbackEnabled: true,
    leadCaptureEnabled: true,
    useLastPublishedPricing: true,
    activatedBy: null,
    activatedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function version(overrides: Partial<PricingVersion> = {}): PricingVersion {
  return {
    id: "version-live",
    lenderCode: "PRMG",
    sourceUrl: "fixture",
    sourceHash: "fixture-hash",
    sourceTimestamp: now,
    refreshStartedAt: now,
    refreshCompletedAt: now,
    effectiveDate: "2026-08-31",
    status: "live",
    publishedAt: now,
    validationSummary: {},
    createdAt: now,
    ...overrides,
  };
}

function refreshLog(overrides: Partial<RefreshLog> = {}): RefreshLog {
  return {
    id: "refresh",
    lenderCode: "PRMG",
    startedAt: now,
    completedAt: now,
    status: "success",
    message: "ok",
    errorDetails: null,
    pricingVersionId: "version-live",
    createdAt: now,
    ...overrides,
  };
}

function scenario(overrides: Partial<PricingScenario> = {}): PricingScenario {
  return {
    purchasePrice: 500000,
    loanAmount: 400000,
    creditScore: 740,
    occupancy: "primary",
    loanPurpose: "purchase",
    loanTypePreference: "conventional",
    propertyType: "single_family",
    zipCode: "92660",
    downPayment: 100000,
    ltv: 80,
    language: "en",
    ...overrides,
  };
}

function row(overrides: Partial<PricingRow> = {}): PricingRow {
  const rate = overrides.rate ?? 6.5;
  return {
    id: `row-${rate}-${overrides.price ?? 0}`,
    pricingVersionId: "version-live",
    lenderCode: "PRMG",
    productCode: "fnma-30",
    productName: "FNMA 30 Yr Fixed",
    loanType: "conventional",
    termMonths: 360,
    amortizationType: "Fixed",
    rate,
    price: 0,
    lockDays: 30,
    pointsOrCreditType: "points",
    channel: "wholesale",
    rawRowJson: {},
    createdAt: now,
    ...overrides,
  };
}

describe("pricing scenario parsing and validation", () => {
  it("maps areaZip into zipCode", async () => {
    const { parsePricingScenario } = await import("../src/api/routes/pricing.js");
    const parsed = parsePricingScenario({
      purchasePrice: 500000,
      loanAmount: 400000,
      creditScore: 740,
      occupancy: "primary",
      loanPurpose: "purchase",
      areaZip: "92660",
    });

    assert.equal(parsed.zipCode, "92660");
  });

  it("rejects missing ZIP before provider rows are requested", async () => {
    const { getPricingForScenarioWithDependencies } = await import("../src/engine/getPricingForScenario.js");
    let rowsRequested = false;
    const quote = await getPricingForScenarioWithDependencies(scenario({ zipCode: "" }), {
      getPlatformControl: async () => control(),
      getLatestLiveVersion: async () => version(),
      getRowsForVersion: async () => {
        rowsRequested = true;
        return [row()];
      },
    });

    assert.equal(quote.status, "needs_more_info");
    assert.deepEqual(quote.missingFields, ["zipCode"]);
    assert.equal(rowsRequested, false);
  });

  it("accepts valid ZIP and requests mapped provider rows", async () => {
    const { getPricingForScenarioWithDependencies } = await import("../src/engine/getPricingForScenario.js");
    let requestedVersion = "";
    const quote = await getPricingForScenarioWithDependencies(scenario({ zipCode: "92660" }), {
      getPlatformControl: async () => control(),
      getLatestLiveVersion: async () => version({ id: "provider-version" }),
      getRowsForVersion: async (versionId) => {
        requestedVersion = versionId;
        return [row({ rate: 6.5 }), row({ rate: 6.625 })];
      },
    });

    assert.equal(requestedVersion, "provider-version");
    assert.equal(quote.status, "live");
    assert.equal(quote.options.length, 2);
  });
});

describe("borrower PRMG row selection", () => {
  it("removes duplicate rate rows using best execution", async () => {
    const { selectBorrowerRateStackRows } = await import("../src/engine/selectBorrowerRateStackRows.js");
    const selected = selectBorrowerRateStackRows(
      [
        row({ id: "worse", rate: 6.5, price: 0.5 }),
        row({ id: "better", rate: 6.5, price: -0.125 }),
        row({ id: "next", rate: 6.625, price: 0 }),
      ],
      scenario(),
    );

    assert.deepEqual(selected.map((item) => item.id), ["better", "next"]);
  });

  it("selects deterministic thirty-year fixed rows", async () => {
    const { selectBorrowerRateStackRows } = await import("../src/engine/selectBorrowerRateStackRows.js");
    const rows = [
      row({ id: "arm", productName: "FNMA 5/6 SOFR ARM", rate: 6.125, price: -1, amortizationType: "ARM" }),
      row({ id: "fixed-two", productName: "FNMA 30 Yr Fixed", rate: 6.625, price: 0 }),
      row({ id: "fixed-one", productName: "FNMA 30 Yr Fixed", rate: 6.5, price: 0.125 }),
    ];
    const first = selectBorrowerRateStackRows(rows, scenario()).map((item) => item.id);
    const second = selectBorrowerRateStackRows([...rows].reverse(), scenario()).map((item) => item.id);

    assert.deepEqual(first, ["fixed-one", "fixed-two"]);
    assert.deepEqual(second, ["fixed-one", "fixed-two"]);
  });

  it("returns no rows for empty provider results", async () => {
    const { selectBorrowerRateStackRows } = await import("../src/engine/selectBorrowerRateStackRows.js");
    assert.deepEqual(selectBorrowerRateStackRows([], scenario()), []);
  });

  it("ignores malformed provider rows", async () => {
    const { selectBorrowerRateStackRows } = await import("../src/engine/selectBorrowerRateStackRows.js");
    const selected = selectBorrowerRateStackRows(
      [
        { id: "bad", productName: null, rate: Number.NaN },
        row({ id: "good", rate: 6.5 }),
      ] as PricingRow[],
      scenario(),
    );

    assert.deepEqual(selected.map((item) => item.id), ["good"]);
  });
});

describe("provider failure and health behavior", () => {
  it("does not fabricate pricing when provider rows fail", async () => {
    const { getPricingForScenarioWithDependencies } = await import("../src/engine/getPricingForScenario.js");
    await assert.rejects(
      () =>
        getPricingForScenarioWithDependencies(scenario(), {
          getPlatformControl: async () => control(),
          getLatestLiveVersion: async () => version(),
          getRowsForVersion: async () => {
            throw new Error("provider unavailable");
          },
        }),
      /provider unavailable/,
    );
  });

  it("reports no eligible options for malformed provider rows", async () => {
    const { getPricingForScenarioWithDependencies } = await import("../src/engine/getPricingForScenario.js");
    const quote = await getPricingForScenarioWithDependencies(scenario(), {
      getPlatformControl: async () => control(),
      getLatestLiveVersion: async () => version(),
      getRowsForVersion: async () => [{ id: "bad", productName: null, rate: Number.NaN } as PricingRow],
    });

    assert.equal(quote.status, "no_eligible_options");
    assert.equal(quote.options.length, 0);
  });

  it("builds health response with live version and refresh metadata", async () => {
    const { buildHealthResponse } = await import("../src/api/routes/health.js");
    const response = await buildHealthResponse({
      getLatestLiveVersion: async () => version({ id: "health-version" }),
      getLastRefreshLog: async () => refreshLog({ id: "health-refresh" }),
      getSchedulerHealth: () => ({ enabled: false, running: false, nextRun: null }),
    });

    assert.equal(response.status, "ok");
    assert.equal(response.currentLivePricingVersion?.id, "health-version");
    assert.equal(response.lastRefresh?.id, "health-refresh");
  });
});
