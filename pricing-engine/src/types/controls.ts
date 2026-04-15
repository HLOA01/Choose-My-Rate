import type { PlatformPricingStatus } from "../db/models/platformControl.js";

export interface UpdatePlatformStatusInput {
  pricingStatus: PlatformPricingStatus;
  bannerMessage?: string | null;
  pauseMessage?: string | null;
  callbackEnabled?: boolean;
  leadCaptureEnabled?: boolean;
  activatedBy?: string | null;
}
