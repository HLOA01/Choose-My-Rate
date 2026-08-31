function formatSavedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SavedScenarioRestore({ draft, onContinue, onStartOver }) {
  if (!draft) return null;

  return (
    <section className="saved-scenario-restore" data-testid="saved-scenario-restore">
      <div>
        <div className="mini-label">Saved scenario</div>
        <h2>Welcome back. Do you want to continue your saved scenario?</h2>
        <p>
          Saved {formatSavedAt(draft.savedAt)} on this browser. Rate options may update when the details load again.
        </p>
      </div>
      <div className="saved-scenario-actions">
        <button type="button" data-testid="saved-scenario-continue" onClick={onContinue}>
          Continue
        </button>
        <button type="button" data-testid="saved-scenario-start-over" onClick={onStartOver}>
          Start over
        </button>
      </div>
    </section>
  );
}
