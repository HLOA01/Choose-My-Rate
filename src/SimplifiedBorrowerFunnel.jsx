import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { askSallyApi, hasSallyApi } from "./sallyApi";
import { hasPricingApi, quotePricing } from "./pricingApi";

const APPLICATION_URL =
  import.meta.env.VITE_APPLICATION_URL ||
  import.meta.env.VITE_APPLY_URL ||
  import.meta.env.VITE_LOAN_APPLICATION_URL ||
  "";

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

const CLOSING_COST_DISCLOSURE_VERSION = "closing-cost-prelim-v1";
const COST_DISCLOSURE =
  "Estimated closing costs do not include down payment, prepaid interest, property taxes, homeowners insurance, mortgage insurance, HOA dues, or initial escrow deposits. Final amounts are determined after application and verification.";

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

function getBorrowerQuote(option) {
  return option?.borrowerQuote || null;
}

function getQuotePricingOption(option) {
  return getBorrowerQuote(option)?.pricingOption || null;
}

function getClosingCostEstimate(option) {
  return getBorrowerQuote(option)?.closingCostEstimate || null;
}

function getEstimatedClosingCharges(option) {
  const value = getBorrowerQuote(option)?.estimatedClosingCharges;
  if (value == null) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function formatRateAdjustment(option) {
  const pricingOption = getQuotePricingOption(option);
  if (!pricingOption) return { label: "Unavailable", className: "unavailable" };

  if (Number(pricingOption.lenderCreditDollars) > 0) {
    return {
      label: `\u2212${formatCurrency(pricingOption.lenderCreditDollars)} Lender credit (${formatPercent(pricingOption.lenderCreditPercent)})`,
      className: "credit",
    };
  }

  if (Number(pricingOption.pointsDollars) > 0) {
    return {
      label: `+${formatCurrency(pricingOption.pointsDollars)} Discount points (${formatPercent(pricingOption.pointsPercent)})`,
      className: "points",
    };
  }

  return { label: "No discount points or lender credit", className: "neutral" };
}

function formatEstimatedClosingCharges(option) {
  const charges = getEstimatedClosingCharges(option);
  return charges == null ? "Unavailable" : formatCurrency(charges);
}

function getPublicClosingCostStatusText(option) {
  const estimate = getClosingCostEstimate(option);
  if (!estimate) return "Closing-cost estimate was not returned.";
  if (estimate.status === "estimate_unavailable") {
    return "Estimated closing costs are unavailable until an approved HLOA fee schedule is connected.";
  }
  if (estimate.status === "estimate_incomplete") {
    return "Estimated using the currently configured fee items.";
  }
  return "Estimated using the current fee schedule.";
}

function getClosingCostCardValue(option) {
  const estimate = getClosingCostEstimate(option);
  if (!estimate || estimate.status === "estimate_unavailable") return "Unavailable";
  return formatEstimatedClosingCharges(option);
}

function getClosingCostEquation(option) {
  const pricingOption = getQuotePricingOption(option);
  const estimate = getClosingCostEstimate(option);
  const estimatedClosingCharges = getEstimatedClosingCharges(option);

  if (!pricingOption || !estimate || estimate.estimatedBaseClosingCosts == null || estimatedClosingCharges == null) {
    return null;
  }

  const parts = [
    { label: "Base closing costs", value: formatCurrency(estimate.estimatedBaseClosingCosts), className: "base" },
  ];

  if (Number(pricingOption.pointsDollars) > 0) {
    parts.push({
      label: "Discount points",
      value: `+${formatCurrency(pricingOption.pointsDollars)}`,
      className: "points",
    });
  }

  if (Number(pricingOption.lenderCreditDollars) > 0) {
    parts.push({
      label: "Lender credit",
      value: `\u2212${formatCurrency(pricingOption.lenderCreditDollars)}`,
      className: "credit",
    });
  }

  return {
    parts,
    total: formatCurrency(estimatedClosingCharges),
  };
}

function pickParOption(options) {
  return [...options].sort((left, right) => {
    const leftDistance = Math.abs(Number(left?.price || 0));
    const rightDistance = Math.abs(Number(right?.price || 0));
    return leftDistance - rightDistance || Number(left?.rate || 0) - Number(right?.rate || 0);
  })[0] || null;
}

function formatRefinanceGoal(value) {
  const labels = {
    lower_payment: "Lower payment",
    shorter_term: "Shorter term",
    cash_out: "Cash out",
    debt_consolidation: "Debt consolidation",
  };
  return labels[value] || "Refinance";
}

function getDownPaymentPercent(scenario) {
  const homePrice = toNumber(scenario.homePrice);
  const downPayment = toNumber(scenario.downPayment);
  if (!homePrice || !downPayment) return "";
  return `${Math.round((downPayment / homePrice) * 1000) / 10}% down`;
}

function getScenarioSummary(scenario) {
  if (scenario.borrowerPath === "purchase") {
    return [
      "Purchase",
      `${formatCurrency(scenario.homePrice)} home`,
      getDownPaymentPercent(scenario),
      scenario.zipCode ? `ZIP ${scenario.zipCode}` : "",
    ].filter(Boolean).join(" · ");
  }
  return [
    formatRefinanceGoal(scenario.refinanceGoal),
    `${formatCurrency(scenario.propertyValue)} value`,
    `${formatCurrency(getLoanAmount(scenario))} loan`,
    scenario.zipCode ? `ZIP ${scenario.zipCode}` : "",
  ].filter(Boolean).join(" · ");
}

function Field({ children, label }) {
  return (
    <label className="simple-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function IconButton({ children, label, onClick, disabled = false }) {
  return (
    <button type="button" className="simple-icon-button" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V20h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 11Z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4a1 1 0 0 1 .7.29l5 5a1 1 0 0 1-1.4 1.42L13 7.41V19a1 1 0 1 1-2 0V7.41l-3.3 3.3a1 1 0 0 1-1.4-1.42l5-5A1 1 0 0 1 12 4Z" />
    </svg>
  );
}

function SpeakerIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9a2 2 0 0 1 2-2h3l4-3a1 1 0 0 1 1.6.8v14.4a1 1 0 0 1-1.6.8l-4-3H6a2 2 0 0 1-2-2V9Z" />
      {muted ? (
        <path d="M18.3 8.3a1 1 0 0 1 1.4 0L21 9.6l1.3-1.3a1 1 0 0 1 1.4 1.4L22.4 11l1.3 1.3a1 1 0 0 1-1.4 1.4L21 12.4l-1.3 1.3a1 1 0 0 1-1.4-1.4l1.3-1.3-1.3-1.3a1 1 0 0 1 0-1.4Z" />
      ) : (
        <path d="M18 8.2a1 1 0 0 1 1.4 0 5.4 5.4 0 0 1 0 7.6A1 1 0 0 1 18 14.4a3.4 3.4 0 0 0 0-4.8 1 1 0 0 1 0-1.4Z" />
      )}
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7h10v10H7z" />
    </svg>
  );
}

