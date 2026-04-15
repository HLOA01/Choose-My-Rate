export type PlatformPricingStatus = "live" | "warning" | "paused";

export interface PlatformControl {
  id: string;
  pricingStatus: PlatformPricingStatus;
  bannerMessage: string | null;
  pauseMessage: string | null;
  callbackEnabled: boolean;
  leadCaptureEnabled: boolean;
  useLastPublishedPricing: boolean;
  activatedBy: string | null;
  activatedAt: Date;
  updatedAt: Date;
}
