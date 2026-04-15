import type { DbClient } from "./db.js";
import type { PlatformControl } from "../models/platformControl.js";
import type { UpdatePlatformStatusInput } from "../../types/controls.js";

function mapControl(row: Record<string, unknown>): PlatformControl {
  return {
    id: String(row.id),
    pricingStatus: row.pricing_status as PlatformControl["pricingStatus"],
    bannerMessage: row.banner_message ? String(row.banner_message) : null,
    pauseMessage: row.pause_message ? String(row.pause_message) : null,
    callbackEnabled: Boolean(row.callback_enabled),
    leadCaptureEnabled: Boolean(row.lead_capture_enabled),
    useLastPublishedPricing: Boolean(row.use_last_published_pricing),
    activatedBy: row.activated_by ? String(row.activated_by) : null,
    activatedAt: new Date(String(row.activated_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export async function getPlatformControl(client: DbClient) {
  const result = await client.query(
    `
      SELECT *
      FROM platform_controls
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );

  if (!result.rows[0]) {
    throw new Error("platform_controls is not seeded.");
  }

  return mapControl(result.rows[0]);
}

export async function updatePlatformControl(client: DbClient, input: UpdatePlatformStatusInput) {
  const existing = await getPlatformControl(client);
  const result = await client.query(
    `
      UPDATE platform_controls
      SET
        pricing_status = $2,
        banner_message = $3,
        pause_message = $4,
        callback_enabled = $5,
        lead_capture_enabled = $6,
        activated_by = $7,
        activated_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [
      existing.id,
      input.pricingStatus,
      input.bannerMessage ?? existing.bannerMessage,
      input.pauseMessage ?? existing.pauseMessage,
      input.callbackEnabled ?? existing.callbackEnabled,
      input.leadCaptureEnabled ?? existing.leadCaptureEnabled,
      input.activatedBy ?? existing.activatedBy,
    ],
  );

  return mapControl(result.rows[0]);
}
