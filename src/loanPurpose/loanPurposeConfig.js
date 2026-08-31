export const LOAN_PURPOSES = {
  PURCHASE: "purchase",
  RATE_TERM_REFINANCE: "rate_term_refinance",
  CASH_OUT_REFINANCE: "cash_out_refinance",
};

const COMMON_REFINANCE_FIELDS = [
  "estimatedPropertyValue",
  "currentLoanBalance",
  "currentMonthlyPayment",
  "creditScore",
  "occupancy",
  "zipCode",
  "propertyType",
];

export const LOAN_PURPOSE_CONFIG = {
  [LOAN_PURPOSES.PURCHASE]: {
    value: LOAN_PURPOSES.PURCHASE,
    label: "Purchase",
    requiredFields: [
      "purchasePrice",
      "downPayment",
      "creditScore",
      "occupancy",
      "zipCode",
    ],
    derivedFields: ["downPaymentPercent", "loanAmount", "ltv"],
    pricingMapper: "buildPurchasePricingScenario",
    comparisonTypes: [
      "fha_vs_conventional",
      "down_payment_3_vs_5",
      "rate_option_vs_rate_option",
      "monthly_payment_vs_cash_to_close",
    ],
    questionFlow: [
      "loanPurpose",
      "purchasePrice",
      "downPayment",
      "creditScore",
      "occupancy",
      "zipCode",
      "propertyType",
    ],
    fieldLabels: {
      loanPurpose: "Loan purpose",
      purchasePrice: "Purchase price",
      downPayment: "Down payment",
      downPaymentPercent: "Down payment percent",
      loanAmount: "Loan amount",
      creditScore: "Credit score",
      occupancy: "Occupancy",
      zipCode: "ZIP code",
      propertyTaxes: "Property taxes monthly",
      homeownersInsurance: "Homeowners insurance monthly",
      hoaDues: "HOA monthly",
      propertyType: "Property type",
      ltv: "Loan-to-value",
    },
  },
  [LOAN_PURPOSES.RATE_TERM_REFINANCE]: {
    value: LOAN_PURPOSES.RATE_TERM_REFINANCE,
    label: "Rate-and-term refinance",
    requiredFields: [
      "estimatedPropertyValue",
      "currentLoanBalance",
      "currentInterestRate",
      "currentMonthlyPayment",
      "creditScore",
      "occupancy",
      "zipCode",
      "refinanceGoal",
    ],
    derivedFields: ["estimatedNewLoanAmount", "ltv", "monthlySavings", "breakEvenMonths"],
    pricingMapper: "buildRateTermRefinancePricingScenario",
    comparisonTypes: [
      "current_loan_vs_new_loan",
      "payment_savings",
      "break_even",
      "cost_vs_monthly_savings",
      "term_comparison",
      "remove_mi_analysis",
    ],
    questionFlow: [
      "loanPurpose",
      "estimatedPropertyValue",
      "currentLoanBalance",
      "currentInterestRate",
      "currentMonthlyPayment",
      "creditScore",
      "occupancy",
      "zipCode",
      "refinanceGoal",
      "propertyType",
    ],
    fieldLabels: {
      loanPurpose: "Loan purpose",
      estimatedPropertyValue: "Estimated property value",
      currentLoanBalance: "Current loan balance",
      currentInterestRate: "Current interest rate",
      currentMonthlyPayment: "Current monthly payment",
      estimatedNewLoanAmount: "Estimated new loan amount",
      creditScore: "Credit score",
      occupancy: "Occupancy",
      zipCode: "ZIP code",
      propertyType: "Property type",
      refinanceGoal: "Refinance goal",
      refinancePurpose: "Refinance purpose",
      cashOutPurpose: "Cash-out purpose",
      debtConsolidationAmount: "Debt consolidation amount",
      debtConsolidationMonthlyPayments: "Current monthly debt payments",
      propertyValue: "Property value",
      currentLoanTermYears: "Current loan term years",
      currentRemainingTermYears: "Current remaining term years",
      newLoanAmount: "New loan amount",
      newInterestRate: "New interest rate",
      newLoanTermYears: "New loan term years",
      estimatedClosingCosts: "Estimated closing costs",
      requestedCashOut: "Requested cash out",
      ltv: "Loan-to-value",
      monthlySavings: "Monthly savings",
      breakEvenMonths: "Break-even point",
    },
  },
  [LOAN_PURPOSES.CASH_OUT_REFINANCE]: {
    value: LOAN_PURPOSES.CASH_OUT_REFINANCE,
    label: "Cash-out refinance",
    requiredFields: [
      ...COMMON_REFINANCE_FIELDS,
      "desiredCashOut",
      "cashOutGoal",
    ],
    derivedFields: ["newLoanAmount", "ltv", "cashReceived", "costOfCash", "paymentChange"],
    pricingMapper: "buildCashOutRefinancePricingScenario",
    comparisonTypes: [
      "current_loan_vs_cash_out_loan",
      "cash_received_vs_new_payment",
      "ltv_after_cash_out",
      "cost_of_cash",
      "payment_change",
      "cash_out_amount_options",
    ],
    questionFlow: [
      "loanPurpose",
      "estimatedPropertyValue",
      "currentLoanBalance",
      "desiredCashOut",
      "currentMonthlyPayment",
      "creditScore",
      "occupancy",
      "zipCode",
      "cashOutGoal",
      "propertyType",
    ],
    fieldLabels: {
      loanPurpose: "Loan purpose",
      estimatedPropertyValue: "Estimated property value",
      currentLoanBalance: "Current loan balance",
      desiredCashOut: "Desired cash out",
      newLoanAmount: "New loan amount",
      currentMonthlyPayment: "Current monthly payment",
      creditScore: "Credit score",
      occupancy: "Occupancy",
      zipCode: "ZIP code",
      propertyType: "Property type",
      cashOutGoal: "Cash-out goal",
      refinancePurpose: "Refinance purpose",
      cashOutPurpose: "Cash-out purpose",
      debtConsolidationAmount: "Debt consolidation amount",
      debtConsolidationMonthlyPayments: "Current monthly debt payments",
      propertyValue: "Property value",
      currentInterestRate: "Current interest rate",
      currentLoanTermYears: "Current loan term years",
      currentRemainingTermYears: "Current remaining term years",
      newInterestRate: "New interest rate",
      newLoanTermYears: "New loan term years",
      estimatedClosingCosts: "Estimated closing costs",
      requestedCashOut: "Requested cash out",
      ltv: "Loan-to-value",
      cashReceived: "Cash received",
      costOfCash: "Cost of cash",
      paymentChange: "Payment change",
    },
  },
};

