import type { DbClient } from "./db.js";
import type { PricingRow } from "../models/pricingRow.js";

function mapRow(row: Record<string, unknown>): PricingRow {
  return {
    id: String(row.id),
    pricingVersionId: String(row.pricing_version_id),
    lenderCode: String(row.lender_code),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    loanType: String(row.loan_type),
    termMonths: Number(row.term_months),
    amortizationType: String(row.amortization_type),
    rate: Number(row.rate),
    price: Number(row.price),
    lockDays: Number(row.lock_days),
    pointsOrCreditType: String(row.points_or_credit_type),
    channel: String(row.channel),
    rawRowJson: (row.raw_row_json as Record<string, unknown>) ?? {},
    createdAt: new Date(String(row.created_at)),
  };
}

export async function getRowsForVersion(client: DbClient, pricingVersionId: string) {
  const result = await client.query(
    `
      SELECT *
      FROM pricing_rows
      WHERE pricing_version_id = $1
      ORDER BY loan_type, term_months DESC, rate ASC, price DESC
    `,
    [pricingVersionId],
  );

  return result.rows.map(mapRow);
}