function nextMissingPrompt(nextScenario) {
  if (nextScenario.borrowerPath === "purchase") {
    if (!nextScenario.zipCode) return { testId: "zip-code", text: "What ZIP code is the home in?" };
    if (!toNumber(nextScenario.homePrice)) return { testId: "home-price", text: "What purchase price should we use?" };
    if (!toNumber(nextScenario.downPayment)) return { testId: "down-payment", text: "How much do you plan to put down?" };
  } else {
    if (!nextScenario.zipCode) return { testId: "zip-code", text: "What ZIP code is the property in?" };
    if (!toNumber(nextScenario.propertyValue)) return { testId: "property-value", text: "What is the estimated property value?" };
    if (!toNumber(nextScenario.currentMortgageBalance)) {
      return { testId: "current-balance", text: "What is the current mortgage balance?" };
    }
    if (!toNumber(nextScenario.currentInterestRate)) return { testId: "current-rate", text: "What is your current interest rate?" };
  }
  if (!toNumber(nextScenario.annualIncome)) return { testId: "annual-income", text: "What is your estimated gross annual household income?" };
  return { testId: "submit-scenario", text: "You can review your details and request live rates when you are ready." };
}

function detectMortgageIntent(text) {
  const normalized = text.toLowerCase();
  if (/\b(refinance|refi|lower my mortgage payment|lower payment)\b/.test(normalized)) return "refinance";
  if (/\b(buy|purchase|purchasing)\b/.test(normalized) && /\b(home|house|property)\b/.test(normalized)) return "purchase";
  return null;
}

