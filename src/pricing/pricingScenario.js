import { normalizeOccupancy, toNumber } from "../scenario/scenarioUtils";

export function getBaseRate(scenario) {
  const purpose = scenario.loanPurpose || "purchase";
const program = String(scenario.loanType || "Conventional").toLowerCase();
  const occupancy = scenario.occupancy || "primary";
  const creditScore = toNumber(scenario.creditScore);

  let rate = 6.75;

  if (program === "fha") rate = 6.25;
  if (program === "va") rate = 6.125;
  if (program === "usda") rate = 6.25;
  if (program === "jumbo") rate = 6.875;
  if (program === "dscr") rate = 7.875;
  if (program === "conventional") rate = 6.75;

  if (creditScore >= 740) rate -= 0.125;
  if (creditScore > 0 && creditScore < 660) rate += 0.375;
  if (occupancy === "investment") rate += 0.5;
  if (purpose === "cash_out") rate += 0.25;

  return Number(rate.toFixed(3));
}

export function calculatePricing(scenario, manualRate = null) {
  const loanAmount = toNumber(scenario.loanAmount);
  const liveRate = manualRate ?? getBaseRate(scenario);

  if (!loanAmount) {
    return {
      rate: liveRate,
      pointsPct: 0,
      pointsDollars: 0,
      principalInterest: "",
      taxes: "",
      insurance: "",
      mortgageInsurance: "",
      total: "",
    };
  }

const program = String(scenario.loanType || "Conventional").toLowerCase();

  const monthlyRate = liveRate / 100 / 12;
  const months = 360;

  const principalInterest =
    monthlyRate === 0
      ? loanAmount / months
      : (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));

const valueBase = toNumber(scenario.purchasePrice);
      const taxes = valueBase ? (valueBase * 0.012) / 12 : 0;
  const insurance = valueBase ? (valueBase * 0.0045) / 12 : 0;

  const ltvBase = toNumber(scenario.purchasePrice);
  const ltv = ltvBase ? (loanAmount / ltvBase) * 100 : 0;

  let mortgageInsurance = 0;
  if (program === "fha") {
    mortgageInsurance = (loanAmount * 0.0055) / 12;
  } else if (program === "conventional" && ltv > 80) {
    mortgageInsurance = (loanAmount * 0.004) / 12;
  } else if (program === "usda") {
    mortgageInsurance = (loanAmount * 0.0035) / 12;
  }

  const baseRate = getBaseRate(scenario);
  const delta = liveRate - baseRate;

  let pointsPct = 0;
  if (Math.abs(delta) < 0.001) {
    pointsPct = 0;
  } else {
    pointsPct = Number((-delta * 2).toFixed(3));
  }

  const pointsDollars = loanAmount * (pointsPct / 100);
  const total = principalInterest + taxes + insurance + mortgageInsurance;

  return {
    rate: Number(liveRate.toFixed(3)),
    pointsPct: Number(pointsPct.toFixed(3)),
    pointsDollars: Math.round(pointsDollars),
    principalInterest: Math.round(principalInterest),
    taxes: Math.round(taxes),
    insurance: Math.round(insurance),
    mortgageInsurance: Math.round(mortgageInsurance),
    total: Math.round(total),
  };
}

function normalizeLoanTypePreference(value) {
  const program = String(value || "").trim().toLowerCase();
  const map = {
    conventional: "conventional",
    fha: "fha",
    va: "va",
    usda: "usda",
    jumbo: "jumbo",
    dscr: "dscr",
  };

  return map[program] || null;
}

export function buildPricingScenario(scenario) {
  const purchasePrice = toNumber(scenario.purchasePrice);
  const loanAmount = toNumber(scenario.loanAmount);
  const downPayment = toNumber(scenario.downPayment);
  const ltv = purchasePrice && loanAmount ? Number(((loanAmount / purchasePrice) * 100).toFixed(3)) : null;

  return {
    purchasePrice,
    loanAmount,
    creditScore: toNumber(scenario.creditScore),
    occupancy: normalizeOccupancy(scenario.occupancy),
    loanPurpose: scenario.loanPurpose || "purchase",
    loanTypePreference: normalizeLoanTypePreference(scenario.loanType),
    propertyType: scenario.propertyType || "single_family",
    zipCode: scenario.zipCode || "",
    downPayment: downPayment || null,
    ltv,
    language: "en",
  };
}

export function hasMinimumPricingScenario(payload) {
  return Boolean(payload.loanAmount && payload.creditScore && payload.occupancy && payload.loanPurpose && payload.zipCode);
}

export function adaptPricingOptionToPanel(option, scenario, fallbackPricing) {
  if (!option) return null;

  const loanAmount = toNumber(scenario.loanAmount);
  const rate = Number(option.rate);
  const price = Number(option.price || 0);
  const principalInterest = Math.round(Number(option.paymentPI || 0));
  const total = Math.round(Number(option.paymentPITI || option.paymentPI || 0));
  const estimatedEscrow = Math.max(total - principalInterest, 0);
  const taxes = fallbackPricing.taxes || 0;
  const insurance = fallbackPricing.insurance || 0;
  const mortgageInsurance = Math.max(estimatedEscrow - taxes - insurance, fallbackPricing.mortgageInsurance || 0);

  return {
    rate: Number.isFinite(rate) ? rate : fallbackPricing.rate,
    pointsPct: Number.isFinite(price) ? price : 0,
    pointsDollars: Math.round(loanAmount * ((Number.isFinite(price) ? price : 0) / 100)),
    principalInterest: principalInterest || fallbackPricing.principalInterest,
    taxes,
    insurance,
    mortgageInsurance: Math.round(mortgageInsurance),
    total: total || fallbackPricing.total,
    program: option.program,
    tags: Array.isArray(option.tags) ? option.tags : [],
    estimatedCashToClose: option.estimatedCashToClose,
  };
}

export const EMPTY_PRICING = {
  rate: "",
  pointsPct: 0,
  pointsDollars: 0,
  principalInterest: "",
  taxes: "",
  insurance: "",
  mortgageInsurance: "",
  total: "",
  program: "",
  tags: [],
  estimatedCashToClose: "",
};
