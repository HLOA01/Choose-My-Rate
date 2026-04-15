export type PricingVersionStatus = "staging" | "live" | "failed" | "archived";

export interface PricingVersion {
  id: string;
  lenderCode: string;
  sourceUrl: string;
  sourceHash: string;
  sourceTimestamp: Date | null;
  refreshStartedAt: Date;
  refreshCompletedAt: Date | null;
  effectiveDate: string | null;
  status: PricingVersionStatus;
  publishedAt: Date | null;
  validationSummary: Record<string, unknown>;
  createdAt: Date;
}