const LOAN_PURPOSE_ALIASES = {
  buy: LOAN_PURPOSES.PURCHASE,
  buying: LOAN_PURPOSES.PURCHASE,
  purchase: LOAN_PURPOSES.PURCHASE,
  purchasing: LOAN_PURPOSES.PURCHASE,
  "rate and term": LOAN_PURPOSES.RATE_TERM_REFINANCE,
  "rate term": LOAN_PURPOSES.RATE_TERM_REFINANCE,
  "rate-and-term": LOAN_PURPOSES.RATE_TERM_REFINANCE,
  "rate-term": LOAN_PURPOSES.RATE_TERM_REFINANCE,
  rate_term_refinance: LOAN_PURPOSES.RATE_TERM_REFINANCE,
  refinance: LOAN_PURPOSES.RATE_TERM_REFINANCE,
  refi: LOAN_PURPOSES.RATE_TERM_REFINANCE,
  "cash out": LOAN_PURPOSES.CASH_OUT_REFINANCE,
  "cash-out": LOAN_PURPOSES.CASH_OUT_REFINANCE,
  cashout: LOAN_PURPOSES.CASH_OUT_REFINANCE,
  cash_out: LOAN_PURPOSES.CASH_OUT_REFINANCE,
  cash_out_refinance: LOAN_PURPOSES.CASH_OUT_REFINANCE,
};

function copyArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function normalizeLoanPurpose(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, " ");
  if (!normalized) return LOAN_PURPOSES.PURCHASE;

  if (
    (normalized.includes("cash") && normalized.includes("out")) ||
    normalized.includes("take equity") ||
    normalized.includes("pull equity") ||
    normalized.includes("equity out")
  ) {
    return LOAN_PURPOSES.CASH_OUT_REFINANCE;
  }

  if (normalized.includes("rate") && normalized.includes("term")) {
    return LOAN_PURPOSES.RATE_TERM_REFINANCE;
  }

  if (normalized.includes("refi")) {
    return LOAN_PURPOSES.RATE_TERM_REFINANCE;
  }

  if (
    normalized.includes("lower my payment") ||
    normalized.includes("lower payment") ||
    normalized.includes("lower my rate") ||
    normalized.includes("lower rate") ||
    normalized.includes("remove pmi") ||
    normalized.includes("remove mi") ||
    normalized.includes("remove mortgage insurance")
  ) {
    return LOAN_PURPOSES.RATE_TERM_REFINANCE;
  }

  return LOAN_PURPOSE_ALIASES[normalized] || LOAN_PURPOSES.PURCHASE;
}

export function getLoanPurposeConfig(loanPurpose) {
  const normalizedPurpose = normalizeLoanPurpose(loanPurpose);
  return LOAN_PURPOSE_CONFIG[normalizedPurpose] || LOAN_PURPOSE_CONFIG[LOAN_PURPOSES.PURCHASE];
}

export function getRequiredFieldsForPurpose(loanPurpose) {
  return copyArray(getLoanPurposeConfig(loanPurpose).requiredFields);
}

export function getQuestionFlowForPurpose(loanPurpose) {
  return copyArray(getLoanPurposeConfig(loanPurpose).questionFlow);
}

export function getComparisonTypesForPurpose(loanPurpose) {
  return copyArray(getLoanPurposeConfig(loanPurpose).comparisonTypes);
}

export function getFieldLabelForPurpose(loanPurpose, fieldName) {
  const config = getLoanPurposeConfig(loanPurpose);
  return config.fieldLabels[fieldName] || fieldName;
}
