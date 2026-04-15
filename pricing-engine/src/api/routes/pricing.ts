import { Router } from "express";
import { z } from "zod";
import { getPricingForScenario } from "../../engine/getPricingForScenario.js";

const scenarioSchema = z.object({
  purchasePrice: z.coerce.number().positive().optional(),
  loanAmount: z.coerce.number().positive().optional(),
  creditScore: z.coerce.number().int().positive().optional(),
  occupancy: z.enum(["primary", "second_home", "investment"]).optional(),
  loanPurpose: z.enum(["purchase", "refinance", "cash_out"]).optional(),
  loanTypePreference: z
    .enum(["conventional", "fha", "va", "usda", "jumbo", "dscr"])
    .nullable()
    .optional(),
  propertyType: z.string().default("single_family"),
  zipCode: z.string().default(""),
  downPayment: z.coerce.number().nullable().optional(),
  ltv: z.coerce.number().nullable().optional(),
  language: z.enum(["en", "es"]).nullable().optional(),
});

export const pricingRouter = Router();

pricingRouter.post("/quote", async (req, res, next) => {
  try {
    const scenario = scenarioSchema.parse(req.body);
    const response = await getPricingForScenario(scenario);
    res.json(response);
  } catch (error) {
    next(error);
  }
});
