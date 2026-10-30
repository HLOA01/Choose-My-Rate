// Consent, restore, stop and reset controls for opt-in guest continuation. Everything the borrower needs to
// decide or recover is VISIBLE text (no screen-reader-only states). It reuses classes the active funnel already
// renders (simple-safe-message, simple-flow-actions, simple-primary-button, simple-secondary-button,
// simple-link-button), so it adds no CSS. Copy avoids apostrophes so JSX text needs no escaping.

const FIELD_LABELS = {
  borrowerPath: "loan type",
  homePrice: "home price",
  downPaymentAmount: "down payment",
  downPaymentPercent: "down payment percent",
  downPaymentInputMode: "down payment mode",
  propertyValue: "property value",
  currentMortgageBalance: "mortgage balance",
  refinanceGoal: "refinance goal",
  requestedCashOut: "cash-out amount",
  propertyType: "property type",
  occupancy: "occupancy",
  zipCode: "ZIP code",
};

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function problemText(problem) {
  switch (problem.code) {
    case "conflict":
      return "Saved details were changed or reset in another tab, so this tab has stopped saving. Reload this page to start saving again, or stop remembering to delete them.";
    case "unrecognized":
      return problem.reason === "newer_schema"
        ? "This browser holds saved details from a different version of this site. They are being kept and nothing will be saved until you clear them."
        : "This browser holds saved details this page cannot read. They are being kept and nothing will be saved until you clear them.";
    case "delete_failed":
      return "Remembering is off in this tab, but we could not confirm deletion. Saved details may still be stored. If storage refuses writes, this warning cannot be remembered after reload and those details may be offered again. Try again or clear this site's data in browser settings.";
    case "storage_unavailable":
      return "This tab could not save the latest changes. An older saved copy may still remain. You can continue editing, retry by opting in or editing again, or stop remembering.";
    case "paused_invalid": {
      const names = problem.fields.map((field) => FIELD_LABELS[field] || field).join(", ");
      return `Saving is paused because ${names} cannot be stored exactly as typed. The saved copy may be older than what is on screen.`;
    }
    default:
      return "";
  }
}

export function GuestInputPanel({ view, onOptIn, onAccept, onStop, onStartOver, onClearUnreadable, onRetryDelete }) {
  const problem = view.problem;
  const showOptIn = view.remember === "off" && view.available && !view.unreadableData && problem?.code !== "delete_failed";
  return (
    <section className="simple-safe-message" aria-label="Remember details on this browser" data-testid="guest-input-panel">
      {view.offer ? (
        <div data-testid="guest-input-offer">
          <p>
            <strong>Welcome back.</strong> Property details were saved on this browser on {formatWhen(view.offer.savedAt)} and are kept
            until {formatWhen(view.offer.keptUntil)}. Use them? This replaces the property and loan details on this form. It does not
            change your credit score or income.
          </p>
          <p data-testid="guest-input-shared-warning">
            Anyone using this browser profile can use these details. They may still be here after an earlier failed deletion.
            Nothing has been restored yet. Using saved details does not turn remembering on in this tab.
          </p>
          <div className="simple-flow-actions">
            <button type="button" className="simple-primary-button" data-testid="guest-input-accept" onClick={onAccept}>
              Use saved details
            </button>
            <button type="button" className="simple-secondary-button" data-testid="guest-input-delete-saved" onClick={onStop}>
              Delete saved details and stop remembering
            </button>
          </div>
        </div>
      ) : null}

      {problem ? (
        <div role="status" aria-live="polite" data-testid="guest-input-problem" data-problem={problem.code}>
          <p>{problemText(problem)}</p>
          {problem.code === "unrecognized" || (problem.code === "delete_failed" && view.unreadableData) ? (
            <button type="button" className="simple-secondary-button" data-testid="guest-input-clear-unreadable" onClick={onClearUnreadable}>
              Clear unreadable saved details
            </button>
          ) : null}
          {problem.code === "delete_failed" ? (
            <button type="button" className="simple-secondary-button" data-testid="guest-input-retry-delete" onClick={onRetryDelete}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {showOptIn ? (
        <div data-testid="guest-input-optin-block">

          <p data-testid="guest-input-disclosure">
            If you check this box, this browser keeps the property and loan details you enter here (home price, down payment, ZIP code,
            property type, how you will use the home, and for a refinance your balance and cash-out amount) for 7 days after your last
            change. Your credit score, income and contact details are never saved. Anyone who uses this browser profile on this device can
            see and use the saved details. This tab saves nothing unless you check this box. New tabs and reloads must choose again.
          </p>
          <label>
            <input type="checkbox" checked={false} onChange={onOptIn} data-testid="guest-input-optin" /> Remember my property details on
            this tab (optional)
          </label>
        </div>
      ) : null}

      {view.remember === "on" ? (
        <div data-testid="guest-input-on">
          <p>
            Remembering is on in this tab because you chose it.
            {view.keptUntil ? ` Saved property details are kept until ${formatWhen(view.keptUntil)}, and that date moves forward each time they change.` : ""}{" "}
            Credit score and income are never saved. A data-free reset marker remains until browser data is cleared, so stale tabs cannot
            revive removed details. This marker is not an account or authentication.
          </p>
          <button type="button" className="simple-link-button" data-testid="guest-input-stop" onClick={onStop}>
            Stop remembering and delete saved details
          </button>
        </div>
      ) : null}

      <button type="button" className="simple-link-button" data-testid="guest-input-start-over" onClick={onStartOver}>
        Start over (clears this form and any saved copy)
      </button>
    </section>
  );
}
