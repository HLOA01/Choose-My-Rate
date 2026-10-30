/**
 * Input-only guest continuation store, v2.
 *
 * DESIGN RULES (each answers a review finding):
 *  1. OFF BY DEFAULT. Nothing is written until the borrower explicitly opts in. A fresh visitor causes one
 *     read that does NOT create a database (an IndexedDB upgrade is aborted rather than allowed).
 *  2. MINIMIZED. Only the pricing-payload property/loan inputs in FIELD_SPECS are ever stored. Credit score
 *     (exact or banded), income, first-time-buyer status and the current interest rate are never stored.
 *  3. TRANSACTIONAL. Every write, delete and repair is ONE IndexedDB readwrite transaction that reads the
 *     current record, decides synchronously and writes in the same transaction. IndexedDB isolates such
 *     transactions across tabs. If IndexedDB is unavailable, persistence is DISABLED. There is no fallback
 *     to localStorage or to any uncoordinated read/compare/write.
 *     There is no alternate web-storage write path.
 *  4. DURABLE RESET HISTORY. Stopping or resetting leaves a small record with an epoch and NO inputs (a
 *     tombstone), so "absent" never has to mean "nothing happened".
 *  5. NEVER SILENT. Unrecognized, oversized, newer-schema or future-dated data is preserved untouched and
 *     blocks saving. Only an explicit borrower action clears it. A deletion is reported as done only after the
 *     transaction commits; a failed deletion stays visible.
 *
 * LIMITS: IndexedDB isolation covers this module's own transactions. It does not constrain other code,
 * devtools, browser bugs or storage eviction. The store is shared device/profile storage: it is not
 * authentication or ownership. No React and no window access at import time, so the logic is unit-testable.
 */

import { GUEST_SCENARIO_MAX_AGE_MS } from "./scenarioStorage.js";

export const GUEST_INPUT_DB_NAME = "chooseMyRate.guestInputs.v2";
export const GUEST_INPUT_STORE_NAME = "state";
export const GUEST_INPUT_RECORD_KEY = "current";
export const GUEST_INPUT_CHANNEL_NAME = "chooseMyRate.guestInputs.v2.changes";
export const GUEST_INPUT_SCHEMA_VERSION = 2;
export const GUEST_INPUT_MAX_AGE_MS = GUEST_SCENARIO_MAX_AGE_MS; // existing documented guest retention (7 days)

// ENGINEERING CHOICES, NOT BUSINESS POLICY (proposal section 4.5):
export const GUEST_INPUT_MAX_RAW_LENGTH = 2048; // parse bound; larger raw text is PRESERVED and blocks saving, never deleted
export const GUEST_INPUT_SAVE_DELAY_MS = 250; // keystroke coalescing only

const digits = (maxInt, maxFrac = 0) => {
  const pattern = new RegExp(`^\\d{1,${maxInt}}${maxFrac ? `(?:\\.\\d{1,${maxFrac}})?` : ""}$`);
  return (value) => pattern.test(value);
};
const oneOf = (values) => (value) => values.includes(value);

/**
 * The ONLY fields that can be persisted or restored: the property/loan inputs that feed the funnel's pricing
 * payload. `fallback` is for unset values; a value that is set but cannot be stored exactly is reported by
 * projectInputs() and PAUSES saving (it is never silently replaced).
 */
const FIELD_SPECS = Object.freeze({
  borrowerPath: { fallback: "purchase", valid: oneOf(["purchase", "refinance"]) },
  homePrice: { fallback: "", valid: digits(12, 2) },
  downPaymentAmount: { fallback: "", valid: digits(12, 2) },
  downPaymentPercent: { fallback: "", valid: digits(3, 4) },
  downPaymentInputMode: { fallback: "dollars", valid: oneOf(["dollars", "percent"]) },
  propertyValue: { fallback: "", valid: digits(12, 2) },
  currentMortgageBalance: { fallback: "", valid: digits(12, 2) },
  refinanceGoal: { fallback: "lower_payment", valid: oneOf(["lower_payment", "shorter_term", "cash_out", "debt_consolidation"]) },
  requestedCashOut: { fallback: "", valid: digits(12, 2) },
  propertyType: { fallback: "", valid: oneOf(["single_family", "condo", "townhome", "multi_unit"]) },
  occupancy: { fallback: "", valid: oneOf(["primary", "second_home", "investment"]) },
  zipCode: { fallback: "", valid: digits(5) },
});

