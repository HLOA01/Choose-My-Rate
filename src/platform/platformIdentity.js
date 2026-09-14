/**
 * Local persistence of the canonical HLOA identity for a borrower session. PASS 3.
 *
 * Stored: a per-browser `sessionKey` plus the canonical `leadId` / `borrowerId`
 * / `scenarioId` once issued, and a coarse `syncState`. That is ALL — no contact
 * data, no financial data, no secrets, no tokens. Canonical ids are opaque
 * references.
 *
 * The `sessionKey` is generated once and reused, so a browser refresh resumes
 * the same identity instead of creating a new one. This lives alongside the
 * existing guest-scenario restore (`scenario/scenarioStorage.js`), which is not
 * changed.
 */

export const PLATFORM_IDENTITY_KEY = "chooseMyRate.platformIdentity.v1";
export const PLATFORM_IDENTITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ID_FIELDS = ["leadId", "borrowerId", "scenarioId"];

function newSessionKey() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `cmr-${crypto.randomUUID()}`;
  } catch {
    // fall through
  }
  return `cmr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isCanonical(prefix, value) {
  return typeof value === "string" && new RegExp(`^CMR-${prefix}-[0-9A-HJKMNP-TV-Z]{26}$`).test(value);
}

function sanitize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt) || Date.now() - savedAt > PLATFORM_IDENTITY_MAX_AGE_MS) return null;
  const sessionKey = typeof raw.sessionKey === "string" && raw.sessionKey.length >= 8 ? raw.sessionKey : null;
  if (!sessionKey) return null;

  const identity = { sessionKey, savedAt };
  if (isCanonical("LEAD", raw.leadId)) identity.leadId = raw.leadId;
  if (isCanonical("BOR", raw.borrowerId)) identity.borrowerId = raw.borrowerId;
  if (isCanonical("SCN", raw.scenarioId)) identity.scenarioId = raw.scenarioId;
  if (raw.syncState === "ok" || raw.syncState === "degraded") identity.syncState = raw.syncState;
  return identity;
}

/** Read the stored identity, creating (and persisting) a fresh session key if none/stale. */
export function readPlatformIdentity(storage = safeStorage()) {
  let stored = null;
  try {
    stored = sanitize(JSON.parse(storage?.getItem(PLATFORM_IDENTITY_KEY) || "null"));
  } catch {
    stored = null;
  }
  if (stored) return stored;
  const fresh = { sessionKey: newSessionKey(), savedAt: Date.now() };
  writePlatformIdentity(fresh, storage);
  return fresh;
}

/** Merge a patch (only whitelisted, canonical fields) into the stored identity. */
export function writePlatformIdentity(patch = {}, storage = safeStorage()) {
  const current = (() => {
    try {
      return sanitize(JSON.parse(storage?.getItem(PLATFORM_IDENTITY_KEY) || "null")) || {};
    } catch {
      return {};
    }
  })();

  const next = {
    sessionKey: patch.sessionKey || current.sessionKey || newSessionKey(),
    savedAt: Date.now(),
  };
  for (const field of ID_FIELDS) {
    const prefix = { leadId: "LEAD", borrowerId: "BOR", scenarioId: "SCN" }[field];
    const candidate = patch[field] ?? current[field];
    if (isCanonical(prefix, candidate)) next[field] = candidate;
  }
  const syncState = patch.syncState ?? current.syncState;
  if (syncState === "ok" || syncState === "degraded") next.syncState = syncState;

  try {
    storage?.setItem(PLATFORM_IDENTITY_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private mode); the app keeps working.
  }
  return next;
}

export function clearPlatformIdentity(storage = safeStorage()) {
  try {
    storage?.removeItem(PLATFORM_IDENTITY_KEY);
  } catch {
    // ignore
  }
}

function safeStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