export default function SimplifiedBorrowerFunnel() {
  const [scenario, setScenario] = useState(INITIAL_SCENARIO);
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [pricingState, setPricingState] = useState("idle");
  const [pricingMessage, setPricingMessage] = useState("");
  const [comparison, setComparison] = useState(null);
  const [sallyInput, setSallyInput] = useState("");
  const [sallyMessages, setSallyMessages] = useState([]);
  const [sallyThinking, setSallyThinking] = useState(false);
  const [dictationState, setDictationState] = useState("idle");
  const [dictationTranscript, setDictationTranscript] = useState("");
  const [dictationMessage, setDictationMessage] = useState("");
  const [waveformLevels, setWaveformLevels] = useState([0.28, 0.54, 0.36, 0.7, 0.44]);
  const [playingMessageId, setPlayingMessageId] = useState("");
  const [newMessageNotice, setNewMessageNotice] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [handoffMessage, setHandoffMessage] = useState("");
  const [pendingFocus, setPendingFocus] = useState("");
  const touchStartRef = useRef(null);
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const messagesRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const pricingPayload = useMemo(() => buildPricingPayload(scenario), [scenario]);
  const options = Array.isArray(quote?.options) ? quote.options : [];
  const selectedOption = options.find((option) => optionKey(option) === selectedOptionId) || options[0] || null;
  const selectedIndex = Math.max(0, options.findIndex((option) => optionKey(option) === optionKey(selectedOption)));
  const previousOption = selectedIndex > 0 ? options[selectedIndex - 1] : null;
  const nextOption = selectedIndex < options.length - 1 ? options[selectedIndex + 1] : null;
  const isResults = pricingState === "ready" && options.length > 0;
  const selectedBorrowerQuote = getBorrowerQuote(selectedOption);
  const selectedRateAdjustment = formatRateAdjustment(selectedOption);
  const closingCostEquation = getClosingCostEquation(selectedOption);
  const canDictate =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSpeak = typeof window !== "undefined" && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);

  const stopDictationResources = () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.stop?.();
      recognitionRef.current = null;
    }
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
  };

  const stopPlayback = () => {
    window.speechSynthesis?.cancel?.();
    setPlayingMessageId("");
  };

  useEffect(() => () => {
    stopDictationResources();
    window.speechSynthesis?.cancel?.();
  }, []);

  useEffect(() => {
    if (!pendingFocus) return;
    window.setTimeout(() => {
      document.querySelector(`[data-testid="${pendingFocus}"]`)?.focus?.();
      setPendingFocus("");
    }, 0);
  }, [pendingFocus]);

  useEffect(() => {
    const viewport = messagesRef.current;
    if (!viewport || !sallyMessages.length) return;
    if (shouldAutoScrollRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
      setNewMessageNotice(false);
    } else {
      setNewMessageNotice(true);
    }
  }, [sallyMessages]);

  const addSallyMessage = (message) => {
    setSallyMessages((current) => [
      ...current,
      { id: `sally-${Date.now()}-${current.length}`, role: "assistant", text: message },
    ]);
  };

  const addBorrowerMessage = (message) => {
    setSallyMessages((current) => [
      ...current,
      { id: `borrower-${Date.now()}-${current.length}`, role: "borrower", text: message },
    ]);
  };

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

  const choosePath = (borrowerPath) => {
    updateScenario("borrowerPath", borrowerPath);
    setStep(1);
  };

  const playTick = () => {
    if (!soundOn) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 700;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.025, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.055);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.065);
        oscillator.onended = () => context.close();
      }
    } catch {
      // Sound is optional.
    }
  };

  const selectOption = (option) => {
    if (!option) return;
    if (optionKey(option) === selectedOptionId) return;
    setSelectedOptionId(optionKey(option));
    playTick();
    window.navigator.vibrate?.(12);
  };

  const moveRate = (direction) => {
    const nextIndex = Math.min(Math.max(selectedIndex + direction, 0), options.length - 1);
    selectOption(options[nextIndex]);
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
      setPricingMessage("Live rates are not configured yet. No rates are shown until the connection is ready.");
      setQuote(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPricingState("loading");
    setPricingMessage("Looking up live rates...");
    setQuote(null);

    try {
      const response = await quotePricing(pricingPayload, { signal: controller.signal });
      const responseOptions = Array.isArray(response?.options) ? response.options : [];
      setQuote(response);
      if (!responseOptions.length) {
        setPricingState("empty");
        setPricingMessage(response?.message || "No live rate options are available for this scenario.");
        setSelectedOptionId("");
        return;
      }
      const parOption = pickParOption(responseOptions);
      setSelectedOptionId(optionKey(parOption));
      setPricingState("ready");
      setPricingMessage("Your live rate options are ready.");
    } catch (error) {
      if (error.name === "AbortError") return;
      setPricingState("error");
      setPricingMessage("Live rates are unavailable right now. No rates are shown until live options are available.");
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
      setComparison({ status: "error", message: "Live rates are not configured yet, so this comparison cannot be shown." });
      return;
    }

    setComparison({ status: "loading", message: "Comparing live options..." });
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
      setComparison({ status: "error", message: "The comparison is unavailable right now. No rates are estimated or filled in." });
    }
  };

  const handleApplication = () => {
    if (!selectedOption) {
      setHandoffMessage("Choose a rate option before continuing.");
      return;
    }
    const handoff = {
      scenario,
      pricingPayload,
      selectedOptionId: selectedOption.optionId,
      pricingAsOf: quote?.pricingAsOf || selectedBorrowerQuote?.closingCostEstimate?.asOf || null,
      selectedRate: selectedOption.rate,
      pointsPercent: selectedBorrowerQuote?.pricingOption?.pointsPercent ?? null,
      pointsDollars: selectedBorrowerQuote?.pricingOption?.pointsDollars ?? null,
      lenderCreditPercent: selectedBorrowerQuote?.pricingOption?.lenderCreditPercent ?? null,
      lenderCreditDollars: selectedBorrowerQuote?.pricingOption?.lenderCreditDollars ?? null,
      closingCostEstimateVersion: selectedBorrowerQuote?.closingCostEstimate?.feeScheduleVersion ?? null,
      estimatedClosingCharges: selectedBorrowerQuote?.estimatedClosingCharges ?? null,
      disclosureVersionAccepted: CLOSING_COST_DISCLOSURE_VERSION,
    };
    window.sessionStorage?.setItem("chooseMyRate.applicationHandoff.v1", JSON.stringify(handoff));
    if (!APPLICATION_URL) {
      setHandoffMessage("Application handoff is not configured yet. Your selected rate stays here.");
      return;
    }
    window.location.assign(APPLICATION_URL);
  };

  const askSally = async () => {
    const userText = sallyInput.trim();
    if (!userText || sallyThinking) return;
    setSallyInput("");
    addBorrowerMessage(userText);
    stopPlayback();

    const intent = detectMortgageIntent(userText);
    if (intent) {
      const nextScenario = { ...scenario, borrowerPath: intent };
      const nextPrompt = nextMissingPrompt(nextScenario);
      setScenario(nextScenario);
      setStep(nextPrompt.testId === "annual-income" || nextPrompt.testId === "submit-scenario" ? 2 : 1);
      setPendingFocus(nextPrompt.testId);
      addSallyMessage(
        intent === "purchase"
          ? `Great--let's look at purchase options. ${nextPrompt.text}`
          : `Great--let's look at refinance options. ${nextPrompt.text}`,
      );
      return;
    }

    setSallyThinking(true);

    if (!hasSallyApi()) {
      addSallyMessage("I can help compare principal-and-interest payment, upfront cost, and lender credit using the scenario on this page.");
      setSallyThinking(false);
      return;
    }

    try {
      const response = await askSallyApi({
        userMessage: userText,
        currentScenario: { ...scenario, pricingPayload, selectedRate: selectedOption || null },
        conversationHistory: sallyMessages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.text,
        })).concat({ role: "user", content: userText }),
        pricingOptions: options,
        localResult: null,
      });
      addSallyMessage(response.replyText || "I can help explain the option you selected.");
    } catch {
      addSallyMessage("Sally is temporarily unavailable. Your rate options and application step remain available.");
    } finally {
      setSallyThinking(false);
    }
  };

  const startWaveform = (stream) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.fftSize = 64;
    source.connect(analyser);
    audioContextRef.current = context;

    const draw = () => {
      analyser.getByteTimeDomainData(data);
      const average = data.reduce((sum, value) => sum + Math.abs(value - 128), 0) / data.length;
      const level = Math.min(Math.max(average / 32, 0.2), 1);
      setWaveformLevels([0.34, 0.58, 0.42, 0.74, 0.5].map((seed, index) => Math.min(1, Math.max(0.18, seed * level + index * 0.035))));
      animationFrameRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  };

  const startDictation = async () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setDictationMessage("Speech recognition is not available in this browser. You can still type your question.");
      return;
    }

    stopDictationResources();
    setDictationState("listening");
    setDictationTranscript("");
    setDictationMessage("");

    try {
      if (window.navigator.mediaDevices?.getUserMedia) {
        const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        startWaveform(stream);
      }
    } catch {
      setWaveformLevels([0.3, 0.65, 0.4, 0.8, 0.48]);
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      setDictationTranscript(transcript);
    };
    recognition.onerror = () => {
      setDictationMessage("Dictation stopped. You can type your question or try the microphone again.");
      setDictationState("idle");
      stopDictationResources();
    };
    recognition.onend = () => {
      if (dictationState === "listening") {
        setDictationState("reviewing");
      }
    };
    recognition.start();
  };

  const cancelDictation = () => {
    setDictationTranscript("");
    setDictationState("idle");
    stopDictationResources();
  };

  const finishDictation = () => {
    setSallyInput(dictationTranscript.trim());
    setDictationState("idle");
    stopDictationResources();
  };

  const handleMessagesScroll = () => {
    const viewport = messagesRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 24;
    if (shouldAutoScrollRef.current) setNewMessageNotice(false);
  };

  const playSallyResponse = (message) => {
    if (!canSpeak) return;
    if (playingMessageId === message.id) {
      stopPlayback();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(message.text);
    utterance.onend = () => setPlayingMessageId("");
    utterance.onerror = () => setPlayingMessageId("");
    try {
      setPlayingMessageId(message.id);
      window.speechSynthesis.speak(utterance);
    } catch {
      setPlayingMessageId("");
    }
  };

  const propertyGroup = scenario.borrowerPath === "purchase" ? (
    <>
      <Field label="Home price"><input data-testid="home-price" value={scenario.homePrice} onChange={(event) => updateScenario("homePrice", event.target.value)} /></Field>
      <Field label="Down payment"><input data-testid="down-payment" value={scenario.downPayment} onChange={(event) => updateScenario("downPayment", event.target.value)} /></Field>
      <Field label="ZIP code"><input data-testid="zip-code" value={scenario.zipCode} maxLength={5} onChange={(event) => updateScenario("zipCode", event.target.value)} /></Field>
      <Field label="Property type">
        <select data-testid="property-type" value={scenario.propertyType} onChange={(event) => updateScenario("propertyType", event.target.value)}>
          <option value="single_family">Single family</option>
          <option value="condo">Condo</option>
          <option value="townhome">Townhome</option>
          <option value="multi_unit">2-4 unit</option>
        </select>
      </Field>
    </>
  ) : (
    <>
      <Field label="Estimated property value"><input data-testid="property-value" value={scenario.propertyValue} onChange={(event) => updateScenario("propertyValue", event.target.value)} /></Field>
      <Field label="Current mortgage balance"><input data-testid="current-balance" value={scenario.currentMortgageBalance} onChange={(event) => updateScenario("currentMortgageBalance", event.target.value)} /></Field>
      <Field label="Refinance goal">
        <select data-testid="refinance-goal" value={scenario.refinanceGoal} onChange={(event) => updateScenario("refinanceGoal", event.target.value)}>
          <option value="lower_payment">Lower payment</option>
          <option value="shorter_term">Shorter term</option>
          <option value="cash_out">Cash out</option>
          <option value="debt_consolidation">Debt consolidation</option>
        </select>
      </Field>
      <Field label="Current interest rate"><input data-testid="current-rate" value={scenario.currentInterestRate} onChange={(event) => updateScenario("currentInterestRate", event.target.value)} /></Field>
      {scenario.refinanceGoal === "cash_out" ? (
        <Field label="Requested cash-out amount"><input data-testid="cash-out-amount" value={scenario.requestedCashOut} onChange={(event) => updateScenario("requestedCashOut", event.target.value)} /></Field>
      ) : null}
      <Field label="ZIP code"><input data-testid="zip-code" value={scenario.zipCode} maxLength={5} onChange={(event) => updateScenario("zipCode", event.target.value)} /></Field>
    </>
  );

  const borrowerBasics = (
    <>
      <Field label="Credit range">
        <select data-testid="credit-range" value={scenario.creditRange} onChange={(event) => updateScenario("creditRange", event.target.value)}>
          {Object.keys(CREDIT_RANGES).map((range) => <option key={range} value={range}>{range}</option>)}
        </select>
      </Field>
      <Field label="Occupancy / property use">
        <select data-testid="occupancy" value={scenario.occupancy} onChange={(event) => updateScenario("occupancy", event.target.value)}>
          <option value="primary">Primary residence</option>
          <option value="second_home">Second home</option>
          <option value="investment">Investment property</option>
        </select>
      </Field>
      {scenario.borrowerPath === "purchase" ? (
        <Field label="First-time homebuyer">
          <select data-testid="first-time-homebuyer" value={scenario.firstTimeHomebuyer} onChange={(event) => updateScenario("firstTimeHomebuyer", event.target.value)}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not_sure">Not sure</option>
          </select>
        </Field>
      ) : null}
      <Field label="Estimated gross annual household income"><input data-testid="annual-income" value={scenario.annualIncome} onChange={(event) => updateScenario("annualIncome", event.target.value)} /></Field>
    </>
  );

  return (
    <main className="simple-cmr-page revised" data-testid="app-shell">
      <header className="simple-header" data-testid="header-composer">
        <div className="simple-brand-block">
          <div className="simple-brand-title">CHOOSE MY RATE</div>
          <p className="simple-brand-subtitle">Powered by Home Lenders of America</p>
        </div>
        <div className="simple-header-copy">
          <h1>Choose your mortgage rate.</h1>
          <p>See the rate, payment, and upfront cost--then choose what works for you.</p>
        </div>
      </header>

      <section className="simple-sally-composer-card" data-testid="sally-card">
        <span className="simple-sally-label"><span className="simple-sally-dot" />Need help? Ask Sally</span>
        <div className="simple-sally-composer" data-testid="sally-composer">
          <IconButton label="Add context">+</IconButton>
          {dictationState === "listening" || dictationState === "reviewing" ? (
            <div
              className="simple-listening-state"
              data-testid="dictation-state"
              role="status"
              aria-live="polite"
              aria-label={dictationState === "listening" ? "Listening for your question" : "Review dictated question"}
            >
              <div className="simple-waveform" aria-hidden="true" data-testid="dictation-waveform">
                {waveformLevels.map((level, index) => (
                  <span key={index} style={{ "--level": level }} />
                ))}
              </div>
              <span>{dictationState === "listening" ? "Listening..." : dictationTranscript || "Ready to finish dictation"}</span>
              <button type="button" onClick={cancelDictation}>Cancel</button>
              <button type="button" onClick={finishDictation}>Finish</button>
            </div>
          ) : (
            <input
              aria-label="Ask Sally"
              value={sallyInput}
              onChange={(event) => setSallyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") askSally();
              }}
              placeholder="Ask Sally about your mortgage"
            />
          )}
          <IconButton label="Dictate a question" onClick={startDictation} disabled={!canDictate}>
            <MicrophoneIcon />
          </IconButton>
          <IconButton label="Send to Sally" onClick={askSally}><ArrowUpIcon /></IconButton>
        </div>
        {dictationMessage || !canDictate ? (
          <p className="simple-dictation-message" data-testid="dictation-message">
            {dictationMessage || "Speech recognition is not available in this browser. You can still type your question."}
          </p>
        ) : null}
        {sallyMessages.length || sallyThinking ? (
          <div
            className="simple-sally-thread"
            data-testid="sally-thread"
            ref={messagesRef}
            tabIndex={0}
            role="log"
            aria-live="polite"
            aria-label="Sally conversation"
            onScroll={handleMessagesScroll}
          >
            {sallyMessages.map((message) => (
              <article key={message.id} className={`simple-sally-bubble ${message.role}`} data-testid={`sally-message-${message.role}`}>
                <p>{message.text}</p>
                {message.role === "assistant" ? (
                  <IconButton
                    label={playingMessageId === message.id ? "Stop listening to Sally's response" : "Listen to Sally's response"}
                    onClick={() => playSallyResponse(message)}
                    disabled={!canSpeak}
                  >
                    {playingMessageId === message.id ? <StopIcon /> : <SpeakerIcon muted={false} />}
                  </IconButton>
                ) : null}
              </article>
            ))}
            {sallyThinking ? <p className="simple-sally-bubble assistant">Sally is thinking...</p> : null}
          </div>
        ) : null}
        {newMessageNotice ? (
          <button type="button" className="simple-new-message" onClick={() => {
            shouldAutoScrollRef.current = true;
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            setNewMessageNotice(false);
          }}>
            New Sally response
          </button>
        ) : null}
      </section>

      {!isResults ? (
        <section className="simple-funnel" data-testid="intake-flow">
          <div className="simple-progress" data-testid="progress-indicator">{step + 1} of 3</div>

          {step === 0 ? (
            <section data-testid="purpose-step">
              <h2>What would you like to do?</h2>
              <div className="simple-purpose-grid" data-testid="path-toggle">
                <button type="button" className={scenario.borrowerPath === "purchase" ? "active" : ""} onClick={() => choosePath("purchase")}>Purchase</button>
                <button type="button" className={scenario.borrowerPath === "refinance" ? "active" : ""} onClick={() => choosePath("refinance")}>Refinance</button>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section data-testid={`${scenario.borrowerPath}-property-step`}>
              <h2>{scenario.borrowerPath === "purchase" ? "Tell us about the home." : "Tell us about your current loan."}</h2>
              <div className="simple-form-grid" data-testid={`${scenario.borrowerPath}-form`}>{propertyGroup}</div>
            </section>
          ) : null}

          {step === 2 ? (
            <section data-testid="borrower-basics-step">
              <h2>A few borrower basics.</h2>
              <div className="simple-form-grid">{borrowerBasics}</div>
              <div className="simple-submit-summary" data-testid="scenario-summary">
                <span>Your scenario</span>
                <strong>{getScenarioSummary(scenario) || "Complete your details to see rates."}</strong>
              </div>
              {pricingState === "validation" ? <div className="simple-validation" data-testid="validation-message">{pricingMessage}</div> : null}
            </section>
          ) : null}

          {pricingState === "loading" ? (
            <div className="simple-loading-card" data-testid="loading-state">
              <span>{pricingMessage}</span>
              <div className="simple-loading-bar" />
            </div>
          ) : null}
          {pricingState === "empty" ? <div className="simple-empty" data-testid="empty-results">{pricingMessage}</div> : null}
          {pricingState === "error" ? <div className="simple-error" data-testid="pricing-error">{pricingMessage}</div> : null}

          <div className="simple-flow-actions">
            {step > 0 ? <button type="button" className="simple-secondary-button" onClick={() => setStep((current) => current - 1)}>Back</button> : null}
            {step < 2 ? (
              <button type="button" className="simple-primary-button" onClick={() => setStep((current) => current + 1)}>Continue</button>
            ) : (
              <button type="button" className="simple-primary-button full" data-testid="submit-scenario" onClick={submitPricing}>Show My Live Rates</button>
            )}
          </div>
        </section>
      ) : (
        <section className="simple-results" data-testid="results-screen">
          <div className="simple-results-summary">
            <span data-testid="compact-scenario-summary">{getScenarioSummary(scenario)}</span>
            <button type="button" onClick={() => setPricingState("idle")}>Edit details</button>
          </div>
          <section
            className="simple-rate-dial"
            data-testid="rate-wheel"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") moveRate(-1);
              if (event.key === "ArrowRight") moveRate(1);
            }}
            onTouchStart={(event) => {
              touchStartRef.current = event.touches[0]?.clientX || null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartRef.current;
              const end = event.changedTouches[0]?.clientX;
              touchStartRef.current = null;
              if (start == null || end == null || Math.abs(start - end) < 28) return;
              moveRate(start > end ? 1 : -1);
            }}
          >
            <div className="simple-dial-neighbor">
              <button type="button" onClick={() => moveRate(-1)} disabled={!previousOption} aria-label="Previous rate">‹</button>
              <span>{previousOption ? formatPercent(previousOption.rate) : "Lowest"}</span>
            </div>
            <div className="simple-dial-center">
              <span>Selected rate</span>
              <strong data-testid="selected-rate">{formatPercent(selectedOption?.rate)}</strong>
              <p data-testid="selected-payment">{formatCurrency(selectedOption?.paymentPI)}/mo P&amp;I</p>
            </div>
            <div className="simple-dial-neighbor">
              <span>{nextOption ? formatPercent(nextOption.rate) : "Highest"}</span>
              <button type="button" onClick={() => moveRate(1)} disabled={!nextOption} aria-label="Next rate">›</button>
            </div>
          </section>
          <div className="simple-dial-controls">
            <button type="button" onClick={() => selectOption(options[0])}>Lowest rate</button>
            <button type="button" onClick={() => selectOption(pickParOption(options))}>Closest to par</button>
            <button type="button" onClick={() => selectOption(options[options.length - 1])}>Most credit</button>
            <IconButton label={soundOn ? "Turn sound off" : "Turn sound on"} onClick={() => setSoundOn((current) => !current)}>
              <SpeakerIcon muted={!soundOn} />
            </IconButton>
          </div>
          <div className="simple-tradeoff" data-testid="rate-tradeoff">
            <div><span>Principal &amp; interest</span><strong>{formatCurrency(selectedOption?.paymentPI)}</strong></div>
            <div>
              <span>Points or lender credit</span>
              <strong className={`simple-adjustment ${selectedRateAdjustment.className}`} data-testid="selected-adjustment">
                {selectedRateAdjustment.label}
              </strong>
            </div>
            <div>
              <span>Estimated closing costs</span>
              <strong className="simple-estimated-closing-costs" data-testid="estimated-closing-costs">
                {getClosingCostCardValue(selectedOption)}
              </strong>
            </div>
          </div>
          <details className="simple-cost-breakdown" data-testid="closing-cost-breakdown">
            <summary>View closing-cost breakdown</summary>
            {closingCostEquation ? (
              <div className="simple-cost-equation" data-testid="closing-cost-equation">
                {closingCostEquation.parts.map((part, index) => (
                  <React.Fragment key={part.label}>
                    {index > 0 ? <span className={`simple-equation-operator ${part.className}`}>{part.className === "credit" ? "\u2212" : "+"}</span> : null}
                    <span className={`simple-equation-item ${part.className}`}>
                      <span>{part.label}</span>
                      <strong>{part.value.replace(/^[+\u2212-]/, "")}</strong>
                    </span>
                  </React.Fragment>
                ))}
                <span className="simple-equation-operator">=</span>
                <span className="simple-equation-item total">
                  <span>Estimated closing costs after rate adjustment</span>
                  <strong>{closingCostEquation.total}</strong>
                </span>
              </div>
            ) : (
              <p className="simple-cost-breakdown-empty">
                Base closing costs and rate-adjustment details will appear once an approved HLOA fee schedule is connected.
              </p>
            )}
          </details>
          <p className="simple-cost-status" data-testid="closing-cost-status">{getPublicClosingCostStatusText(selectedOption)}</p>
          <p className="simple-cost-disclosure" data-testid="cost-disclosure">{COST_DISCLOSURE}</p>
          <p className="simple-rate-note">Lower rates may cost more upfront. Higher rates may provide lender credit.</p>
          <button type="button" className="simple-primary-button application" data-testid="application-cta" onClick={handleApplication}>Continue to Application</button>
          {handoffMessage ? <div className="simple-safe-message" data-testid="handoff-message">{handoffMessage}</div> : null}
          <div className="simple-compare-area">
            <button type="button" className="simple-link-button" data-testid="comparison-trigger" onClick={compareFhaConventional}>Compare FHA and Conventional</button>
            {comparison ? (
              <div className={`simple-comparison-result ${comparison.status}`} data-testid="comparison-result">
                {comparison.status === "ready" ? (
                  <>
                    <div><span>FHA</span><strong>{formatPercent(comparison.fha?.rate)}</strong><small>{formatCurrency(comparison.fha?.paymentPI)}/mo P&amp;I</small></div>
                    <div><span>Conventional</span><strong>{formatPercent(comparison.conventional?.rate)}</strong><small>{formatCurrency(comparison.conventional?.paymentPI)}/mo P&amp;I</small></div>
                  </>
                ) : comparison.message}
              </div>
            ) : null}
          </div>
        </section>
      )}
      <details className="simple-disclosure" data-testid="disclosure">
        <summary>Important rate information</summary>
        <p>
          Displayed pricing is not a loan approval, commitment, or rate lock. Rates, points, lender credits,
          payments, and estimated closing costs are subject to change. Principal and interest are shown only when
          available; taxes, homeowners insurance, mortgage insurance, HOA dues, APR, fees, and other applicable housing
          expenses are not included unless specifically supplied. The figures shown are not a formal Loan Estimate.
        </p>
      </details>
    </main>
  );
}
