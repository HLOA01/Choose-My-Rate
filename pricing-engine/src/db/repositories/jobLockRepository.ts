import type { DbClient } from "./db.js";

const PRMG_REFRESH_LOCK_ID = 1000;

export async function tryAcquirePrmgRefreshLock(client: DbClient) {
  const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
    PRMG_REFRESH_LOCK_ID,
  ]);
  return Boolean(result.rows[0]?.locked);
}

export async function releasePrmgRefreshLock(client: DbClient) {
  await client.query("SELECT pg_advisory_unlock($1)", [PRMG_REFRESH_LOCK_ID]);
}