export const GUEST_INPUT_FIELDS = Object.freeze(Object.keys(FIELD_SPECS));
/** Funnel scenario fields that are deliberately NEVER stored (documentation + tests). */
export const GUEST_INPUT_EXCLUDED_FIELDS = Object.freeze([
  "creditScore", "creditRange", "annualIncome", "firstTimeHomebuyer", "currentInterestRate", "downPayment",
]);

const SORTED_FIELDS = [...GUEST_INPUT_FIELDS].sort().join(",");
const SORTED_RECORD_KEYS = ["epoch", "inputs", "revision", "savedAt", "schemaVersion", "state", "writeId"].join(",");
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Allowlisted projection. `invalidFields` lists fields that are SET but cannot be stored exactly; callers must not save while non-empty. */
export function projectInputs(source) {
  const inputs = {};
  const invalidFields = [];
  for (const field of GUEST_INPUT_FIELDS) {
    const spec = FIELD_SPECS[field];
    const value = source && typeof source === "object" ? source[field] : undefined;
    if (value === undefined || value === null || value === "") {
      inputs[field] = spec.fallback;
    } else if (typeof value === "string" && spec.valid(value)) {
      inputs[field] = value;
    } else {
      inputs[field] = spec.fallback;
      invalidFields.push(field);
    }
  }
  return { inputs, invalidFields };
}

/** True only when the borrower actually entered something (defaults alone do not count). */
export function hasMeaningfulInputs(inputs) {
  if (!inputs) return false;
  const entered = ["homePrice", "downPaymentAmount", "propertyValue", "currentMortgageBalance", "requestedCashOut", "propertyType", "occupancy", "zipCode"]
    .some((field) => inputs[field] !== undefined && inputs[field] !== "");
  return entered || (inputs.downPaymentInputMode === "percent" && Boolean(inputs.downPaymentPercent));
}

function sameNullableInputs(a, b) {
  if (a === null || b === null) return a === b;
  return GUEST_INPUT_FIELDS.every((field) => a[field] === b[field]);
}

const unrecognized = (reason) => ({ kind: "unrecognized", reason });

/**
 * Strict classification of a stored value. Nothing here deletes anything.
 *  absent | record | expired (structurally valid, older than retention) | unrecognized(reason)
 * "unrecognized" covers oversized, unparseable, wrong shape, any other schema (including newer), invalid
 * fields and future-dated timestamps. It is always PRESERVED.
 */
export function parseGuestInputRecord(raw, nowMs = Date.now()) {
  if (raw === null || raw === undefined) return { kind: "absent" };
  if (typeof raw !== "string") return unrecognized("not_string");
  if (raw.length > GUEST_INPUT_MAX_RAW_LENGTH) {
    const hint = /"schemaVersion"\s*:\s*(\d{1,6})/.exec(raw.slice(0, 256));
    return unrecognized(hint && Number(hint[1]) > GUEST_INPUT_SCHEMA_VERSION ? "newer_schema" : "oversized");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return unrecognized("unparseable");
  }
  if (!isPlainObject(data)) return unrecognized("shape");
  const version = data.schemaVersion;
  if (Number.isInteger(version) && version > GUEST_INPUT_SCHEMA_VERSION) return unrecognized("newer_schema");
  if (version !== GUEST_INPUT_SCHEMA_VERSION) return unrecognized("schema_version");
  if (Object.keys(data).sort().join(",") !== SORTED_RECORD_KEYS) return unrecognized("record_keys");

  const { state, epoch, revision, writeId, savedAt, inputs } = data;
  if (state !== "on" && state !== "off") return unrecognized("state");
  if (!Number.isSafeInteger(epoch) || epoch < 1) return unrecognized("epoch");
  if (!Number.isSafeInteger(revision) || revision < 1) return unrecognized("revision");
  if (typeof writeId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(writeId)) return unrecognized("write_id");
  if (!Number.isSafeInteger(savedAt) || savedAt <= 0) return unrecognized("saved_at");
  if (savedAt > nowMs) return unrecognized("future_dated"); // no tolerance: no policy was supplied

  let cleanInputs = null;
  if (state === "off") {
    if (inputs !== null) return unrecognized("off_with_inputs");
  } else if (inputs !== null) {
    if (!isPlainObject(inputs)) return unrecognized("inputs_shape");
    if (Object.keys(inputs).sort().join(",") !== SORTED_FIELDS) return unrecognized("input_keys");
    for (const field of GUEST_INPUT_FIELDS) {
      const value = inputs[field];
      const spec = FIELD_SPECS[field];
      if (typeof value !== "string" || !(value === spec.fallback || spec.valid(value))) return unrecognized(`field:${field}`);
    }
    if (!hasMeaningfulInputs(inputs)) return unrecognized("empty_inputs");
    cleanInputs = {};
    for (const field of GUEST_INPUT_FIELDS) cleanInputs[field] = inputs[field];
    Object.freeze(cleanInputs);
  }
  const record = Object.freeze({ schemaVersion: 2, state, epoch, revision, writeId, savedAt, inputs: cleanInputs });
  // Financial inputs expire; data-free reset history must not expire into an
  // absent baseline that an old tab could mistake for its original empty store.
  return state === "on" && nowMs - savedAt > GUEST_INPUT_MAX_AGE_MS ? { kind: "expired", record } : { kind: "record", record };
}

