/**
 * Optional monthly PRINCIPAL-AND-INTEREST comparison. Pure: no React, no storage, no network, no clock.
 *
 *   differenceCents = quoted monthly P&I (cents) - borrower-entered current monthly P&I (cents)
 *   positive = the quoted P&I is higher, negative = lower, zero = the same.
 *
 * Only two inputs exist: the borrower's raw text and the selected quote's paymentPI. Nothing is derived from rates,
 * balances, terms, PITI, fees or cash to close, and no legacy helper is used (src/utils/refinanceComparison.js strips
 * "$ , % space", coerces with Number(), rounds to whole dollars, clamps negatives to zero and treats missing as zero).
 */

const MAX_CENTS = Number.MAX_SAFE_INTEGER; // 9007199254740991 cents: the largest exactly-representable integer, not a business cap
// Plain non-negative decimal dollars: ASCII digits, no sign, no exponent, no separators, no leading zeros, at most 2 decimals.
const DECIMAL_DOLLARS = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;
// More than 14 integer digits is already >= 10^16 cents > MAX_CENTS, so BigInt is never fed an unbounded string.
const MAX_INTEGER_DIGITS = 14;

const fail = (reason) => ({ ok: false, reason });

/**
 * Parse the borrower's raw text. The text is never trimmed, stripped, rounded or coerced.
 * reasons: empty | not_text | malformed | unsafe_magnitude
 */
export function parseCurrentMonthlyPi(raw) {
  if (raw === null || raw === undefined) return fail("empty");
  if (typeof raw !== "string") return fail("not_text"); // numbers, booleans, arrays, objects are never coerced
  if (raw.trim() === "") return fail("empty"); // only used to CLASSIFY "nothing typed"; whitespace never becomes a value
  const match = DECIMAL_DOLLARS.exec(raw);
  if (!match || match[0] !== raw) return fail("malformed");
  const dollars = match[1];
  if (dollars.length > MAX_INTEGER_DIGITS) return fail("unsafe_magnitude");
  const cents = BigInt(dollars) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(MAX_CENTS)) return fail("unsafe_magnitude");
  return { ok: true, cents: Number(cents) };
}

/**
 * HLOA rankBestExecution emits paymentPI rounded to cents before the public boundary passes it through.
 * Independently require the supplied numeric amount to have a canonical whole-cent representation.
 * Sub-cent/legacy values are unavailable here, never rounded into a new financial amount.
 */
export function quotedMonthlyPiToCents(value) {
  if (value === null || value === undefined) return fail("missing");
  if (typeof value !== "number") return fail("not_number");
  if (!Number.isFinite(value)) return fail("not_finite");
  if (value < 0) return fail("negative");
  if (value > MAX_CENTS / 100) return fail("unsafe_magnitude");
  const parsed = parseCurrentMonthlyPi(String(value)); // canonical number spelling; -0 becomes 0
  if (!parsed.ok) return fail(parsed.reason === "unsafe_magnitude" ? "unsafe_magnitude" : "unsupported_precision");
  return parsed;
}

/**
 * result.status "unavailable": { reason, field: "current" | "quoted" }  (never a zero, never a guess)
 * result.status "ready": { direction: "higher" | "lower" | "same", currentCents, quotedCents, differenceCents, absoluteDifferenceCents }
 */
export function compareMonthlyPi({ currentMonthlyPI, quotedMonthlyPI } = {}) {
  const quoted = quotedMonthlyPiToCents(quotedMonthlyPI);
  if (!quoted.ok) return { status: "unavailable", reason: quoted.reason, field: "quoted" };
  const current = parseCurrentMonthlyPi(currentMonthlyPI);
  if (!current.ok) return { status: "unavailable", reason: current.reason, field: "current" };
  // Both operands are non-negative safe integers, so the exact difference is itself a safe integer. No floats are involved.
  const differenceCents = quoted.cents - current.cents;
  return {
    status: "ready",
    direction: differenceCents > 0 ? "higher" : differenceCents < 0 ? "lower" : "same",
    currentCents: current.cents,
    quotedCents: quoted.cents,
    differenceCents,
    absoluteDifferenceCents: Math.abs(differenceCents),
  };
}

/** "$2,731.45". Only non-negative safe integers are formatted, so a sign or "-$0.00" can never be produced. */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  const big = BigInt(cents);
  return `$${(big / 100n).toLocaleString("en-US")}.${String(big % 100n).padStart(2, "0")}`;
}
