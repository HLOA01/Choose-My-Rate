import type { PricingRow } from "../db/models/pricingRow.js";

const LOAN_TYPE_LABELS: Record<string, string> = {
  conventional: "Conventional",
  fha: "FHA",
  va: "VA",
  usda: "USDA",
  jumbo: "Jumbo",
  dscr: "DSCR",
};

function loanTypeLabel(row: PricingRow) {
  return LOAN_TYPE_LABELS[row.loanType] || "Mortgage";
}

function hasSignal(value: string, pattern: RegExp) {
  return pattern.test(value.toLowerCase());
}

function inferArmLabel(rawName: string) {
  const armMatch = rawName.match(/\b(\d{1,2})\s*\/\s*(6|1)\b/i);
  if (!armMatch) return "";

  const index = armMatch[1];
  const adjustment = armMatch[2];
  const indexName = hasSignal(rawName, /\bsofr\b/) ? " SOFR" : "";
  return `${index}/${adjustment}${indexName} ARM`;
}

function inferTermLabel(row: PricingRow) {
  const years = row.termMonths > 0 ? Math.round(row.termMonths / 12) : 30;
  return `${years} Year`;
}

function inferFeatureLabel(rawName: string) {
  const features: string[] = [];

  if (hasSignal(rawName, /\bhigh\s*balance\b/)) features.push("High Balance");
  if (hasSignal(rawName, /\blow[\s-]*balance\b/)) features.push("Low Balance");
  if (hasSignal(rawName, /\binterest[\s-]*only\b|\bio\b/)) features.push("Interest Only");

  return features.join(" ");
}

export function getBorrowerProgramName(row: PricingRow) {
  const rawName = String(row.productName || "");
  const label = loanTypeLabel(row);
  const feature = inferFeatureLabel(rawName);
  const armLabel = inferArmLabel(rawName);

  if (armLabel) {
    return [label, feature, armLabel].filter(Boolean).join(" ");
  }

  const amortization = row.amortizationType.toLowerCase().includes("arm") ? "ARM" : "Fixed";
  return [label, feature, inferTermLabel(row), amortization].filter(Boolean).join(" ");
}
