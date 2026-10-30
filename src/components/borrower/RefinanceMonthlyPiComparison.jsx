import { useId, useState } from "react";
import { compareMonthlyPi, formatCents, quotedMonthlyPiToCents } from "../../pricing/monthlyPiDifference";

// Optional comparison of MONTHLY PRINCIPAL AND INTEREST only.
//
// The borrower's typed text lives ONLY in this component's own state. It is never passed to the scenario, pricing, Sally,
// events, storage, identity or the application handoff, and it is not a prop of anything. The Funnel mounts this component
// only while a valid, scenario-bound, ready REFINANCE quote with a selected option is on screen; every path that invalidates
// that quote (resetPricingView, scenario/Sally edits, restore, Start over, expiry, navigation) unmounts it, which discards
// the text. Typing here re-renders only this component: it does not touch the quote, so it cannot invalidate or reprice it.
const INPUT_HINT =
  "Enter dollars and cents using digits and one decimal point, for example 1850.25. Use principal and interest only: leave out taxes, homeowners insurance and mortgage insurance.";
const DISCLOSURE =
  "This compares monthly principal and interest only. Taxes, homeowners insurance and mortgage insurance are not included on either side. Your loan amount, term, closing costs and other costs may differ, so this is not a measure of overall savings and not a recommendation.";

const DIRECTION_PHRASE = { higher: "higher than", lower: "lower than" };

function problemMessage(reason) {
  if (reason === "unsafe_magnitude") return "That amount is too large to compare.";
  return "That is not a valid dollar amount. Use digits and one decimal point, for example 1850.25, with no commas, dollar sign or percent sign.";
}

export function RefinanceMonthlyPiComparison({ quotedMonthlyPI }) {
  const [currentMonthlyPI, setCurrentMonthlyPI] = useState("");
  const id = useId();
  const hintId = `${id}-hint`;
  const resultId = `${id}-result`;

  // Without a valid quoted P&I there is nothing to compare against, so the whole section stays out of the way.
  if (!quotedMonthlyPiToCents(quotedMonthlyPI).ok) return null;

  const result = compareMonthlyPi({ currentMonthlyPI, quotedMonthlyPI });
  const blank = result.status === "unavailable" && result.reason === "empty";
  const invalid = result.status === "unavailable" && !blank;
  const absolute = result.status === "ready" ? formatCents(result.absoluteDifferenceCents) : null;

  return (
    <section aria-label="Optional monthly principal and interest comparison" data-testid="monthly-pi-comparison" style={{ marginTop: "1rem" }}>
      <label htmlFor={`${id}-input`} style={{ display: "block", fontWeight: 600 }}>
        Optional: your current monthly principal and interest
      </label>
      <input
        id={`${id}-input`}
        data-testid="current-monthly-pi"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={currentMonthlyPI}
        onChange={(event) => setCurrentMonthlyPI(event.target.value)}
        aria-describedby={`${hintId} ${resultId}`}
        aria-invalid={invalid ? "true" : undefined}
        style={{ width: "100%", maxWidth: "18rem", boxSizing: "border-box" }}
      />
      <p id={hintId} data-testid="monthly-pi-hint">{INPUT_HINT}</p>
      <div id={resultId} role="status" aria-live="polite" data-testid="monthly-pi-result">
        {invalid ? <p data-testid="monthly-pi-message">{problemMessage(result.reason)}</p> : null}
        {result.status === "ready" ? (
          <>
            <p data-testid="monthly-pi-current">Your current principal and interest: <strong>{formatCents(result.currentCents)}</strong> per month</p>
            <p data-testid="monthly-pi-quoted">Quoted principal and interest at the selected rate: <strong>{formatCents(result.quotedCents)}</strong> per month</p>
            <p data-testid="monthly-pi-difference" data-direction={result.direction}>
              {result.direction === "same"
                ? "The quoted principal and interest is the same as your current principal and interest."
                : <>The quoted principal and interest is <strong>{absolute}</strong> per month {DIRECTION_PHRASE[result.direction]} your current principal and interest.</>}
            </p>
          </>
        ) : null}
      </div>
      <p data-testid="monthly-pi-disclosure">{DISCLOSURE}</p>
    </section>
  );
}
