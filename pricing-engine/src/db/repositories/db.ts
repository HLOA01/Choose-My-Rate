import pg from "pg";
import { env } from "../../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

export type DbClient = pg.PoolClient | pg.Pool;

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
