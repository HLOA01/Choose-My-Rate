const GOALS = [
  {
    id: "buy",
    label: "Buy a home",
    description: "Start with basic purchase details, then compare rate and payment choices.",
    testId: "borrower-goal-buy",
  },
  {
    id: "refinance",
    label: "Refinance my mortgage",
    description: "Compare your current mortgage against a possible new loan.",
    testId: "borrower-goal-refinance",
  },
  {
    id: "cash-out",
    label: "Take cash out",
    description: "Estimate cash-out options and how they may change the payment.",
    testId: "borrower-goal-cash-out",
  },
  {
    id: "fha-conventional",
    label: "Compare FHA vs Conventional",
    description: "Use your purchase basics to compare two common loan paths.",
    testId: "borrower-goal-fha-conventional",
  },
];

export function BorrowerGoalLanding({ selectedGoal, onSelectGoal }) {
  return (
    <section className="borrower-goal-landing" data-testid="borrower-goal-landing">
      <div className="borrower-goal-copy">
        <div className="mini-label">Borrower path</div>
        <h1>What would you like to do today?</h1>
        <p>
          We'll show simple rate and payment options first. You can open detailed comparisons if you want more
          information.
        </p>
      </div>

      <div className="borrower-goal-grid" role="list" aria-label="Borrower goals">
        {GOALS.map((goal) => {
          const isSelected = goal.id === selectedGoal;
          return (
            <button
              key={goal.id}
              type="button"
              className={`borrower-goal-card ${isSelected ? "selected" : ""}`}
              data-testid={goal.testId}
              aria-pressed={isSelected}
              onClick={() => onSelectGoal?.(goal.id)}
            >
              <strong>{goal.label}</strong>
              <span>{goal.description}</span>
            </button>
          );
        })}
      </div>

      <p className="borrower-goal-disclosure">
        Estimates only. This is not a loan approval, rates are not locked, and rate options are subject to change.
      </p>
    </section>
  );
}
