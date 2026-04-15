import { env } from "../../config/env.js";
import { sha256 } from "../../utils/hashing.js";

export interface FetchedPrmgRateSheet {
  sourceUrl: string;
  buffer: Buffer;
  sourceHash: string;
  sourceTimestamp: Date | null;
}

export async function fetchPrmgRateSheet(
  sourceUrl = env.PRMG_RATE_SHEET_URL,
): Promise<FetchedPrmgRateSheet> {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "ChooseMyRatePricingEngine/1.0",
      Accept: "application/vnd.ms-excel,application/octet-stream,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`PRMG rate sheet download failed with ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error("PRMG rate sheet download was empty.");
  }

  const lastModified = response.headers.get("last-modified");

  return {
    sourceUrl,
    buffer,
    sourceHash: sha256(buffer),
    sourceTimestamp: lastModified ? new Date(lastModified) : null,
  };
}
