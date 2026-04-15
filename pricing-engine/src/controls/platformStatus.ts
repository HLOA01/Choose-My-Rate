import { pool } from "../db/repositories/db.js";
import {
  getPlatformControl,
  updatePlatformControl,
} from "../db/repositories/platformControlRepository.js";
import type { UpdatePlatformStatusInput } from "../types/controls.js";

export function getPlatformStatus() {
  return getPlatformControl(pool);
}

export function setPlatformStatus(input: UpdatePlatformStatusInput) {
  return updatePlatformControl(pool, input);
}
