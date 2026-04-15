import type { DbClient } from "./db.js";

export async function createRefreshLog(
  client: DbClient,
  input: {
    lenderCode: string;
    startedAt: Date;
    status: string;
    message: string;
  },
) {
  const result = await client.query(
    `
      INSERT INTO refresh_logs (lender_code, started_at, status, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [input.lenderCode, input.startedAt, input.status, input.message],
  );

  return String(result.rows[0].id);
}

export async function completeRefreshLog(
  client: DbClient,
  input: {
    id: string;
    status: string;
    message: string;
    errorDetails?: Record<string, unknown> | null;
    pricingVersionId?: string | null;
  },
) {
  await client.query(
    `
      UPDATE refresh_logs
      SET
        completed_at = now(),
        status = $2,
        message = $3,
        error_details = $4,
        pricing_version_id = $5
      WHERE id = $1
    `,
    [
      input.id,
      input.status,
      input.message,
      input.errorDetails ?? null,
      input.pricingVersionId ?? null,
    ],
  );
}

export async function getLastRefreshLog(client: DbClient, lenderCode = "PRMG") {
  const result = await client.query(
    `
      SELECT *
      FROM refresh_logs
      WHERE lender_code = $1
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [lenderCode],
  );

  return result.rows[0] ?? null;
}
