import type { PricingRow } from "../db/models/pricingRow.js";
import type { PricingScenario } from "../types/scenario.js";

const DEFAULT_TERM_MONTHS = 360;

function hasSignal(value: string, pattern: RegExp) {
  return pattern.test(value.toLowerCase());
}

function normalizeProductName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/sun dec 31 1899[^a-z0-9]+eastern standard time\)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPricingRow(row: PricingRow) {
  return (
    row &&
    typeof row.id === "string" &&
    typeof row.productName === "string" &&
    typeof row.loanType === "string" &&
    typeof row.amortizationType === "string" &&
    Number.isFinite(row.rate) &&
    Number.isFinite(row.price) &&
    Number.isFinite(row.termMonths) &&
    Number.isFinite(row.lockDays)
  );
}

function isFixedThirtyYear(row: PricingRow) {
  const name = normalizeProductName(row.productName);

  return (
    row.lockDays === 30 &&
    row.termMonths === DEFAULT_TERM_MONTHS &&
    row.amortizationType.toLowerCase().includes("fixed") &&
    !hasSignal(name, /\barm\b|\bsofr\b|\bio\b|interest[\s-]*only/)
  );
}

function purposeScore(row: PricingRow, scenario: PricingScenario) {
  const name = normalizeProductName(row.productName);
  let score = 0;

  if (scenario.loanPurpose === "purchase") {
    if (hasSignal(name, /\brefi\b|refinance|cash[\s-]*out|home\s*equity|\birrrl\b|streamline/)) score -= 80;
    else score += 10;
  }

  if (scenario.loanPurpose === "refinance") {
    if (hasSignal(name, /cash[\s-]*out|home\s*equity|\birrrl\b/)) score -= 45;
    if (hasSignal(name, /\brefi\b|refinance/)) score += 8;
  }

  if (scenario.loanPurpose === "cash_out") {
    if (hasSignal(name, /cash[\s-]*out|home\s*equity|texas\s*home\s*equity|\bthe\b/)) score += 20;
    if (hasSignal(name, /\birrrl\b|streamline/)) score -= 60;
  }

  return score;
}

function productScore(row: PricingRow, scenario: PricingScenario) {
  const name = normalizeProductName(row.productName);
  let score = purposeScore(row, scenario);

  if (row.loanType === scenario.loanTypePreference) score += 60;
  if (isFixedThirtyYear(row)) score += 40;

  if (scenario.loanTypePreference === "conventional") {
    if (hasSignal(name, /\bfnma\b|fannie\s*mae/)) score += 16;
    if (hasSignal(name, /\bfhlmc\b|freddie\s*mac/)) score += 12;
    if (hasSignal(name, /\b30\/25\s*yr\s*fixed\b|\b30\s*yr\s*fixed\b/)) score += 15;
    if (hasSignal(name, /high\s*balance/) && scenario.loanAmount < 766550) score -= 30;
    if (hasSignal(name, /spec|low[\s-]*bal|homeready|home\s*possible|refi\s*possible/)) score -= 20;
  }

  if (scenario.loanTypePreference === "fha" && hasSignal(name, /\bfha\b.*\b30/)) score += 18;
  if (scenario.loanTypePreference === "va" && hasSignal(name, /\bva\b.*\b30/)) score += 18;
  if (scenario.loanTypePreference === "usda" && hasSignal(name, /\busda\b.*\b30/)) score += 18;
  if (scenario.loanTypePreference === "jumbo" && hasSignal(name, /\bjumbo\b.*\b30/)) score += 18;
  if (scenario.loanTypePreference === "dscr" && hasSignal(name, /\bdscr\b.*\b30/)) score += 18;

  return score;
}

function familyKey(row: PricingRow) {
  const name = normalizeProductName(row.productName);
  return [row.loanType, row.termMonths, row.amortizationType.toLowerCase(), name].join("|");
}

function pickBestProductFamily(rows: PricingRow[], scenario: PricingScenario) {
  const families = new Map<string, { rows: PricingRow[]; score: number }>();

  for (const row of rows) {
    const key = familyKey(row);
    const current = families.get(key);
    const score = productScore(row, scenario);

    if (!current) {
      families.set(key, { rows: [row], score });
      continue;
    }

    current.rows.push(row);
    current.score = Math.max(current.score, score);
  }

  return [...families.values()].sort((a, b) => b.score - a.score || b.rows.length - a.rows.length)[0]?.rows ?? rows;
}

function dedupeBestExecutionByRate(rows: PricingRow[]) {
  const byRate = new Map<number, PricingRow>();

  for (const row of rows) {
    const rateKey = Number(row.rate.toFixed(3));
    const current = byRate.get(rateKey);

    if (!current || row.price < current.price || (row.price === current.price && row.id < current.id)) {
      byRate.set(rateKey, row);
    }
  }

  return [...byRate.values()].sort((a, b) => a.rate - b.rate || a.price - b.price || a.id.localeCompare(b.id));
}

export function selectBorrowerRateStackRows(rows: PricingRow[], scenario: PricingScenario) {
  const validRows = rows.filter(isValidPricingRow);
  const strictRows = validRows.filter((row) => {
    if (scenario.loanTypePreference && row.loanType !== scenario.loanTypePreference) return false;
    return isFixedThirtyYear(row);
  });

  const productRows = pickBestProductFamily(strictRows.length ? strictRows : validRows, scenario);
  return dedupeBestExecutionByRate(productRows);
}
