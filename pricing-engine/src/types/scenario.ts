export type Occupancy = "primary" | "second_home" | "investment";
export type LoanPurpose = "purchase" | "refinance" | "cash_out";
export type LoanTypePreference =
  | "conventional"
  | "fha"
  | "va"
  | "usda"
  | "jumbo"
  | "dscr";

export interface PricingScenario {
  purchasePrice: number;
  loanAmount: number;
  creditScore: number;
  occupancy: Occupancy;
  loanPurpose: LoanPurpose;
  loanTypePreference: LoanTypePreference | null;
  propertyType: string;
  zipCode: string;
  downPayment: number | null;
  ltv: number | null;
  language: "en" | "es" | null;
}
