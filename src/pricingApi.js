const PRICING_ENGINE_API_URL = import.meta.env.VITE_PRICING_ENGINE_API_URL || "";

function getPricingApiBaseUrl() {
  return PRICING_ENGINE_API_URL.replace(/\/$/, "");
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function calculatePrincipalInterest(loanAmount, annualRate, termMonths = 360) {
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return loanAmount / termMonths;
  return (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
}

function programName(loanTypePreference) {
  const program = String(loanTypePreference || "conventional").toLowerCase();
  const labels = {
    conventional: "Conventional 30 Year Fixed",
    fha: "FHA 30 Year Fixed",
    va: "VA 30 Year Fixed",
    usda: "USDA 30 Year Fixed",
    jumbo: "Jumbo 30 Year Fixed",
    dscr: "DSCR 30 Year Fixed",
  };

  return labels[program] || "Conventional 30 Year Fixed";
}

function baseMockRate(scenario) {
  const program = String(scenario.loanTypePreference || "conventional").toLowerCase();
  const creditScore = Number(scenario.creditScore || 0);
  const occupancy = String(scenario.occupancy || "primary");
  const purpose = String(scenario.loanPurpose || "purchase");

  let rate = 6.75;
  if (program === "fha") rate = 6.375;
  if (program === "va") rate = 6.25;
  if (program === "usda") rate = 6.375;
  if (program === "jumbo") rate = 6.875;
  if (program === "dscr") rate = 7.75;

  if (creditScore >= 760) rate -= 0.25;
  else if (creditScore >= 720) rate -= 0.125;
  else if (creditScore > 0 && creditScore < 680) rate += 0.25;

  if (occupancy === "investment") rate += 0.375;
  if (purpose === "cash_out") rate += 0.25;

  return Number(rate.toFixed(3));
}

function buildMockOption(scenario, rate, price, index) {
  const loanAmount = Number(scenario.loanAmount || 0);
  const purchasePrice = Number(scenario.purchasePrice || 0);
  const paymentPI = calculatePrincipalInterest(loanAmount, rate);
  const taxes = purchasePrice ? (purchasePrice * 0.012) / 12 : 0;
  const insurance = purchasePrice ? (purchasePrice * 0.0045) / 12 : 0;
  const downPayment = Number(scenario.downPayment || 0);
  const pricingCost = loanAmount * (price / 100);

  return {
    optionId: `mock-30-day-${index}-${rate.toFixed(3)}-${price.toFixed(3)}`,
    program: programName(scenario.loanTypePreference),
    rate,
    price,
    paymentPI: roundMoney(paymentPI),
    paymentPITI: roundMoney(paymentPI + taxes + insurance),
    estimatedCashToClose: roundMoney(Math.max(0, downPayment + pricingCost)),
    tags: [
      ...(Math.abs(price) <= 0.125 ? ["Near Par"] : []),
      ...(price < -0.5 ? ["Higher Credit"] : []),
      ...(index === 0 ? ["Lowest Rate"] : []),
    ],
    displayLender: false,
  };
}

export function quoteMockPricing(scenario) {
  // Temporary development fallback. Replace this with PRMG XLS-backed pricing
  // after the separate pricing engine service is connected through
  // VITE_PRICING_ENGINE_API_URL.
  const baseRate = baseMockRate(scenario);
  const stack = [
    { rateOffset: -0.375, price: 1.125 },
    { rateOffset: -0.25, price: 0.75 },
    { rateOffset: -0.125, price: 0.375 },
    { rateOffset: 0, price: 0 },
    { rateOffset: 0.125, price: -0.375 },
    { rateOffset: 0.25, price: -0.75 },
    { rateOffset: 0.375, price: -1.0 },
  ];

  return {
    status: "mock",
    banner: "Sample rate options are shown because VITE_PRICING_ENGINE_API_URL is not configured. Do not use this as final borrower rate information.",
    pricingAsOf: new Date().toISOString(),
    message: "Sample rate options loaded for local development.",
    options: stack.map((item, index) =>
      buildMockOption(scenario, Number((baseRate + item.rateOffset).toFixed(3)), item.price, index),
    ),
    leadCaptureEnabled: true,
    callbackEnabled: true,
  };
}

export function hasPricingApi() {
  return Boolean(getPricingApiBaseUrl());
}

export async function quotePricing(scenario, options = {}) {
  const baseUrl = getPricingApiBaseUrl();

  if (!baseUrl) {
    throw new Error("Pricing engine API URL is not configured.");
  }

  const response = await fetch(`${baseUrl}/pricing/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(scenario),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pricing engine request failed: ${response.status} ${body}`);
  }

  return response.json();
}
