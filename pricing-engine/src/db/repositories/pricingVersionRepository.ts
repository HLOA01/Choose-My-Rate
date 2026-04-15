import type { DbClient } from "./db.js";
import { withTransaction } from "./db.js";
import type { PricingVersion, PricingVersionStatus } from "../models/pricingVersion.js";
import type { NormalizedPricingRow, ValidationSummary } from "../../types/pricing.js";

function mapVersion(row: Record<string, unknown>): PricingVersion {
  return {
    id: String(row.id),
    lenderCode: String(row.lender_code),
    sourceUrl: String(row.source_url),
    sourceHash: String(row.source_hash),
    sourceTimestamp: row.source_timestamp ? new Date(String(row.source_timestamp)) : null,
    refreshStartedAt: new Date(String(row.refresh_started_at)),
    refreshCompletedAt: row.refresh_completed_at ? new Date(String(row.refresh_completed_at)) : null,
    effectiveDate: row.effective_date ? String(row.effective_date) : null,
    status: row.status as PricingVersionStatus,
    publishedAt: row.published_at ? new Date(String(row.published_at)) : null,
    validationSummary: (row.validation_summary as Record<string, unknown>) ?? {},
    createdAt: new Date(String(row.created_at)),
  };
}

export async function getLatestLiveVersion(client: DbClient, lenderCode = "PRMG") {
  const result = await client.query(
    `
      SELECT *
      FROM pricing_versions
      WHERE lender_code = $1 AND status = 'live'
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [lenderCode],
  );

  return result.rows[0] ? mapVersion(result.rows[0]) : null;
}

export async function getLastSuccessfulSourceHash(client: DbClient, lenderCode = "PRMG") {
  const result = await client.query(
    `
      SELECT source_hash
      FROM pricing_versions
      WHERE lender_code = $1 AND status IN ('live', 'archived')
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [lenderCode],
  );

  return result.rows[0]?.source_hash ? String(result.rows[0].source_hash) : null;
}

export async function createPricingVersion(
  client: DbClient,
  input: {
    lenderCode: string;
    sourceUrl: string;
    sourceHash: string;
    sourceTimestamp: Date | null;
    refreshStartedAt: Date;
    status: PricingVersionStatus;
  },
) {
  const result = await client.query(
    `
      INSERT INTO pricing_versions (
        lender_code,
        source_url,
        source_hash,
        source_timestamp,
        refresh_started_at,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      input.lenderCode,
      input.sourceUrl,
      input.sourceHash,
      input.sourceTimestamp,
      input.refreshStartedAt,
      input.status,
    ],
  );

  return mapVersion(result.rows[0]);
}

export async function insertPricingRows(
  client: DbClient,
  pricingVersionId: string,
  rows: NormalizedPricingRow[],
) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO pricing_rows (
          pricing_version_id,
          lender_code,
          product_code,
          product_name,
          loan_type,
          term_months,
          amortization_type,
          rate,
          price,
          lock_days,
          points_or_credit_type,
          channel,
          raw_row_json
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        pricingVersionId,
        row.lenderCode,
        row.productCode,
        row.productName,
        row.loanType,
        row.termMonths,
        row.amortizationType,
        row.rate,
        row.price,
        row.lockDays,
        row.pointsOrCreditType,
        row.channel,
        row.rawRowJson,
      ],
    );
  }
}

export async function updateVersionStatus(
  client: DbClient,
  versionId: string,
  status: PricingVersionStatus,
  validationSummary: ValidationSummary,
  effectiveDate: string | null,
) {
  const result = await client.query(
    `
      UPDATE pricing_versions
      SET
        status = $2,
        validation_summary = $3,
        effective_date = $4,
        refresh_completed_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [versionId, status, validationSummary, effectiveDate],
  );

  return mapVersion(result.rows[0]);
}

export async function publishStagingVersion(input: {
  versionId: string;
  lenderCode: string;
  validationSummary: ValidationSummary;
  effectiveDate: string | null;
}) {
  return withTransaction(async (client) => {
    // Zero-downtime publish: the new version is fully built and validated before
    // this transaction changes which version is visible to quote reads.
    await client.query(
      `
        UPDATE pricing_versions
        SET status = 'archived'
        WHERE lender_code = $1 AND status = 'live'
      `,
      [input.lenderCode],
    );

    const result = await client.query(
      `
        UPDATE pricing_versions
        SET
          status = 'live',
          published_at = now(),
          refresh_completed_at = now(),
          validation_summary = $3,
          effective_date = $4
        WHERE id = $1 AND lender_code = $2 AND status = 'staging'
        RETURNING *
      `,
      [input.versionId, input.lenderCode, input.validationSummary, input.effectiveDate],
    );

    if (!result.rows[0]) {
      throw new Error("Staging version was not publishable.");
    }

    return mapVersion(result.rows[0]);
  });
}

export async function countRowsForVersion(client: DbClient, pricingVersionId: string) {
  const result = await client.query(
    "SELECT count(*)::int AS count FROM pricing_rows WHERE pricing_version_id = $1",
    [pricingVersionId],
  );

  return Number(result.rows[0]?.count ?? 0);
}
