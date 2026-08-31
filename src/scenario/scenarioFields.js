import {
  LOAN_PURPOSES,
  getFieldLabelForPurpose,
  normalizeLoanPurpose,
} from "../loanPurpose/loanPurposeConfig";

const LOAN_PURPOSE_OPTIONS = [
  { value: LOAN_PURPOSES.PURCHASE, label: "Purchase" },
  { value: LOAN_PURPOSES.RATE_TERM_REFINANCE, label: "Rate-and-Term Refinance" },
  { value: LOAN_PURPOSES.CASH_OUT_REFINANCE, label: "Cash-Out Refinance" },
];

const OCCUPANCY_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "second_home", label: "Second Home" },
  { value: "investment", label: "Investment" },
];

const REFINANCE_PURPOSE_OPTIONS = [
  { value: "unknown", label: "Not Sure Yet" },
  { value: "lower_payment", label: "Lower Payment" },
  { value: "cash_out", label: "Cash Out" },
  { value: "debt_consolidation", label: "Debt Consolidation" },
  { value: "shorten_term", label: "Shorten Term" },
];

const FIELD_TYPES = {
  cashOutGoal: "text",
  cashOutPurpose: "text",
  creditScore: "number",
  currentInterestRate: "number",
  currentLoanBalance: "currency",
  currentLoanTermYears: "number",
  currentMonthlyPayment: "currency",
  currentRemainingTermYears: "number",
  debtConsolidationAmount: "currency",
  debtConsolidationMonthlyPayments: "currency",
  desiredCashOut: "currency",
  downPayment: "currency",
  estimatedClosingCosts: "currency",
  estimatedPropertyValue: "currency",
  loanAmount: "currency",
  loanPurpose: "select",
  newInterestRate: "number",
  newLoanAmount: "currency",
  newLoanTermYears: "number",
  occupancy: "select",
  propertyTaxes: "currency",
  propertyValue: "currency",
  homeownersInsurance: "currency",
  hoaDues: "currency",
  purchasePrice: "currency",
  refinanceGoal: "text",
  refinancePurpose: "select",
  requestedCashOut: "currency",
  zipCode: "number",
};

const PURPOSE_FIELD_ORDER = {
  [LOAN_PURPOSES.PURCHASE]: [
    "loanPurpose",
    "purchasePrice",
    "downPayment",
    "loanAmount",
    "creditScore",
    "occupancy",
    "zipCode",
    "propertyTaxes",
    "homeownersInsurance",
    "hoaDues",
  ],
  [LOAN_PURPOSES.RATE_TERM_REFINANCE]: [
    "loanPurpose",
    "refinancePurpose",
    "propertyValue",
    "currentLoanBalance",
    "currentInterestRate",
    "currentLoanTermYears",
    "currentRemainingTermYears",
    "newLoanAmount",
    "newInterestRate",
    "newLoanTermYears",
    "estimatedClosingCosts",
    "refinanceGoal",
    "creditScore",
    "occupancy",
    "zipCode",
  ],
  [LOAN_PURPOSES.CASH_OUT_REFINANCE]: [
    "loanPurpose",
    "refinancePurpose",
    "propertyValue",
    "currentLoanBalance",
    "currentInterestRate",
    "currentLoanTermYears",
    "currentRemainingTermYears",
    "newLoanAmount",
    "newInterestRate",
    "newLoanTermYears",
    "estimatedClosingCosts",
    "requestedCashOut",
    "cashOutPurpose",
    "debtConsolidationAmount",
    "debtConsolidationMonthlyPayments",
    "cashOutGoal",
    "creditScore",
    "occupancy",
    "zipCode",
  ],
};

function buildField(purpose, key) {
  const field = {
    key,
    label:
      purpose === LOAN_PURPOSES.CASH_OUT_REFINANCE && key === "newLoanAmount"
        ? "Estimated New Loan Amount"
        : getFieldLabelForPurpose(purpose, key),
    type: FIELD_TYPES[key] || "text",
  };

  if (key === "loanPurpose") {
    field.options = LOAN_PURPOSE_OPTIONS;
  }

  if (key === "occupancy") {
    field.options = OCCUPANCY_OPTIONS;
  }

  if (key === "refinancePurpose") {
    field.options = REFINANCE_PURPOSE_OPTIONS;
  }

  return field;
}

export function getScenarioFields(scenario) {
  const purpose = normalizeLoanPurpose(scenario?.loanPurpose);
  const refinancePurpose = scenario?.refinancePurpose || "";
  const fields = (PURPOSE_FIELD_ORDER[purpose] || PURPOSE_FIELD_ORDER[LOAN_PURPOSES.PURCHASE]).filter((field) => {
    if (field === "debtConsolidationAmount" || field === "debtConsolidationMonthlyPayments") {
      return refinancePurpose === "debt_consolidation";
    }

    return true;
  });

  return fields.map((field) => buildField(purpose, field));
}
