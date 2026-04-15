export interface PricingRow {
  id: string;
  pricingVersionId: string;
  lenderCode: string;
  productCode: string;
  productName: string;
  loanType: string;
  termMonths: number;
  amortizationType: string;
  rate: number;
  price: number;
  lockDays: number;
  pointsOrCreditType: string;
  channel: string;
  rawRowJson: Record<string, unknown>;
  createdAt: Date;
}