// ---- IndexedDB backend ----------------------------------------------------------------------------------------
//
// Backend contract (a fake with the same shape is used in unit tests):
//   available(): boolean
//   read():      Promise<{ ok:true, raw:string|null } | { ok:false, reason }>   never creates a database
//   transact(decide, { mayCreate, label }):
//                Promise<{ ok:true, outcome } | { ok:false, reason }>
//     decide(raw) runs SYNCHRONOUSLY inside one readwrite transaction and returns
//     { outcome, write?: string, remove?: true }. The result is reported only after the transaction commits.
export function createIndexedDbBackend(getFactory = () => globalThis.indexedDB) {
  const factory = () => {
    try {
      return getFactory() ?? null;
    } catch {
      return null;
    }
  };
  // Resolves an open connection, or null when the database does not exist and may not be created.
  function openDb(mayCreate) {
    return new Promise((resolve, reject) => {
      let request;
      let settled = false;
      try {
        request = factory().open(GUEST_INPUT_DB_NAME, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        if (!mayCreate) {
          try {
            request.transaction.abort(); // a fresh visitor must not leave a database behind
          } catch {
            // ignore
          }
          return;
        }
        request.result.createObjectStore(GUEST_INPUT_STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = (event) => {
        event?.preventDefault?.();
        if (settled) return;
        settled = true;
        if (!mayCreate && request.error?.name === "AbortError") resolve(null);
        else reject(request.error);
      };
      request.onblocked = () => { settled = true; reject(new Error("blocked")); };
    });
  }
  return {
    available: () => factory() !== null,
    async read() {
      try {
        const db = await openDb(false);
        if (!db) return { ok: true, raw: null };
        return await new Promise((resolve) => {
          let raw = null;
          let transaction;
          try { transaction = db.transaction(GUEST_INPUT_STORE_NAME, "readonly"); }
          catch { db.close(); resolve({ ok: false, reason: "storage_unavailable" }); return; }
          const get = transaction.objectStore(GUEST_INPUT_STORE_NAME).get(GUEST_INPUT_RECORD_KEY);
          get.onsuccess = () => {
            raw = get.result === undefined ? null : get.result;
          };
          transaction.oncomplete = () => { db.close(); resolve({ ok: true, raw }); };
          transaction.onerror = () => { db.close(); resolve({ ok: false, reason: "storage_unavailable" }); };
          transaction.onabort = () => { db.close(); resolve({ ok: false, reason: "storage_unavailable" }); };
        });
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
    },
    async transact(decide, { mayCreate = false } = {}) {
      try {
        const db = await openDb(mayCreate);
        if (!db) {
          const decision = decide(null); // nothing exists and nothing may be created
          return decision.write !== undefined || decision.remove ? { ok: false, reason: "needs_create" } : { ok: true, outcome: decision.outcome };
        }
        return await new Promise((resolve) => {
          let outcome;
          let failed = null;
          let transaction;
          try { transaction = db.transaction(GUEST_INPUT_STORE_NAME, "readwrite"); }
          catch { db.close(); resolve({ ok: false, reason: "storage_unavailable" }); return; }
          const store = transaction.objectStore(GUEST_INPUT_STORE_NAME);
          const get = store.get(GUEST_INPUT_RECORD_KEY);
          get.onsuccess = () => {
            try {
              const decision = decide(get.result === undefined ? null : get.result);
              outcome = decision.outcome;
              if (decision.write !== undefined) store.put(decision.write, GUEST_INPUT_RECORD_KEY);
              else if (decision.remove) store.delete(GUEST_INPUT_RECORD_KEY);
            } catch (error) {
              failed = error;
              transaction.abort();
            }
          };
          transaction.oncomplete = () => { db.close(); resolve({ ok: true, outcome }); };
          transaction.onerror = () => { db.close(); resolve({ ok: false, reason: "storage_unavailable" }); };
          transaction.onabort = () => { db.close(); resolve({ ok: false, reason: failed ? "decide_failed" : "storage_unavailable" }); };
        });
      } catch {
        return { ok: false, reason: "storage_unavailable" };
      }
    },
  };
}

function defaultRandomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const PROBLEM_PRIORITY = { conflict: 5, unrecognized: 5, delete_failed: 4, storage_unavailable: 2, paused_invalid: 1 };

/**
 * One session per mounted funnel.
 *
 * mode: "off" (default) or "on" ("on" = a durable `on` record exists at the epoch this session adopted).
 * `baselineRaw` is the exact stored text this session last read or wrote; a save requires the stored text, read
 * INSIDE its transaction, to still equal it. `generation` is bumped by every explicit action so queued or
 * debounced work created earlier aborts instead of running. This session's own operations run strictly in call
 * order (one queue); operations from other tabs are ordered by IndexedDB.
 */
export function createGuestInputSession(options = {}) {
  const backend = options.backend ?? createIndexedDbBackend();
  const now = () => Math.trunc((options.now ?? Date.now)());
  const randomId = options.randomId ?? defaultRandomId;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  const delayMs = options.saveDelayMs ?? GUEST_INPUT_SAVE_DELAY_MS;
  let notifier = options.onChange;
  const notifyChanged = () => {
    try {
      notifier?.();
    } catch {
      // a broken notifier must never affect storage
    }
  };
  const available = () => {
    try {
      return Boolean(backend && backend.available());
    } catch {
      return false;
    }
  };

  let mode = "off";
  let localConsent = false; // per mounted session, never inferred from a shared browser record
  let myEpoch = 0;
  let baselineRaw = null;
  let baselineRecord = null;
  let following = true; // mirror storage until this session takes an explicit action
  let blocked = false; // unrecognized data is present: only an explicit clear may mutate
  let problem = null;
  let offer = null; // { savedAt, raw }
  let accepting = false;
  let generation = 0;
  let inFlight = 0; // this session's mutations that have started and not finished
  let mutationVersion = 0;
  let pending = null;
  let timer = null;
  let lastDelete = null;
  let queue = Promise.resolve();
  let currentView = null;
  let currentJson = "";
  const listeners = new Set();

  const setProblem = (next) => {
    if (!next) {
      problem = null;
      return;
    }
    if (!problem || PROBLEM_PRIORITY[next.code] >= PROBLEM_PRIORITY[problem.code]) problem = next;
  };
  const clearTransient = () => {
    if (problem && (problem.code === "paused_invalid" || problem.code === "storage_unavailable")) problem = null;
  };
  const canWrite = () =>
    available() && localConsent && mode === "on" && !offer && !blocked && problem?.code !== "conflict" && problem?.code !== "delete_failed";

  function computeView() {
    return {
      available: available(),
      remember: mode,
      offer: offer ? { savedAt: offer.savedAt, keptUntil: offer.savedAt + GUEST_INPUT_MAX_AGE_MS } : null,
      writable: canWrite(),
      unreadableData: blocked,
      problem: problem ? { code: problem.code, reason: problem.reason ?? null, fields: problem.fields ?? [] } : null,
      keptUntil: mode === "on" && baselineRecord ? baselineRecord.savedAt + GUEST_INPUT_MAX_AGE_MS : null,
    };
  }
  function refresh() {
    const next = computeView();
    const json = JSON.stringify(next);
    if (json === currentJson) return currentView;
    currentView = next;
    currentJson = json;
    for (const listener of [...listeners]) listener();
    return currentView;
  }
  currentView = computeView();
  currentJson = JSON.stringify(currentView);

  const classify = (raw) => parseGuestInputRecord(raw, now());
  const enqueue = (task) => {
    const run = queue.then(task, task);
    queue = run.then(() => {}, () => {});
    return run;
  };
  async function safeRead() {
    try {
      return await backend.read();
    } catch {
      return { ok: false, reason: "storage_unavailable" };
    }
  }
  async function tx(decide, settings) {
    try {
      return await backend.transact(decide, settings);
    } catch {
      return { ok: false, reason: "storage_unavailable" };
    }
  }
  // Run one mutation: counts as in flight, runs in call order, always decremented.
  function mutate(task) {
    inFlight += 1;
    mutationVersion += 1;
    return enqueue(async () => {
      try {
        return await task();
      } finally {
        inFlight -= 1;
        mutationVersion += 1;
      }
    });
  }

  function cancelPending() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    pending = null;
  }

  function buildRecord({ state, epoch, revision, inputs }) {
    const raw = JSON.stringify({ schemaVersion: GUEST_INPUT_SCHEMA_VERSION, state, epoch, revision, writeId: randomId(), savedAt: now(), inputs });
    const parsed = classify(raw);
    if (parsed.kind !== "record") throw new Error("Guest input record could not be encoded.");
    return { raw, record: parsed.kind === "record" ? parsed.record : null };
  }

  // Mirror a stored value into session state. Never writes or deletes.
  function applyStorage(raw, parsed) {
    baselineRaw = raw;
    baselineRecord = null;
    offer = null;
    blocked = false;
    if (problem && problem.code !== "delete_failed") problem = null;
    if (parsed.kind === "absent") {
      mode = "off";
      localConsent = false;
      myEpoch = 0;
    } else if (parsed.kind === "record") {
      myEpoch = parsed.record.epoch;
      baselineRecord = parsed.record;
      if (parsed.record.state === "on") {
        mode = localConsent ? "on" : "off";
        if (parsed.record.inputs && problem?.code !== "delete_failed") offer = { savedAt: parsed.record.savedAt, raw };
      } else {
        mode = "off";
        localConsent = false;
      }
    } else if (parsed.kind === "expired") {
      mode = "off";
      localConsent = false;
    } else {
      mode = "off";
      blocked = true;
      problem = { code: "unrecognized", reason: parsed.reason };
    }
  }
  function setNothingKnown() {
    mode = "off";
    localConsent = false;
    baselineRaw = null;
    baselineRecord = null;
    offer = null;
    blocked = false;
  }
  function failDelete(kind, reason) {
    lastDelete = kind;
    problem = { code: "delete_failed", reason }; // always visible; never hidden behind another problem
    refresh();
    return { ok: false, reason: "delete_failed", detail: reason };
  }
  function adoptWritten(written) {
    baselineRaw = written.raw;
    baselineRecord = written.record;
    myEpoch = written.record.epoch;
    notifyChanged();
  }

  // ---- loading / observing (read-only) ------------------------------------------------------------------------
  async function load() {
    cancelPending();
    generation += 1;
    const gen = generation;
    localConsent = false;
    mode = "off";
    following = true;
    accepting = false;
    problem = problem?.code === "delete_failed" ? problem : null;
    if (!available()) {
      setNothingKnown();
      return refresh();
    }
    const read = await safeRead();
    if (gen !== generation) return currentView; // a newer load/action superseded this delayed read
    if (!read.ok) {
      setNothingKnown();
      return refresh();
    }
    const parsed = classify(read.raw);
    applyStorage(read.raw, parsed);
    const view = refresh();
    if (parsed.kind === "expired") void cleanupExpired(read.raw);
    return view;
  }

  async function observe() {
    if (!available()) return currentView;
    const gen = generation;
    const startedInFlight = inFlight;
    const startedMutationVersion = mutationVersion;
    const read = await safeRead();
    // Ignore the result if anything of ours happened meanwhile; our own write must not look like another tab's.
    if (!read.ok || gen !== generation || mutationVersion !== startedMutationVersion || inFlight !== 0 || startedInFlight !== 0 || read.raw === baselineRaw) return currentView;
    if (following) {
      if (mode === "on" && pending !== null) {
        cancelPending(); // unsaved local edits + a changed record: stop and say so rather than quietly resuming
        setProblem({ code: "conflict" });
        return refresh();
      }
      generation += 1;
      cancelPending();
      const parsed = classify(read.raw);
      applyStorage(read.raw, parsed);
      const view = refresh();
      if (parsed.kind === "expired") void cleanupExpired(read.raw);
      return view;
    }
    if (mode === "on") {
      cancelPending();
      setProblem({ code: "conflict" });
      return refresh();
    }
    return currentView; // this tab stopped remembering and writes nothing
  }

  // Accept re-reads the record, writes NOTHING, and returns one complete validated set or nothing.
  async function accept() {
    if (!offer || accepting) return { ok: false, reason: "no_offer" };
    accepting = true;
    generation += 1;
    const gen = generation;
    cancelPending();
    const shown = offer.raw;
    const read = await safeRead();
    if (gen !== generation) {
      accepting = false;
      return { ok: false, reason: "superseded" };
    }
    const parsed = read.ok ? classify(read.raw) : null;
    if (!read.ok || read.raw !== shown || parsed.kind !== "record" || parsed.record.state !== "on" || !parsed.record.inputs) {
      accepting = false;
      if (read.ok) {
        applyStorage(read.raw, parsed);
        if (parsed.kind === "expired") void cleanupExpired(read.raw);
      } else {
        offer = null;
      }
      refresh();
      return { ok: false, reason: "stale" };
    }
    following = false;
    baselineRaw = read.raw;
    baselineRecord = parsed.record;
    myEpoch = parsed.record.epoch;
    mode = localConsent ? "on" : "off";
    offer = null;
    accepting = false;
    refresh();
    return { ok: true, inputs: { ...parsed.record.inputs } };
  }

  // ---- explicit consent ---------------------------------------------------------------------------------------
  async function enable(source) {
    if (!available()) return { ok: false, reason: "unavailable" };
    generation += 1;
    const gen = generation;
    cancelPending();
    return mutate(async () => {
      const res = await tx((raw) => {
        if (gen !== generation) return { outcome: { kind: "superseded" } };
        if (blocked) return { outcome: { kind: "blocked_known" } };
        const parsed = classify(raw);
        if (parsed.kind === "unrecognized") return { outcome: { kind: "blocked", raw, parsed } };
        if (parsed.kind === "record" && parsed.record.state === "on") return { outcome: { kind: "adopted", raw, parsed } };
        const epoch = parsed.kind === "absent" ? 1 : parsed.record.epoch + 1; // off tombstone or expired record
        const { inputs, invalidFields } = projectInputs(source);
        const storable = invalidFields.length === 0 && hasMeaningfulInputs(inputs) ? inputs : null;
        const written = buildRecord({ state: "on", epoch, revision: 1, inputs: storable });
        return { write: written.raw, outcome: { kind: "enabled", written, invalidFields } };
      }, { mayCreate: true, label: "enable" });
      if (gen !== generation) return { ok: false, reason: "superseded" };
      if (!res.ok) {
        setProblem({ code: "storage_unavailable" });
        refresh();
        return { ok: false, reason: res.reason };
      }
      const o = res.outcome;
      if (o.kind === "superseded") return { ok: false, reason: "superseded" };
      if (o.kind === "blocked_known") return { ok: false, reason: "blocked" };
      if (o.kind === "blocked") {
        applyStorage(o.raw, o.parsed);
        refresh();
        return { ok: false, reason: "blocked" };
      }
      if (o.kind === "adopted") {
        const alreadyAccepted = !offer && !following && baselineRaw === o.raw;
        localConsent = true;
        applyStorage(o.raw, o.parsed); // someone else already consented: adopt, never overwrite their data
        if (alreadyAccepted) offer = null;
        following = false;
        refresh();
        return { ok: true, reason: "adopted" };
      }
      adoptWritten(o.written);
      localConsent = true;
      mode = "on";
      following = false;
      offer = null;
      blocked = false;
      problem = o.invalidFields.length ? { code: "paused_invalid", fields: o.invalidFields } : null;
      refresh();
      return { ok: true, reason: "enabled" };
    });
  }

  // ---- stop remembering and delete (tombstone: epoch + no inputs) ---------------------------------------------
  async function forget() {
    generation += 1;
    const gen = generation;
    cancelPending();
    mode = "off"; // saving stops immediately; deletion is then confirmed by the committed transaction
    localConsent = false;
    offer = null;
    following = false;
    accepting = false;
    if (problem?.code === "conflict" || problem?.code === "paused_invalid" || problem?.code === "storage_unavailable") problem = null;
    refresh();
    if (!available()) return failDelete("forget", "unavailable");
    return mutate(async () => {
      const res = await tx((raw) => {
        const parsed = classify(raw);
        if (parsed.kind === "absent") return { outcome: { kind: "nothing_stored" } };
        if (parsed.kind === "unrecognized") return { outcome: { kind: "blocked", raw, parsed } };
        const written = buildRecord({ state: "off", epoch: parsed.record.epoch + 1, revision: parsed.record.revision + 1, inputs: null });
        return { write: written.raw, outcome: { kind: "deleted", written } };
      }, { label: "forget" });
      if (gen !== generation) {
        if (res.ok) notifyChanged();
        return { ok: false, reason: "superseded" };
      }
      if (!res.ok) return failDelete("forget", res.reason);
      const o = res.outcome;
      if (o.kind === "nothing_stored") {
        baselineRaw = null;
        baselineRecord = null;
        offer = null;
        if (problem?.code === "delete_failed") problem = null;
        refresh();
        return { ok: true, reason: "nothing_stored" };
      }
      if (o.kind === "blocked") {
        applyStorage(o.raw, o.parsed);
        following = false;
        refresh();
        return { ok: false, reason: "blocked" };
      }
      adoptWritten(o.written);
      localConsent = false;
      mode = "off";
      offer = null;
      problem = null;
      lastDelete = null;
      refresh();
      return { ok: true, reason: "deleted" };
    });
  }

  // Reset clears saved inputs and withdraws this session's permission immediately.
  async function resetInputs() { return forget(); }

  // ---- explicit clear of data this version cannot read --------------------------------------------------------
  async function clearUnrecognized() {
    generation += 1;
    const gen = generation;
    cancelPending();
    const shown = baselineRaw;
    localConsent = false;
    mode = "off";
    offer = null;
    return mutate(async () => {
      const res = await tx((raw) => {
        if (!blocked) return { outcome: { kind: "nothing_to_clear" } };
        if (raw !== shown) return { outcome: { kind: "changed", raw } }; // changed since it was shown: delete nothing
        const written = buildRecord({ state: "off", epoch: 1, revision: 1, inputs: null });
        return { write: written.raw, outcome: { kind: "cleared", written } };
      }, { label: "clear" });
      if (gen !== generation) {
        if (res.ok) notifyChanged();
        return { ok: false, reason: "superseded" };
      }
      if (!res.ok) return failDelete("unrecognized", res.reason);
      const o = res.outcome;
      if (o.kind === "nothing_to_clear") return { ok: false, reason: "nothing_to_clear" };
      if (o.kind === "changed") {
        following = true;
        applyStorage(o.raw, classify(o.raw));
        refresh();
        return { ok: false, reason: "changed" };
      }
      adoptWritten(o.written);
      blocked = false;
      mode = "off";
      following = true;
      problem = null;
      lastDelete = null;
      notifyChanged();
      refresh();
      return { ok: true, reason: "cleared" };
    });
  }

  // ---- retention enforcement for recognized, expired records only ---------------------------------------------
  async function cleanupExpired(seenRaw) {
    if (!available()) return { ok: false, reason: "unavailable" };
    return mutate(async () => {
      const res = await tx((raw) => {
        if (raw !== seenRaw) return { outcome: { kind: "changed", raw } };
        if (classify(raw).kind !== "expired") return { outcome: { kind: "not_expired" } }; // re-checked at deletion time
        const record = classify(raw).record;
        const written = buildRecord({ state: "off", epoch: record.epoch + 1, revision: record.revision + 1, inputs: null });
        return { write: written.raw, outcome: { kind: "removed", written } };
      }, { label: "cleanup" });
      if (!res.ok) return failDelete("expired", res.reason);
      const o = res.outcome;
      if (o.kind === "changed") {
        if (following && inFlight <= 1) {
          applyStorage(o.raw, classify(o.raw)); // changed under us: re-evaluate, delete nothing
          refresh();
        }
        return { ok: true, reason: "changed" };
      }
      if (o.kind === "not_expired") return { ok: true, reason: "not_expired" };
      if (baselineRaw === seenRaw) {
        adoptWritten(o.written);
      }
      notifyChanged();
      refresh();
      return { ok: true, reason: "expired_removed" };
    });
  }

  async function retryDelete() {
    const kind = lastDelete;
    if (kind === "unrecognized") return clearUnrecognized();
    if (kind === "reset") return resetInputs();
    if (kind === "expired") {
      const read = await safeRead();
      if (problem?.code === "delete_failed") problem = null;
      if (read.ok && classify(read.raw).kind === "expired") return cleanupExpired(read.raw);
      refresh();
      return { ok: true, reason: "nothing_to_retry" };
    }
    return forget();
  }

  // ---- debounced saving ---------------------------------------------------------------------------------------
  function scheduleSave(source) {
    if (!canWrite()) {
      cancelPending();
      return;
    }
    const { inputs, invalidFields } = projectInputs(source);
    pending = { inputs, invalidFields, generation };
    if (timer !== null) cancel(timer);
    timer = schedule(() => {
      timer = null;
      void flushPending();
    }, delayMs);
  }

  function flush() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    return flushPending();
  }

  async function flushPending() {
    const job = pending;
    pending = null;
    if (!job) return { ok: true, reason: "nothing_pending" };
    if (job.generation !== generation) return { ok: false, reason: "superseded" };
    return mutate(async () => {
      const res = await tx((raw) => {
        if (job.generation !== generation) return { outcome: { kind: "superseded" } };
        if (!canWrite()) return { outcome: { kind: "not_writable" } };
        if (raw !== baselineRaw || !baselineRecord || baselineRecord.state !== "on") return { outcome: { kind: "conflict" } };
        const parsed = classify(raw);
        if (parsed.kind === "expired") return { outcome: { kind: "expired", raw, parsed } };
        if (parsed.kind !== "record") return { outcome: { kind: "conflict" } };
        if (job.invalidFields.length) return { outcome: { kind: "paused_invalid", fields: job.invalidFields } };
        const nextInputs = hasMeaningfulInputs(job.inputs) ? job.inputs : null;
        if (sameNullableInputs(baselineRecord.inputs, nextInputs)) return { outcome: { kind: "unchanged" } };
        const written = buildRecord({ state: "on", epoch: myEpoch, revision: baselineRecord.revision + 1, inputs: nextInputs });
        return { write: written.raw, outcome: { kind: nextInputs ? "saved" : "cleared", written } };
      }, { label: "save" });
      if (job.generation !== generation) return { ok: false, reason: "superseded" };
      if (!res.ok) {
        setProblem({ code: "storage_unavailable" });
        refresh();
        return { ok: false, reason: res.reason };
      }
      const o = res.outcome;
      if (o.kind === "superseded" || o.kind === "not_writable") return { ok: false, reason: o.kind };
      if (o.kind === "expired") {
        applyStorage(o.raw, o.parsed);
        cancelPending();
        refresh();
        void cleanupExpired(o.raw);
        return { ok: false, reason: "expired" };
      }
      if (o.kind === "conflict") {
        cancelPending();
        setProblem({ code: "conflict" });
        refresh();
        return { ok: false, reason: "conflict" };
      }
      if (o.kind === "paused_invalid") {
        setProblem({ code: "paused_invalid", fields: o.fields });
        refresh();
        return { ok: false, reason: "paused_invalid" };
      }
      clearTransient();
      if (o.kind === "unchanged") {
        refresh();
        return { ok: true, reason: "unchanged" };
      }
      adoptWritten(o.written);
      following = false;
      refresh();
      return { ok: true, reason: o.kind };
    });
  }

  function suspend() {
    cancelPending();
    generation += 1;
    offer = null;
    accepting = false;
  }

  return {
    setNotifier(next) { notifier = next; },
    load, observe, accept, enable, forget, resetInputs, clearUnrecognized, retryDelete,
    scheduleSave, flush, suspend,
    getView: () => currentView,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    diagnostics: () => ({
      mode, myEpoch, generation, following, blocked, problem: problem?.code ?? null, hasOffer: Boolean(offer),
      baselineRevision: baselineRecord?.revision ?? null, hasPending: pending !== null, hasTimer: timer !== null, inFlight,
    }),
  };
}
