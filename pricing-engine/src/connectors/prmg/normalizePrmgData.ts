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

/** Required metadata is never inferred from magnitude or a default. Units must be explicit.
 * Bounds reflect the existing PostgreSQL integer columns, not lender eligibility policy. */
function positiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 && result <= 2147483647 ? result : null;
}

function requiredLock(object: Record<string, unknown>): number | null {
  const values = ['lock', 'lock_days', 'lock_period'].filter(key => object[key] !== undefined && object[key] !== null && text(object[key]) !== '').map(key => positiveInteger(object[key]));
  return values.length && values.every(value => value !== null && value === values[0]) ? values[0]! : null;
}

function requiredTerm(productName: string, object: Record<string, unknown>): number | null {
  const terms: Array<number | null> = [];
  for (const key of ['term_months', 'term_years', 'term']) {
    if (object[key] === undefined || object[key] === null || text(object[key]) === '') continue;
    if (key === 'term_months') terms.push(positiveInteger(object[key]));
    else if (key === 'term_years') {
      const years = positiveInteger(object[key]);
      terms.push(years !== null && Number.isSafeInteger(years * 12) && years * 12 <= 2147483647 ? years * 12 : null);
    } else {
      const match = text(object[key]).match(/^(\d+)\s*(months?|mos?|years?|yrs?)$/i);
      const count = match ? positiveInteger(match[1]) : null;
      const months = count === null ? null : count * (/^(year|yr)/i.test(match![2]!) ? 12 : 1);
      terms.push(months !== null && Number.isSafeInteger(months) && months <= 2147483647 ? months : null);
    }
  }
  // Examine EVERY term-bearing fragment, including malformed quantities. Searching
  // only for valid numbers lets "30.5 years 30 Yr" silently discard the first term.
  for (const match of productName.matchAll(/(?:(\S+)\s*)?(years?|yrs?)\b/gi)) {
    const quantity = (match[1] ?? '').replace(/^[([{]+/, '').replace(/-$/, '');
    const years = positiveInteger(quantity);
    terms.push(years !== null && Number.isSafeInteger(years * 12) && years * 12 <= 2147483647 ? years * 12 : null);
  }
  return terms.length && terms.every(value => value !== null && value === terms[0]) ? terms[0]! : null;
}

export interface PrmgMetadataRejection {
  sheetName: string;
  rowNumber: number;
  reason: 'LOCK_METADATA_MISSING_OR_INVALID' | 'TERM_METADATA_MISSING_OR_INVALID';
}

function inferProductCode(productName: string, index: number) {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `prmg-row-${index + 1}`;
}

export function normalizePrmgData(rows: ParsedWorkbookRow[], rejections: PrmgMetadataRejection[] = []): NormalizedPricingRow[] {
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
    const lockDays = requiredLock(object);

    if (!productName || rate === null || price === null) return;

    // PRMG matrix sheets commonly store note rates as decimals (0.07125).
    // The pricing engine API uses percent notation (7.125) for consistency.
    const normalizedRate = round(rate > 0 && rate <= 1 ? rate * 100 : rate);
    if (normalizedRate < 1 || normalizedRate > 20) return;

    const termMonths = requiredTerm(productName, object);
    if (lockDays === null) rejections.push({ sheetName: row.sheetName, rowNumber: row.rowNumber, reason: 'LOCK_METADATA_MISSING_OR_INVALID' });
    if (termMonths === null) rejections.push({ sheetName: row.sheetName, rowNumber: row.rowNumber, reason: 'TERM_METADATA_MISSING_OR_INVALID' });
    if (lockDays === null || termMonths === null) return;
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
      lockDays,
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
