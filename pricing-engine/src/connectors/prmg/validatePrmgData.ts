import type { NormalizedPricingRow, ValidationSummary } from "../../types/pricing.js";

export function validatePrmgData(input: {
  sheetNames: string[];
  rows: NormalizedPricingRow[];
  priorLiveRowCount: number | null;
  effectiveDate: string | null;
}): ValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.sheetNames.length) {
    errors.push("Workbook has no worksheets.");
  }

  if (!input.rows.length) {
    errors.push("No normalized pricing rows were found.");
  }

  const requiredCoreTypes = ["conventional", "fha"];
  for (const loanType of requiredCoreTypes) {
    if (!input.rows.some((row) => row.loanType === loanType)) {
      warnings.push(`No ${loanType} pricing rows found.`);
    }
  }

  for (const row of input.rows) {
    if (!row.productName) errors.push("Critical blank product_name detected.");
    if (!Number.isFinite(row.rate)) errors.push(`Invalid rate for ${row.productCode}.`);
    if (!Number.isFinite(row.price)) errors.push(`Invalid price for ${row.productCode}.`);
    if (!Number.isFinite(row.termMonths) || row.termMonths <= 0) {
      errors.push(`Invalid term for ${row.productCode}.`);
    }
  }

  if (input.priorLiveRowCount && input.priorLiveRowCount > 0) {
    const lowerBound = Math.max(5, Math.floor(input.priorLiveRowCount * 0.5));
    const upperBound = Math.ceil(input.priorLiveRowCount * 1.75);
    if (input.rows.length < lowerBound || input.rows.length > upperBound) {
      errors.push(
        `Row count ${input.rows.length} is outside expected threshold from prior live count ${input.priorLiveRowCount}.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: input.rows.length,
    priorLiveRowCount: input.priorLiveRowCount,
    effectiveDate: input.effectiveDate,
  };
}
