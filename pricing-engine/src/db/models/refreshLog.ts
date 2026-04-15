export interface RefreshLog {
  id: string;
  lenderCode: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  message: string;
  errorDetails: Record<string, unknown> | null;
  pricingVersionId: string | null;
  createdAt: Date;
}
