import type { ParsedWorkbookRow } from "./parsePrmgWorkbook.js";
import type { LoanType, NormalizedPricingRow } from "../../types/pricing.js";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/[$,%]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pick(object: Record<string, unknown>, candidates: string[]) {
  for (const candidate of candidates) {
    if (object[candidate] !== undefined && object[candidate] !== null && text(object[candidate])) {
      return object[candidate];
    }
  }
  return null;
}

function inferLoanType(productName: string): LoanType {
  const lower = productName.toLowerCase();
  if (lower.includes("fha")) return "fha";
  if (lower.includes(" va ") || lower.startsWith("va ") || lower.includes("v.a.")) return "va";
  if (lower.includes("usda")) return "usda";
  if (lower.includes("jumbo")) return "jumbo";
  if (lower.includes("dscr")) return "dscr";
  if (lower.includes("conventional") || lower.includes("conv") || lower.includes("fnma") || lower.includes("fhlmc")) {
    return "conventional";
  }
  return "unknown";
}

function inferTermMonths(productName: string, explicitTerm: unknown) {
  const explicit = numeric(explicitTerm);
  if (explicit && explicit > 0) return explicit > 100 ? Math.round(explicit) : Math.round(explicit * 12);

  const lower = productName.toLowerCase();
  const yearMatch = lower.match(/\b(10|15|20|25|30)\s*(yr|year|fixed)?\b/);
  if (yearMatch?.[1]) return Number(yearMatch[1]) * 12;
  return 360;
}

function inferProductCode(productName: string, index: number) {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `prmg-row-${index + 1}`;
}

export function normalizePrmgData(rows: ParsedWorkbookRow[]): NormalizedPricingRow[] {
  const normalized: NormalizedPricingRow[] = [];

  rows.forEach((row, index) => {
    const object = row.object;

    // PRMG's published XLS is static by URL but dynamic by file contents. The
    // workbook can contain section headers and marketing rows, so v1 accepts
    // several common header variants and only emits rows with numeric rate/price.
    const productName = text(
      pick(object, ["product", "program", "product_name", "program_name", "description"]),
    );
    const rate = numeric(pick(object, ["rate", "note_rate", "interest_rate"]));
    const price = numeric(pick(object, ["price", "pricing", "points", "rebate"]));
    const lockDays = numeric(pick(object, ["lock", "lock_days", "lock_period"])) ?? 30;

    if (!productName || rate === null || price === null) return;

    // PRMG matrix sheets commonly store note rates as decimals (0.07125).
    // The pricing engine API uses percent notation (7.125) for consistency.
    const normalizedRate = round(rate > 0 && rate <= 1 ? rate * 100 : rate);
    if (normalizedRate < 1 || normalizedRate > 20) return;

    const termMonths = inferTermMonths(productName, pick(object, ["term", "term_months"]));
    const loanType = inferLoanType(productName);

    normalized.push({
      lenderCode: "PRMG",
      productCode: inferProductCode(productName, index),
      productName,
      loanType,
      termMonths,
      amortizationType: productName.toLowerCase().includes("arm") ? "ARM" : "Fixed",
      rate: normalizedRate,
      price,
      lockDays: Math.round(lockDays),
      pointsOrCreditType: price >= 0 ? "points" : "credit",
      channel: "wholesale",
      rawRowJson: {
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        ...object,
      },
    });
  });

  return normalized;
}
