import type { PlatformPricingStatus } from "../db/models/platformControl.js";
import type { BorrowerQuote } from "../closingCosts/borrowerQuoteAssembler.js";

export type LoanType =
  | "conventional"
  | "fha"
  | "va"
  | "usda"
  | "jumbo"
  | "dscr"
  | "unknown";

export interface NormalizedPricingRow {
  lenderCode: string;
  productCode: string;
  productName: string;
  loanType: LoanType;
  termMonths: number;
  amortizationType: string;
  rate: number;
  price: number;
  lockDays: number;
  pointsOrCreditType: string;
  channel: string;
  rawRowJson: Record<string, unknown>;
}

export interface ValidationSummary {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rowCount: number;
  priorLiveRowCount: number | null;
  effectiveDate: string | null;
}

export interface BorrowerPricingOption {
  optionId: string;
  program: string;
  rate: number;
  price: number;
  paymentPI: number;
  paymentPITI: number;
  estimatedCashToClose: number;
  tags: string[];
  displayLender: false;
  borrowerQuote?: BorrowerQuote;
}

export interface PricingQuoteResponse {
  status: PlatformPricingStatus | "needs_more_info" | "no_live_pricing" | "no_eligible_options";
  banner: string | null;
  message?: string;
  pricingVersionId?: string;
  pricingAsOf?: string;
  missingFields?: string[];
  options: BorrowerPricingOption[];
  leadCaptureEnabled: boolean;
  callbackEnabled: boolean;
}
