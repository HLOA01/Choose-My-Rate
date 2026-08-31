export function FormatCurrency(value) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function FormatPercent(value, digits = 3) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(digits)}%`;
}

export function FormatPointsCreditLabel(value) {
  const numeric = Number(value || 0);

  if (numeric < 0) return `${FormatPercent(Math.abs(numeric))} Credit`;
  if (numeric > 0) return `${FormatPercent(numeric)} Cost`;
  return "No Points";
}

export function FormatCostCreditDollars(pointsPct, pointsDollars) {
  const pct = Number(pointsPct || 0);
  const dollars = Math.abs(Number(pointsDollars || 0));

  if (pct > 0) return `Cost: ${FormatCurrency(dollars)}`;
  if (pct < 0) return `Credit: ${FormatCurrency(dollars)}`;
  return "No Cost (Par)";
}
