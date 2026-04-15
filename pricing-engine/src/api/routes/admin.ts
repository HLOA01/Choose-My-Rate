import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { setPlatformStatus } from "../../controls/platformStatus.js";
import { refreshPrmgRates } from "../../jobs/refreshPrmgRates.js";

const statusSchema = z.object({
  pricingStatus: z.enum(["live", "warning", "paused"]),
  bannerMessage: z.string().nullable().optional(),
  pauseMessage: z.string().nullable().optional(),
  callbackEnabled: z.boolean().optional(),
  leadCaptureEnabled: z.boolean().optional(),
  activatedBy: z.string().nullable().optional(),
});

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const key = req.header("x-admin-api-key");
  if (!key || key !== env.ADMIN_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
});

adminRouter.post("/platform-status", async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    const control = await setPlatformStatus(input);
    res.json(control);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/refresh/prmg", async (_req, res, next) => {
  try {
    const result = await refreshPrmgRates();
    res.json(result);
  } catch (error) {
    next(error);
  }
});
