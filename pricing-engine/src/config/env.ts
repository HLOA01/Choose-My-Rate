import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1),
  PRMG_RATE_SHEET_URL: z
    .string()
    .url()
    .default("http://www.eprmg.net/campaigner/WHLS-1000.xls"),
  REFRESH_CRON: z.string().default("*/15 * * * *"),
  ADMIN_API_KEY: z.string().min(8),
  ENABLE_SCHEDULER: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
});

export const env = envSchema.parse(process.env);
