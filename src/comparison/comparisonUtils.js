function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeLoanType(value) {
  const loanType = String(value || "").trim().toLowerCase();
  if (!loanType) return "";
  if (loanType === "fha") return "FHA";
  if (loanType === "va") return "VA";
  if (loanType === "usda") return "USDA";
  if (loanType === "jumbo") return "Jumbo";
  if (loanType === "dscr") return "DSCR";
  if (loanType.includes("conv")) return "Conventional";
  return value;
}

function normalizeLoanPurpose(value) {
  const purpose = String(value || "").trim().toLowerCase();
  if (!purpose) return "";
  if (purpose === "cashout" || purpose === "cash-out" || purpose === "cash_out") return "cash_out";
  if (purpose.includes("refi")) return "refinance";
  if (purpose.includes("cash")) return "cash_out";
  if (purpose.includes("buy") || purpose.includes("purchase")) return "purchase";
  return purpose;
}

function normalizeOccupancy(value) {
  const occupancy = String(value || "").trim().toLowerCase();
  if (!occupancy) return "";
  if (occupancy === "second" || occupancy === "second_home") return "second_home";
  if (occupancy === "investment") return "investment";
  return "primary";
}

function cleanNumericString(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/[^\d.]/g, "");
}

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function roundRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(3));
}

function getSideMetric(side, keys) {
  const source = side && typeof side === "object" ? side : {};
  const pricing = source.pricing && typeof source.pricing === "object" ? source.pricing : {};
  const selectedOption =
    source.selectedOption && typeof source.selectedOption === "object" ? source.selectedOption : {};

  for (const key of keys) {
    if (pricing[key] !== undefined && pricing[key] !== null && pricing[key] !== "") return pricing[key];
    if (selectedOption[key] !== undefined && selectedOption[key] !== null && selectedOption[key] !== "") {
      return selectedOption[key];
    }
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }

  return null;
}

function calculateDelta(leftValue, rightValue, rounder = roundMoney) {
  const left = Number(leftValue);
  const right = Number(rightValue);

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return {
      left: rounder(leftValue),
      right: rounder(rightValue),
      difference: null,
    };
  }

  return {
    left: rounder(left),
    right: rounder(right),
    difference: rounder(right - left),
  };
}

export function buildScenarioVariant(baseScenario, scenarioUpdates = {}) {
  const base = baseScenario && typeof baseScenario === "object" ? baseScenario : {};
  const updates = scenarioUpdates && typeof scenarioUpdates === "object" ? scenarioUpdates : {};
  const next = {
    ...base,
    ...updates,
  };

  if (updates.loanType !== undefined || updates.loanTypePreference !== undefined || updates.program !== undefined) {
    next.loanType = normalizeLoanType(updates.loanType ?? updates.loanTypePreference ?? updates.program);
  }

  if (updates.loanPurpose !== undefined || updates.purpose !== undefined) {
    next.loanPurpose = normalizeLoanPurpose(updates.loanPurpose ?? updates.purpose);
  }

  if (updates.occupancy !== undefined || updates.propertyUse !== undefined) {
    next.occupancy = normalizeOccupancy(updates.occupancy ?? updates.propertyUse);
  }

  for (const field of ["purchasePrice", "downPayment", "downPaymentPercent", "loanAmount", "creditScore", "zipCode"]) {
    if (updates[field] !== undefined) {
      next[field] = cleanNumericString(updates[field]);
    }
  }

  const purchasePrice = toNumber(next.purchasePrice);
  const downPaymentPercent = toNumber(next.downPaymentPercent);
  const downPayment = toNumber(next.downPayment);
  const loanAmount = toNumber(next.loanAmount);

  if (purchasePrice && downPaymentPercent && updates.downPaymentPercent !== undefined) {
    next.downPayment = String(Math.round((purchasePrice * downPaymentPercent) / 100));
    next.loanAmount = String(Math.max(purchasePrice - toNumber(next.downPayment), 0));
  } else if (purchasePrice && downPayment && (updates.downPayment !== undefined || !loanAmount)) {
    next.loanAmount = String(Math.max(purchasePrice - downPayment, 0));
  } else if (purchasePrice && loanAmount && updates.loanAmount !== undefined) {
    next.downPayment = String(Math.max(purchasePrice - loanAmount, 0));
  }

  if (next.loanPurpose && next.loanPurpose !== "purchase") {
    next.downPayment = "";
    next.downPaymentPercent = "";
  }

  return next;
}

