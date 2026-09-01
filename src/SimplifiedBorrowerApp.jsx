import React, { useMemo, useRef, useState } from "react";
import "./App.css";
import { askSallyApi, hasSallyApi } from "./sallyApi";
import { hasPricingApi, quotePricing } from "./pricingApi";

const APPLICATION_URL =
  import.meta.env.VITE_APPLICATION_URL ||
  import.meta.env.VITE_APPLY_URL ||
  import.meta.env.VITE_LOAN_APPLICATION_URL ||
  "";

const RESTORE_KEY = "chooseMyRate.simpleScenario.v1";

const CREDIT_RANGES = {
  "760+": 780,
  "740-759": 750,
  "720-739": 730,
  "700-719": 710,
  "680-699": 690,
  "660-679": 670,
  "640-659": 650,
};

const INITIAL_SCENARIO = {
  borrowerPath: "purchase",
  homePrice: "",
  downPayment: "",
  propertyValue: "",
  currentMortgageBalance: "",
  refinanceGoal: "lower_payment",
  currentInterestRate: "",
  requestedCashOut: "",
  propertyType: "single_family",
  firstTimeHomebuyer: "no",
  occupancy: "primary",
  creditRange: "740-759",
  zipCode: "",
  annualIncome: "",
};

function cleanNumber(value) {
  return String(value || "").replace(/[^\d.]/g, "");
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatPercent(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(digits)}%`;
}

function formatPoints(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "-";
  if (numeric < 0) return `${formatPercent(Math.abs(numeric))} lender credit`;
  if (numeric > 0) return `${formatPercent(numeric)} points`;
  return "Closest to par";
}

function normalizeLoanType(value) {
  const normalized = String(value || "conventional").toLowerCase();
  if (["fha", "va", "usda", "jumbo", "dscr"].includes(normalized)) return normalized;
  return "conventional";
}

function getLoanAmount(scenario) {
  if (scenario.borrowerPath === "purchase") {
    return Math.max(toNumber(scenario.homePrice) - toNumber(scenario.downPayment), 0);
  }

  if (scenario.refinanceGoal === "cash_out") {
    return Math.max(toNumber(scenario.currentMortgageBalance) + toNumber(scenario.requestedCashOut), 0);
  }

  return toNumber(scenario.currentMortgageBalance);
}

function buildPricingPayload(scenario, loanTypePreference = "conventional") {
  const purchasePrice =
    scenario.borrowerPath === "purchase" ? toNumber(scenario.homePrice) : toNumber(scenario.propertyValue);
  const loanAmount = getLoanAmount(scenario);
  const creditScore = CREDIT_RANGES[scenario.creditRange] || 740;

  return {
    purchasePrice,
    loanAmount,
    creditScore,
    occupancy: scenario.occupancy || "primary",
    loanPurpose:
      scenario.borrowerPath === "purchase"
        ? "purchase"
        : scenario.refinanceGoal === "cash_out"
          ? "cash_out"
          : "refinance",
    loanTypePreference: normalizeLoanType(loanTypePreference),
    propertyType: scenario.propertyType || "single_family",
    zipCode: scenario.zipCode || "",
    downPayment: scenario.borrowerPath === "purchase" ? toNumber(scenario.downPayment) || null : null,
    ltv: purchasePrice && loanAmount ? Number(((loanAmount / purchasePrice) * 100).toFixed(3)) : null,
    language: "en",
  };
}

function getValidationErrors(scenario) {
  const errors = [];

  if (scenario.borrowerPath === "purchase") {
    if (!toNumber(scenario.homePrice)) errors.push("Home price is required.");
    if (!toNumber(scenario.downPayment)) errors.push("Down payment is required.");
  } else {
    if (!toNumber(scenario.propertyValue)) errors.push("Estimated property value is required.");
    if (!toNumber(scenario.currentMortgageBalance)) errors.push("Current mortgage balance is required.");
    if (!toNumber(scenario.currentInterestRate)) errors.push("Current interest rate is required.");
    if (scenario.refinanceGoal === "cash_out" && !toNumber(scenario.requestedCashOut)) {
      errors.push("Requested cash-out amount is required.");
    }
  }

  if (!scenario.propertyType) errors.push("Property type is required.");
  if (!scenario.occupancy) errors.push("Occupancy is required.");
  if (!scenario.creditRange) errors.push("Credit range is required.");
  if (!/^\d{5}$/.test(String(scenario.zipCode || ""))) errors.push("Enter a valid 5-digit ZIP code.");
  if (!toNumber(scenario.annualIncome)) errors.push("Estimated gross annual household income is required.");

  return errors;
}

function optionKey(option) {
  return option?.optionId || `${option?.rate}-${option?.price}-${option?.paymentPI}-${option?.estimatedCashToClose}`;
}

function pickParOption(options) {
  return [...options].sort((left, right) => {
    const leftDistance = Math.abs(Number(left?.price || 0));
    const rightDistance = Math.abs(Number(right?.price || 0));
    return leftDistance - rightDistance || Number(left?.rate || 0) - Number(right?.rate || 0);
  })[0] || null;
}

function readSavedScenario() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESTORE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || !parsed.scenario) return null;
    return { ...INITIAL_SCENARIO, ...parsed.scenario };
  } catch {
    return null;
  }
}

function saveScenario(scenario) {
  const allowed = Object.keys(INITIAL_SCENARIO).reduce((draft, key) => {
    draft[key] = scenario[key] || "";
    return draft;
  }, {});

  window.localStorage.setItem(
    RESTORE_KEY,
    JSON.stringify({
      savedAt: Date.now(),
      scenario: allowed,
    }),
  );
}

function Field({ children, label }) {
  return (
    <label className="simple-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function SimplifiedBorrowerApp() {
  const [scenario, setScenario] = useState(INITIAL_SCENARIO);
  const [savedScenario, setSavedScenario] = useState(() => readSavedScenario());
  const [quote, setQuote] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [pricingState, setPricingState] = useState("idle");
  const [pricingMessage, setPricingMessage] = useState("");
  const [comparison, setComparison] = useState(null);
  const [sallyOpen, setSallyOpen] = useState(true);
  const [sallyInput, setSallyInput] = useState("");
  const [sallyMessages, setSallyMessages] = useState([
    {
      role: "assistant",
      text: "Ask me about your mortgage scenario. I can see the details you enter here.",
    },
  ]);
  const [sallyThinking, setSallyThinking] = useState(false);
  const [tickMuted, setTickMuted] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState("");
  const abortRef = useRef(null);

  const pricingPayload = useMemo(() => buildPricingPayload(scenario), [scenario]);
  const options = Array.isArray(quote?.options) ? quote.options : [];
  const selectedOption = options.find((option) => optionKey(option) === selectedOptionId) || options[0] || null;
  const selectedIndex = Math.max(0, options.findIndex((option) => optionKey(option) === optionKey(selectedOption)));

  const updateScenario = (field, value) => {
    setQuote(null);
    setComparison(null);
    setPricingState("idle");
    setPricingMessage("");
    setHandoffMessage("");
    setScenario((current) => ({
      ...current,
      [field]: [
        "homePrice",
        "downPayment",
        "propertyValue",
        "currentMortgageBalance",
        "currentInterestRate",
        "requestedCashOut",
        "zipCode",
        "annualIncome",
      ].includes(field)
        ? cleanNumber(value)
        : value,
    }));
  };

  const selectOption = (option) => {
    if (!option) return;
    setSelectedOptionId(optionKey(option));

    if (!tickMuted) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 680;
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.06);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.07);
          oscillator.onended = () => context.close();
        }
      } catch {
        // Sound is optional.
      }
    }

    window.navigator.vibrate?.(12);
  };

  const submitPricing = async () => {
    const errors = getValidationErrors(scenario);
    if (errors.length) {
      setPricingState("validation");
      setPricingMessage(errors[0]);
      setQuote(null);
      return;
    }

    if (!hasPricingApi()) {
      setPricingState("error");
      setPricingMessage("Live pricing is not configured yet. Connect the pricing engine before showing rates.");
      setQuote(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPricingState("loading");
    setPricingMessage("Loading live lender options...");
    setQuote(null);

    try {
      const response = await quotePricing(pricingPayload, { signal: controller.signal });
      const responseOptions = Array.isArray(response?.options) ? response.options : [];
      setQuote(response);

      if (!responseOptions.length) {
        setPricingState("empty");
        setPricingMessage(response?.message || "No eligible live pricing options were returned.");
        setSelectedOptionId("");
        return;
      }

      const parOption = pickParOption(responseOptions);
      setSelectedOptionId(optionKey(parOption));
      setPricingState("ready");
      setPricingMessage("Live rate options returned by the pricing engine.");
    } catch (error) {
      if (error.name === "AbortError") return;
      setPricingState("error");
      setPricingMessage("Live pricing is unavailable. No rates are shown until the provider returns options.");
      setQuote(null);
      setSelectedOptionId("");
    }
  };

  const compareFhaConventional = async () => {
    const errors = getValidationErrors({ ...scenario, borrowerPath: "purchase" });
    if (errors.length) {
      setComparison({ status: "validation", message: errors[0] });
      return;
    }

    if (!hasPricingApi()) {
      setComparison({
        status: "error",
        message: "Live pricing is not configured yet. The comparison requires returned lender options.",
      });
      return;
    }

    setComparison({ status: "loading", message: "Loading FHA and Conventional options..." });
    try {
      const [fhaQuote, conventionalQuote] = await Promise.all([
        quotePricing(buildPricingPayload({ ...scenario, borrowerPath: "purchase" }, "fha")),
        quotePricing(buildPricingPayload({ ...scenario, borrowerPath: "purchase" }, "conventional")),
      ]);

      setComparison({
        status: "ready",
        fha: pickParOption(fhaQuote?.options || []),
        conventional: pickParOption(conventionalQuote?.options || []),
      });
    } catch {
      setComparison({
        status: "error",
        message: "Live comparison pricing is unavailable. No comparison rates are invented.",
      });
    }
  };

  const restoreScenario = () => {
    if (!savedScenario) return;
    setScenario(savedScenario);
    setSavedScenario(null);
    setQuote(null);
    setPricingState("idle");
    setPricingMessage("Restored your saved non-identifying scenario.");
  };

  const handleApplication = () => {
    if (!selectedOption) {
      setHandoffMessage("Choose a returned rate option before continuing.");
      return;
    }

    if (!APPLICATION_URL) {
      setHandoffMessage("Application handoff is the next connection step. No application URL is configured yet.");
      return;
    }

    window.location.assign(APPLICATION_URL);
  };

  const askSally = async () => {
    const userText = sallyInput.trim();
    if (!userText || sallyThinking) return;

    const history = [...sallyMessages, { role: "user", text: userText }];
    setSallyMessages(history);
    setSallyInput("");
    setSallyThinking(true);

    if (!hasSallyApi()) {
      setSallyMessages([
        ...history,
        {
          role: "assistant",
          text: "I can see your current scenario here. Ask about payment tradeoffs, cash to close, or whether Purchase or Refinance fits your goal.",
        },
      ]);
      setSallyThinking(false);
      return;
    }

    try {
      const response = await askSallyApi({
        userMessage: userText,
        currentScenario: {
          ...scenario,
          pricingPayload,
          selectedRate: selectedOption || null,
        },
        conversationHistory: history.map((message) => ({
          role: message.role,
          content: message.text,
        })),
        pricingOptions: options,
        localResult: null,
      });
      setSallyMessages([
        ...history,
        {
          role: "assistant",
          text: response.replyText || "Got it. I can help explain the returned options.",
        },
      ]);
    } catch {
      setSallyMessages([
        ...history,
        {
          role: "assistant",
          text: "Sally is temporarily unavailable. Your scenario details remain here, and no rates are invented.",
        },
      ]);
    } finally {
      setSallyThinking(false);
    }
  };

  const startDictation = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setSallyInput(transcript);
    };
    recognition.start();
  };

  const purchaseFields = (
    <>
      <Field label="Home price">
        <input data-testid="home-price" value={scenario.homePrice} onChange={(event) => updateScenario("homePrice", event.target.value)} />
      </Field>
      <Field label="Down payment">
        <input data-testid="down-payment" value={scenario.downPayment} onChange={(event) => updateScenario("downPayment", event.target.value)} />
      </Field>
      <Field label="First-time homebuyer">
        <select value={scenario.firstTimeHomebuyer} onChange={(event) => updateScenario("firstTimeHomebuyer", event.target.value)}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="not_sure">Not sure</option>
        </select>
      </Field>
    </>
  );

  const refinanceFields = (
    <>
      <Field label="Estimated property value">
        <input data-testid="property-value" value={scenario.propertyValue} onChange={(event) => updateScenario("propertyValue", event.target.value)} />
      </Field>
      <Field label="Current mortgage balance">
        <input data-testid="current-balance" value={scenario.currentMortgageBalance} onChange={(event) => updateScenario("currentMortgageBalance", event.target.value)} />
      </Field>
      <Field label="Refinance goal">
        <select data-testid="refinance-goal" value={scenario.refinanceGoal} onChange={(event) => updateScenario("refinanceGoal", event.target.value)}>
          <option value="lower_payment">Lower payment</option>
          <option value="shorter_term">Shorter term</option>
          <option value="cash_out">Cash out</option>
          <option value="debt_consolidation">Debt consolidation</option>
        </select>
      </Field>
      <Field label="Current interest rate">
        <input data-testid="current-rate" value={scenario.currentInterestRate} onChange={(event) => updateScenario("currentInterestRate", event.target.value)} />
      </Field>
      {scenario.refinanceGoal === "cash_out" ? (
        <Field label="Requested cash-out amount">
          <input data-testid="cash-out-amount" value={scenario.requestedCashOut} onChange={(event) => updateScenario("requestedCashOut", event.target.value)} />
        </Field>
      ) : null}
    </>
  );

  return (
    <main className="simple-cmr-page" data-testid="app-shell">
      <section className="simple-hero">
        <div>
          <div className="simple-brand-title">CHOOSE MY RATE</div>
          <p className="simple-brand-subtitle">Powered by Home Lenders of America.</p>
        </div>
        <div className="simple-hero-copy">
          <h1>See live mortgage rate options, then continue to your application.</h1>
          <p>Enter a short scenario. Choose My Rate shows only options returned by the pricing engine.</p>
        </div>
      </section>

      <section className={`simple-sally ${sallyOpen ? "open" : "closed"}`} data-testid="sally-card">
        <div className="simple-sally-topline">
          <div>
            <span className="simple-red-dot" />
            <strong>Ask Sally.</strong>
            <span>Sally sees your current mortgage scenario.</span>
          </div>
          <button type="button" className="simple-ghost-button" onClick={() => setSallyOpen((current) => !current)}>
            {sallyOpen ? "Close" : "Open"}
          </button>
        </div>
        {sallyOpen ? (
          <>
            <div className="simple-sally-messages" data-testid="sally-messages">
              {sallyMessages.slice(-2).map((message, index) => (
                <p key={`${message.role}-${index}`} className={`simple-sally-message ${message.role}`}>
                  {message.text}
                </p>
              ))}
              {sallyThinking ? <p className="simple-sally-message assistant">Sally is thinking...</p> : null}
            </div>
            <div className="simple-sally-composer" data-testid="sally-composer">
              <button type="button" aria-label="Add context" className="simple-composer-icon">
                +
              </button>
              <input
                aria-label="Ask Sally"
                value={sallyInput}
                onChange={(event) => setSallyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") askSally();
                }}
                placeholder="Ask about your rate options..."
              />
              <button type="button" aria-label="Use microphone" className="simple-composer-icon" onClick={startDictation}>
                Mic
              </button>
              <button type="button" className="simple-send-button" onClick={askSally}>
                Send
              </button>
            </div>
          </>
        ) : null}
      </section>

      {savedScenario ? (
        <section className="simple-restore" data-testid="saved-scenario-restore">
          <div>
            <strong>Saved scenario found</strong>
            <span>Only non-identifying mortgage comparison fields are stored on this browser.</span>
          </div>
          <button type="button" onClick={restoreScenario}>
            Restore
          </button>
        </section>
      ) : null}

      <section className="simple-layout">
        <section className="simple-panel" data-testid="scenario-panel">
          <div className="simple-step">Step 1</div>
          <h2>Choose your loan path</h2>
          <div className="simple-path-toggle" data-testid="path-toggle">
            <button type="button" className={scenario.borrowerPath === "purchase" ? "active" : ""} onClick={() => updateScenario("borrowerPath", "purchase")}>
              Purchase
            </button>
            <button type="button" className={scenario.borrowerPath === "refinance" ? "active" : ""} onClick={() => updateScenario("borrowerPath", "refinance")}>
              Refinance
            </button>
          </div>

          <div className="simple-form-grid" data-testid={`${scenario.borrowerPath}-form`}>
            {scenario.borrowerPath === "purchase" ? purchaseFields : refinanceFields}
            <Field label="Property type">
              <select data-testid="property-type" value={scenario.propertyType} onChange={(event) => updateScenario("propertyType", event.target.value)}>
                <option value="single_family">Single family</option>
                <option value="condo">Condo</option>
                <option value="townhome">Townhome</option>
                <option value="multi_unit">2-4 unit</option>
              </select>
            </Field>
            <Field label="Occupancy / property use">
              <select data-testid="occupancy" value={scenario.occupancy} onChange={(event) => updateScenario("occupancy", event.target.value)}>
                <option value="primary">Primary residence</option>
                <option value="second_home">Second home</option>
                <option value="investment">Investment property</option>
              </select>
            </Field>
            <Field label="Credit range">
              <select data-testid="credit-range" value={scenario.creditRange} onChange={(event) => updateScenario("creditRange", event.target.value)}>
                {Object.keys(CREDIT_RANGES).map((range) => (
                  <option key={range} value={range}>{range}</option>
                ))}
              </select>
            </Field>
            <Field label="ZIP code">
              <input data-testid="zip-code" value={scenario.zipCode} maxLength={5} onChange={(event) => updateScenario("zipCode", event.target.value)} />
            </Field>
            <Field label="Estimated gross annual household income">
              <input data-testid="annual-income" value={scenario.annualIncome} onChange={(event) => updateScenario("annualIncome", event.target.value)} />
            </Field>
          </div>

          <div className="simple-scenario-summary" data-testid="payload-summary">
            <span>Pricing request preview</span>
            <strong>{formatCurrency(pricingPayload.loanAmount)} loan amount</strong>
            <small>{pricingPayload.loanPurpose} / {pricingPayload.zipCode || "ZIP needed"}</small>
          </div>

          {pricingState === "validation" ? <div className="simple-validation" data-testid="validation-message">{pricingMessage}</div> : null}

          <div className="simple-action-row">
            <button type="button" className="simple-primary-button" data-testid="submit-scenario" onClick={submitPricing}>
              View Live Rates
            </button>
            <button
              type="button"
              className="simple-secondary-button"
              data-testid="save-scenario"
              onClick={() => {
                saveScenario(scenario);
                setSavedScenario(readSavedScenario());
              }}
            >
              Save Scenario
            </button>
          </div>
        </section>

        <section className="simple-panel simple-rate-panel" data-testid="rate-panel">
          <div className="simple-step gold">Step 2</div>
          <h2>Choose your rate</h2>
          <p className="simple-secondary">Gold marks the active returned lender option. The control moves only through returned options.</p>

          <div className={`simple-pricing-status ${pricingState}`} data-testid="pricing-status">
            {pricingMessage || "Submit a complete scenario to request live pricing."}
          </div>

          {pricingState === "loading" ? <div className="simple-loading-bar" data-testid="loading-state" /> : null}

          {options.length > 0 ? (
            <>
              <div className="simple-selected-rate" data-testid="selected-rate-card">
                <div>
                  <span>Interest rate</span>
                  <strong data-testid="selected-rate">{formatPercent(selectedOption?.rate)}</strong>
                </div>
                <div>
                  <span>Monthly principal and interest</span>
                  <strong data-testid="selected-payment">{formatCurrency(selectedOption?.paymentPI)}</strong>
                </div>
                <div>
                  <span>Points or lender credit</span>
                  <strong data-testid="selected-points">{formatPoints(selectedOption?.price)}</strong>
                </div>
                <div>
                  <span>Estimated cash to close</span>
                  <strong data-testid="selected-cash">{formatCurrency(selectedOption?.estimatedCashToClose)}</strong>
                </div>
              </div>

              <div className="simple-rate-wheel" data-testid="rate-wheel">
                <input
                  aria-label="Rate wheel"
                  type="range"
                  min="0"
                  max={Math.max(options.length - 1, 0)}
                  value={selectedIndex}
                  onChange={(event) => selectOption(options[Number(event.target.value)])}
                />
                <div className="simple-rate-ticks">
                  {options.map((option) => (
                    <button
                      key={optionKey(option)}
                      type="button"
                      className={optionKey(option) === optionKey(selectedOption) ? "active" : ""}
                      onClick={() => selectOption(option)}
                    >
                      {formatPercent(option.rate, 3)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="simple-sound-toggle">
                <input type="checkbox" checked={tickMuted} onChange={(event) => setTickMuted(event.target.checked)} />
                Silence tick sound
              </label>

              <div className="simple-rate-options" data-testid="rate-options">
                {options.map((option) => (
                  <button
                    key={optionKey(option)}
                    type="button"
                    className={`simple-rate-option ${optionKey(option) === optionKey(selectedOption) ? "selected" : ""}`}
                    onClick={() => selectOption(option)}
                  >
                    <strong>{formatPercent(option.rate)}</strong>
                    <span>{formatCurrency(option.paymentPI)} P&I</span>
                    <span>{formatPoints(option.price)}</span>
                  </button>
                ))}
              </div>

              <button type="button" className="simple-primary-button application" data-testid="application-cta" onClick={handleApplication}>
                Continue to Application
              </button>
              {handoffMessage ? <div className="simple-safe-message">{handoffMessage}</div> : null}
            </>
          ) : null}

          {pricingState === "empty" ? <div className="simple-empty" data-testid="empty-results">No returned lender options are available for this scenario.</div> : null}
          {pricingState === "error" ? <div className="simple-error" data-testid="pricing-error">{pricingMessage}</div> : null}

          <div className="simple-comparison" data-testid="comparison-box">
            <div>
              <h3>FHA versus Conventional</h3>
              <p>Compare two loan paths only with returned live pricing options.</p>
            </div>
            <button type="button" className="simple-secondary-button" onClick={compareFhaConventional}>Compare</button>
            {comparison ? (
              <div className={`simple-comparison-result ${comparison.status}`} data-testid="comparison-result">
                {comparison.status === "ready" ? (
                  <>
                    <div>
                      <span>FHA</span>
                      <strong>{formatPercent(comparison.fha?.rate)}</strong>
                      <small>{formatCurrency(comparison.fha?.paymentPI)} P&I</small>
                    </div>
                    <div>
                      <span>Conventional</span>
                      <strong>{formatPercent(comparison.conventional?.rate)}</strong>
                      <small>{formatCurrency(comparison.conventional?.paymentPI)} P&I</small>
                    </div>
                  </>
                ) : (
                  comparison.message
                )}
              </div>
            ) : null}
          </div>

          <p className="simple-disclosure" data-testid="disclosure">
            Displayed pricing is not a loan approval, commitment, or rate lock. Rates, points, lender credits,
            payments, and cash-to-close estimates are subject to change. Principal and interest are shown only when
            returned by the pricing engine; taxes, insurance, mortgage insurance, APR, and fees are not presented as
            complete unless the provider supplies them.
          </p>
        </section>
      </section>
    </main>
  );
}
