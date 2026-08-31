import { BorrowerGoalLanding } from "./BorrowerGoalLanding";

const STEPS = [
  { id: "goal", label: "Goal", testId: "borrower-step-goal" },
  { id: "property", label: "Home basics", testId: "borrower-step-property" },
  { id: "loan", label: "Loan basics", testId: "borrower-step-loan" },
  { id: "monthly-costs", label: "Monthly costs", testId: "borrower-step-monthly-costs" },
  { id: "rate-options", label: "Choose your rate", testId: "borrower-step-rate-options" },
];

const GOAL_LABELS = {
  buy: "Buy a home",
  refinance: "Refinance my mortgage",
  "cash-out": "Take cash out",
  "fha-conventional": "Compare FHA vs Conventional",
};

function formatCurrency(value) {
  if (value === "" || value === null || value === undefined) return "Not entered yet";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Not entered yet";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatPlain(value, fallback = "Not entered yet") {
  return value === "" || value === null || value === undefined ? fallback : String(value);
}

function StepValue({ label, value }) {
  return (
    <div className="borrower-step-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PropertyStep({ scenario, selectedGoal }) {
  const isPurchasePath = selectedGoal === "buy" || selectedGoal === "fha-conventional";

  return (
    <div className="borrower-step-panel" data-testid="borrower-step-property">
      <div>
        <div className="mini-label">Home / property basics</div>
        <h2>{isPurchasePath ? "Tell us about the home purchase" : "Tell us about the property"}</h2>
        <p>These basics help shape the loan option and estimated monthly payment.</p>
      </div>
      <div className="borrower-step-grid">
        <StepValue
          label={isPurchasePath ? "Purchase price" : "Home value"}
          value={formatCurrency(isPurchasePath ? scenario.purchasePrice : scenario.propertyValue)}
        />
        <StepValue label="ZIP code" value={formatPlain(scenario.zipCode)} />
        <StepValue label="Home use" value={formatPlain(scenario.occupancy, "Primary")} />
      </div>
    </div>
  );
}

function LoanStep({ scenario, selectedGoal }) {
  const isPurchasePath = selectedGoal === "buy" || selectedGoal === "fha-conventional";

  return (
    <div className="borrower-step-panel" data-testid="borrower-step-loan">
      <div>
        <div className="mini-label">Loan basics</div>
        <h2>{isPurchasePath ? "Add down payment and credit details" : "Add current loan details"}</h2>
        <p>Use the detail fields below to adjust anything that is missing or needs to be refined.</p>
      </div>
      <div className="borrower-step-grid">
        {isPurchasePath ? (
          <>
            <StepValue label="Down payment" value={formatCurrency(scenario.downPayment)} />
            <StepValue label="Estimated credit score" value={formatPlain(scenario.creditScore)} />
            <StepValue label="Loan program" value={formatPlain(scenario.loanType, "Conventional")} />
          </>
        ) : (
          <>
            <StepValue label="Current balance" value={formatCurrency(scenario.currentLoanBalance)} />
            <StepValue label="New loan amount" value={formatCurrency(scenario.newLoanAmount)} />
            <StepValue label="Estimated credit score" value={formatPlain(scenario.creditScore)} />
          </>
        )}
      </div>
    </div>
  );
}

function MonthlyCostsStep({ scenario }) {
  return (
    <div className="borrower-step-panel" data-testid="borrower-step-monthly-costs">
      <div>
        <div className="mini-label">Monthly costs</div>
        <h2>Review taxes, insurance, and HOA</h2>
        <p>These costs can change the estimated monthly payment and should be reviewed before relying on an option.</p>
      </div>
      <div className="borrower-step-grid">
        <StepValue label="Property taxes" value={formatCurrency(scenario.propertyTaxes || scenario.taxes)} />
        <StepValue label="Homeowners insurance" value={formatCurrency(scenario.homeownersInsurance || scenario.insurance)} />
        <StepValue label="HOA dues" value={formatCurrency(scenario.hoaDues || scenario.hoa)} />
      </div>
    </div>
  );
}

function RateOptionsStep({ hasRateOptions }) {
  return (
    <div className="borrower-step-panel" data-testid="borrower-step-rate-options">
      <div>
        <div className="mini-label">Choose your rate</div>
        <h2>Compare the tradeoff that feels best</h2>
        <p>
          Start with three simple choices, then review the detailed rate table below if you want to compare more.
        </p>
      </div>
      <div className="borrower-rate-choice-list" aria-label="Simple rate choices">
        <span>Lower Payment</span>
        <span>Balanced Option</span>
        <span>Lower Upfront Cost</span>
      </div>
      <p className="borrower-step-note">
        {hasRateOptions
          ? "Your rate cards are available below with estimated monthly payment, points or credit, and cash to close."
          : "Add the basic loan details so your rate cards can appear below."}
      </p>
    </div>
  );
}

export function BorrowerGuidedFlow({
  currentStep,
  hasRateOptions = false,
  onSelectGoal,
  onStepChange,
  scenario,
  selectedGoal,
}) {
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.id === currentStep));
  const activeStep = STEPS[activeIndex] || STEPS[0];
  const canGoBack = activeIndex > 0;
  const canGoNext = activeIndex < STEPS.length - 1;

  const goToStep = (index) => {
    const nextStep = STEPS[index];
    if (nextStep) onStepChange?.(nextStep.id);
  };

  const renderStep = () => {
    if (activeStep.id === "goal") {
      return (
        <div data-testid="borrower-step-goal">
          <BorrowerGoalLanding selectedGoal={selectedGoal} onSelectGoal={onSelectGoal} />
        </div>
      );
    }

    if (activeStep.id === "property") {
      return <PropertyStep scenario={scenario} selectedGoal={selectedGoal} />;
    }

    if (activeStep.id === "loan") {
      return <LoanStep scenario={scenario} selectedGoal={selectedGoal} />;
    }

    if (activeStep.id === "monthly-costs") {
      return <MonthlyCostsStep scenario={scenario} />;
    }

    return <RateOptionsStep hasRateOptions={hasRateOptions} />;
  };

  return (
    <section className="borrower-guided-flow" data-testid="borrower-guided-flow" aria-label="Borrower guided flow">
      <div className="borrower-flow-header">
        <div>
          <div className="mini-label">Guided borrower path</div>
          <h1>Choose your loan path step by step</h1>
        </div>
        <p>
          Current goal: <strong>{GOAL_LABELS[selectedGoal] || "Buy a home"}</strong>
        </p>
      </div>

      <div className="borrower-step-indicator" data-testid="borrower-step-indicator" aria-label="Borrower steps">
        {STEPS.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={`borrower-step-pill ${index === activeIndex ? "active" : ""}`}
            aria-current={index === activeIndex ? "step" : undefined}
            onClick={() => goToStep(index)}
          >
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </div>

      {renderStep()}

      <div className="borrower-flow-actions">
        <button
          type="button"
          className="borrower-flow-button secondary"
          data-testid="borrower-flow-back"
          onClick={() => goToStep(activeIndex - 1)}
          disabled={!canGoBack}
        >
          Back
        </button>
        <button
          type="button"
          className="borrower-flow-button"
          data-testid="borrower-flow-next"
          onClick={() => goToStep(activeIndex + 1)}
          disabled={!canGoNext}
        >
          Next
        </button>
      </div>
    </section>
  );
}