export function calculateComparisonDeltas(leftSide, rightSide) {
  const leftPayment = getSideMetric(leftSide, ["total", "paymentPITI", "monthlyPayment"]);
  const rightPayment = getSideMetric(rightSide, ["total", "paymentPITI", "monthlyPayment"]);
  const leftCashToClose = getSideMetric(leftSide, ["estimatedCashToClose", "cashToClose"]);
  const rightCashToClose = getSideMetric(rightSide, ["estimatedCashToClose", "cashToClose"]);
  const leftMortgageInsurance = getSideMetric(leftSide, ["mortgageInsurance"]);
  const rightMortgageInsurance = getSideMetric(rightSide, ["mortgageInsurance"]);
  const leftRate = getSideMetric(leftSide, ["rate"]);
  const rightRate = getSideMetric(rightSide, ["rate"]);
  const leftPoints = getSideMetric(leftSide, ["pointsPct", "price"]);
  const rightPoints = getSideMetric(rightSide, ["pointsPct", "price"]);

  return {
    monthlyPayment: calculateDelta(leftPayment, rightPayment, roundMoney),
    cashToClose: calculateDelta(leftCashToClose, rightCashToClose, roundMoney),
    mortgageInsurance: calculateDelta(leftMortgageInsurance, rightMortgageInsurance, roundMoney),
    rate: calculateDelta(leftRate, rightRate, roundRate),
    points: calculateDelta(leftPoints, rightPoints, roundRate),
  };
}

export function formatComparisonSummary(comparison) {
  const source = comparison && typeof comparison === "object" ? comparison : {};
  const leftLabel = source.left?.label || "Left option";
  const rightLabel = source.right?.label || "Right option";
  const deltas = source.summary?.deltas || source.deltas || calculateComparisonDeltas(source.left, source.right);
  const parts = [];

  if (deltas.monthlyPayment?.difference !== null) {
    const amount = Math.abs(deltas.monthlyPayment.difference);
    const direction = deltas.monthlyPayment.difference > 0 ? "higher" : "lower";
    parts.push(`${rightLabel} is about $${amount.toLocaleString("en-US")} ${direction} per month than ${leftLabel}`);
  }

  if (deltas.cashToClose?.difference !== null) {
    const amount = Math.abs(deltas.cashToClose.difference);
    const direction = deltas.cashToClose.difference > 0 ? "more" : "less";
    parts.push(`${rightLabel} needs about $${amount.toLocaleString("en-US")} ${direction} cash to close`);
  }

  if (deltas.mortgageInsurance?.difference !== null) {
    const amount = Math.abs(deltas.mortgageInsurance.difference);
    const direction = deltas.mortgageInsurance.difference > 0 ? "higher" : "lower";
    parts.push(`${rightLabel} has about $${amount.toLocaleString("en-US")} ${direction} monthly mortgage insurance`);
  }

  if (deltas.rate?.difference !== null) {
    const direction = deltas.rate.difference > 0 ? "higher" : "lower";
    parts.push(`${rightLabel} has a ${Math.abs(deltas.rate.difference).toFixed(3)}% ${direction} rate`);
  }

  if (!parts.length) {
    return `Compare ${leftLabel} and ${rightLabel} side by side once rate options are available.`;
  }

  return `${parts.join(". ")}.`;
}
