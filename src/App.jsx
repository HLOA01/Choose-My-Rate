import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { createEmptyScenario, processSallyMessage } from "./SallyBrain";
import { askSallyApi, hasSallyApi } from "./sallyApi";
import { hasPricingApi, quotePricing } from "./pricingApi";

const INITIAL_PROMPT =
  "Hi, I’m Sally. I can help you build your loan scenario and guide you step by step. Are you looking to buy a home, refinance, or take cash out?";

const CHAT_MODE_STORAGE_KEY = "choose-my-rate-sally-chat-mode";

function formatCurrency(value) {
  if (value === "" || value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatPercent(value, digits = 3) {
  if (value === "" || value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric.toFixed(digits)}%`;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calculateDownPaymentPercent(scenario) {
  if (scenario.downPaymentPercent) return Number(scenario.downPaymentPercent);

  const purchasePrice = toNumber(scenario.purchasePrice);
  const downPayment = toNumber(scenario.downPayment);

  if (!purchasePrice || !downPayment) return "";
  return Number(((downPayment / purchasePrice) * 100).toFixed(2));
}

function getScenarioFields(scenario) {
  const common = [
    {
      key: "loanPurpose",
      label: "Loan Purpose",
      type: "select",
      options: [
        { value: "purchase", label: "Purchase" },
        { value: "refinance", label: "Refinance" },
        { value: "cash_out", label: "Cash-Out Refinance" },
      ],
    },
    {
      key: "loanType",
      label: "Loan Type",
      type: "select",
      options: [
        { value: "Conventional", label: "Conventional" },
        { value: "FHA", label: "FHA" },
        { value: "VA", label: "VA" },
        { value: "USDA", label: "USDA" },
        { value: "Jumbo", label: "Jumbo" },
        { value: "DSCR", label: "DSCR" },
      ],
    },
    {
      key: "loanAmount",
      label: "Loan Amount",
      type: "currency",
    },
    {
      key: "creditScore",
      label: "Credit Score",
      type: "number",
    },
  ];

  if (scenario.loanPurpose === "refinance" || scenario.loanPurpose === "cash_out") {
    return [
      common[0],
      {
        key: "purchasePrice",
        label: "Estimated Value",
        type: "currency",
      },
      common[2],
      common[3],
      common[1],
    ];
  }

  return [
    common[0],
    {
      key: "purchasePrice",
      label: "Purchase Price",
      type: "currency",
    },
    {
      key: "downPayment",
      label: "Down Payment",
      type: "currency",
    },
    common[2],
    common[3],
    common[1],
  ];
}

function getBaseRate(scenario) {
  const purpose = scenario.loanPurpose || "purchase";
const program = String(scenario.loanType || "Conventional").toLowerCase();
  const occupancy = scenario.occupancy || "primary";
  const creditScore = toNumber(scenario.creditScore);

  let rate = 6.75;

  if (program === "fha") rate = 6.25;
  if (program === "va") rate = 6.125;
  if (program === "usda") rate = 6.25;
  if (program === "jumbo") rate = 6.875;
  if (program === "dscr") rate = 7.875;
  if (program === "conventional") rate = 6.75;

  if (creditScore >= 740) rate -= 0.125;
  if (creditScore > 0 && creditScore < 660) rate += 0.375;
  if (occupancy === "investment") rate += 0.5;
  if (purpose === "cash_out") rate += 0.25;

  return Number(rate.toFixed(3));
}

function calculatePricing(scenario, manualRate = null) {
  const loanAmount = toNumber(scenario.loanAmount);
  const liveRate = manualRate ?? getBaseRate(scenario);

  if (!loanAmount) {
    return {
      rate: liveRate,
      pointsPct: 0,
      pointsDollars: 0,
      principalInterest: "",
      taxes: "",
      insurance: "",
      mortgageInsurance: "",
      total: "",
    };
  }

const program = String(scenario.loanType || "Conventional").toLowerCase();

  const monthlyRate = liveRate / 100 / 12;
  const months = 360;

  const principalInterest =
    monthlyRate === 0
      ? loanAmount / months
      : (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));

const valueBase = toNumber(scenario.purchasePrice);
      const taxes = valueBase ? (valueBase * 0.012) / 12 : 0;
  const insurance = valueBase ? (valueBase * 0.0045) / 12 : 0;

  const ltvBase = toNumber(scenario.purchasePrice);
  const ltv = ltvBase ? (loanAmount / ltvBase) * 100 : 0;

  let mortgageInsurance = 0;
  if (program === "fha") {
    mortgageInsurance = (loanAmount * 0.0055) / 12;
  } else if (program === "conventional" && ltv > 80) {
    mortgageInsurance = (loanAmount * 0.004) / 12;
  } else if (program === "usda") {
    mortgageInsurance = (loanAmount * 0.0035) / 12;
  }

  const baseRate = getBaseRate(scenario);
  const delta = liveRate - baseRate;

  let pointsPct = 0;
  if (Math.abs(delta) < 0.001) {
    pointsPct = 0;
  } else {
    pointsPct = Number((-delta * 2).toFixed(3));
  }

  const pointsDollars = loanAmount * (pointsPct / 100);
  const total = principalInterest + taxes + insurance + mortgageInsurance;

  return {
    rate: Number(liveRate.toFixed(3)),
    pointsPct: Number(pointsPct.toFixed(3)),
    pointsDollars: Math.round(pointsDollars),
    principalInterest: Math.round(principalInterest),
    taxes: Math.round(taxes),
    insurance: Math.round(insurance),
    mortgageInsurance: Math.round(mortgageInsurance),
    total: Math.round(total),
  };
}

function normalizeLoanTypePreference(value) {
  const program = String(value || "").trim().toLowerCase();
  const map = {
    conventional: "conventional",
    fha: "fha",
    va: "va",
    usda: "usda",
    jumbo: "jumbo",
    dscr: "dscr",
  };

  return map[program] || null;
}

function normalizeOccupancy(value) {
  const occupancy = String(value || "primary").toLowerCase();

  if (occupancy === "second" || occupancy === "second_home") return "second_home";
  if (occupancy === "investment") return "investment";
  return "primary";
}

function buildPricingScenario(scenario) {
  const purchasePrice = toNumber(scenario.purchasePrice);
  const loanAmount = toNumber(scenario.loanAmount);
  const downPayment = toNumber(scenario.downPayment);
  const ltv = purchasePrice && loanAmount ? Number(((loanAmount / purchasePrice) * 100).toFixed(3)) : null;

  return {
    purchasePrice,
    loanAmount,
    creditScore: toNumber(scenario.creditScore),
    occupancy: normalizeOccupancy(scenario.occupancy),
    loanPurpose: scenario.loanPurpose || "purchase",
    loanTypePreference: normalizeLoanTypePreference(scenario.loanType),
    propertyType: scenario.propertyType || "single_family",
    zipCode: scenario.zipCode || "",
    downPayment: downPayment || null,
    ltv,
    language: "en",
  };
}

function hasMinimumPricingScenario(payload) {
  return Boolean(payload.loanAmount && payload.creditScore && payload.occupancy && payload.loanPurpose);
}

function adaptPricingOptionToPanel(option, scenario, fallbackPricing) {
  if (!option) return null;

  const loanAmount = toNumber(scenario.loanAmount);
  const rate = Number(option.rate);
  const price = Number(option.price || 0);
  const principalInterest = Math.round(Number(option.paymentPI || 0));
  const total = Math.round(Number(option.paymentPITI || option.paymentPI || 0));
  const estimatedEscrow = Math.max(total - principalInterest, 0);
  const taxes = fallbackPricing.taxes || 0;
  const insurance = fallbackPricing.insurance || 0;
  const mortgageInsurance = Math.max(estimatedEscrow - taxes - insurance, fallbackPricing.mortgageInsurance || 0);

  return {
    rate: Number.isFinite(rate) ? rate : fallbackPricing.rate,
    pointsPct: Number.isFinite(price) ? price : 0,
    pointsDollars: Math.round(loanAmount * ((Number.isFinite(price) ? price : 0) / 100)),
    principalInterest: principalInterest || fallbackPricing.principalInterest,
    taxes,
    insurance,
    mortgageInsurance: Math.round(mortgageInsurance),
    total: total || fallbackPricing.total,
    program: option.program,
    tags: Array.isArray(option.tags) ? option.tags : [],
    estimatedCashToClose: option.estimatedCashToClose,
  };
}

const EMPTY_PRICING = {
  rate: "",
  pointsPct: 0,
  pointsDollars: 0,
  principalInterest: "",
  taxes: "",
  insurance: "",
  mortgageInsurance: "",
  total: "",
  program: "",
  tags: [],
  estimatedCashToClose: "",
};

function formatPointsCreditLabel(value) {
  const numeric = Number(value || 0);

  if (numeric < 0) return `${formatPercent(Math.abs(numeric))} Credit`;
  if (numeric > 0) return `${formatPercent(numeric)} Cost`;
  return "No Points";
}

function formatCostCreditDollars(pointsPct, pointsDollars) {
  const pct = Number(pointsPct || 0);
  const dollars = Math.abs(Number(pointsDollars || 0));

  if (pct > 0) return `Cost: ${formatCurrency(dollars)}`;
  if (pct < 0) return `Credit: ${formatCurrency(dollars)}`;
  return "No Cost (Par)";
}

function playSoftClick() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.055);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
    oscillator.onended = () => context.close();
  } catch (error) {
    console.warn("Rate click sound unavailable:", error);
  }
}

const RATE_GUIDANCE_COPY = {
  lower_rate: [
    "That lower rate can help bring the monthly payment down. The tradeoff is that it often comes with more upfront cost or discount points.",
    "You moved toward a lower-payment option. That can be attractive month to month, but it is worth checking how much extra cash it asks for at closing.",
    "This is the classic lower-rate tradeoff: less payment pressure each month, usually with more cost paid upfront.",
  ],
  higher_rate: [
    "That higher rate usually means the monthly payment goes up, but it may also create more lender credit to help reduce cash needed at closing.",
    "You moved toward a higher-rate option. This can make sense when preserving cash upfront matters more than getting the lowest monthly payment.",
    "This option leans toward lower upfront cost. The payment is higher, but the credit may help with closing costs.",
  ],
  near_par: [
    "This looks close to a no-points area. Many borrowers treat this as a middle-ground option because it avoids leaning too heavily into cost or credit.",
    "You are near par here, so the rate is not being pushed hard by extra points or a large credit. It is a useful comparison point.",
    "This is a balanced spot to review. It can help you compare the payment without a big upfront cost or a big lender credit shaping the decision.",
  ],
  higher_credit: [
    "This option is giving more lender credit. That can lower cash needed at closing, but the monthly payment is usually higher because the rate is higher.",
    "You moved toward more credit. That can be helpful if cash to close is the priority, as long as the higher payment still fits comfortably.",
    "This is more of a cash-to-close strategy. The credit can help upfront, and we would compare that against the extra payment over time.",
  ],
  steady: [
    "This option changes the pricing more than the rate. I would compare the monthly payment and the points or credit side by side before picking it.",
    "This is another real pricing row from the lender. The important part is how the payment and upfront cost feel together.",
  ],
};

const RATE_LOCK_REMINDERS = [
  "Also remember, these options are based on a 30-day lock and the rate is not locked yet.",
  "One important note: a rate is only secured after a full application, property address, and the loan is locked with the lender.",
  "For now, think of this as live pricing guidance, not a locked rate. The lock happens later through the lender process.",
];

function getRateGuidanceType(currentOption, previousOption) {
  const currentPrice = Number(currentOption?.price || 0);
  const previousPrice = Number(previousOption?.price || 0);
  const currentRate = Number(currentOption?.rate || 0);
  const previousRate = Number(previousOption?.rate || 0);

  if (Math.abs(currentPrice) <= 0.125) return "near_par";
  if (currentPrice < previousPrice && currentPrice < 0) return "higher_credit";
  if (currentRate < previousRate) return "lower_rate";
  if (currentRate > previousRate) return "higher_rate";
  return "steady";
}

function buildRateGuidance(currentOption, previousOption, rotationCounts, totalMoves) {
  const guidanceType = getRateGuidanceType(currentOption, previousOption);
  const options = RATE_GUIDANCE_COPY[guidanceType] || RATE_GUIDANCE_COPY.steady;
  const index = rotationCounts[guidanceType] % options.length;
  const nextCounts = {
    ...rotationCounts,
    [guidanceType]: rotationCounts[guidanceType] + 1,
  };
  const reminder =
    totalMoves > 0 && totalMoves % 4 === 0
      ? ` ${RATE_LOCK_REMINDERS[(totalMoves / 4 - 1) % RATE_LOCK_REMINDERS.length]}`
      : "";

  return {
    message: `${options[index]}${reminder}`,
    nextCounts,
  };
}

function ScenarioControl({ field, value, onChange }) {
  return (
    <div className="scenario-control">
      <div className="scenario-control-label">{field.label}</div>

      {field.type === "select" ? (
        <select className="scenario-select" value={value || ""} onChange={(e) => onChange(field.key, e.target.value)}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="scenario-input"
          value={value || ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.type === "currency" ? "Enter amount" : "Enter value"}
        />
      )}
    </div>
  );
}

export default function App() {
const [scenario, setScenario] = useState(() => ({
  ...createEmptyScenario(),
  loanType: "Conventional",
  loanPurpose: "purchase",
  occupancy: "primary",
}));

  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [lastAnswer, setLastAnswer] = useState("");
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pricingQuote, setPricingQuote] = useState(null);
  const [pricingError, setPricingError] = useState("");
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [rateGuidanceMessage, setRateGuidanceMessage] = useState("");
  const [chatMode, setChatMode] = useState(() => {
    const savedMode = window.localStorage?.getItem(CHAT_MODE_STORAGE_KEY);
    return savedMode === "rules" ? "rules" : "ai";
  });

  const recognitionRef = useRef(null);
  const selectedRateStackItemRef = useRef(null);
  const selectedPricingTableRowRef = useRef(null);
  const previousPricingSelectionRef = useRef(null);
  const suppressNextPricingGuidanceRef = useRef(false);
  const rateWheelLastMoveRef = useRef(0);
  const pricingGuidanceMoveCountRef = useRef(0);
  const pricingGuidanceRotationRef = useRef({
    lower_rate: 0,
    higher_rate: 0,
    near_par: 0,
    higher_credit: 0,
    steady: 0,
  });

  const enrichedScenario = useMemo(() => {
    const downPaymentPercent = calculateDownPaymentPercent(scenario);

    const next = {
      ...scenario,
      downPaymentPercent,
    };

    if (next.loanPurpose !== "purchase") {
      next.downPayment = "";
      next.downPaymentPercent = "";
      next.purchasePrice = "";
    }

    return next;
  }, [scenario]);

  const baseRate = useMemo(() => getBaseRate(enrichedScenario), [enrichedScenario]);

  useEffect(() => {
    window.localStorage?.setItem(CHAT_MODE_STORAGE_KEY, chatMode);
  }, [chatMode]);

  const escrowEstimate = useMemo(
    () => calculatePricing(enrichedScenario, baseRate),
    [enrichedScenario, baseRate]
  );
  const pricingScenarioPayload = useMemo(() => buildPricingScenario(enrichedScenario), [enrichedScenario]);
  const hasPricingScenario = hasMinimumPricingScenario(pricingScenarioPayload);

  const livePricingOptions = Array.isArray(pricingQuote?.options) ? pricingQuote.options : [];
  const selectedLiveOptionIndex = Math.max(
    0,
    livePricingOptions.findIndex((option) => option.optionId === selectedOptionId)
  );
  const selectedLiveOption =
    livePricingOptions.find((option) => option.optionId === selectedOptionId) || livePricingOptions[0] || null;
  const enginePricing = useMemo(
    () => adaptPricingOptionToPanel(selectedLiveOption, enrichedScenario, escrowEstimate),
    [selectedLiveOption, enrichedScenario, escrowEstimate]
  );
  const pricing = enginePricing || EMPTY_PRICING;
  const pricingStatusText = enginePricing
    ? `Live pricing${pricingQuote?.pricingAsOf ? ` as of ${new Date(pricingQuote.pricingAsOf).toLocaleTimeString()}` : ""}`
    : pricingError || (isPricingLoading ? "Loading real lender rate stack..." : "Complete the scenario to load real lender pricing.");
  const pricingPausedMessage =
    pricingQuote?.status === "paused"
      ? pricingQuote.message || "Online pricing is temporarily unavailable."
      : "";
  const selectedOptionPosition = livePricingOptions.length ? selectedLiveOptionIndex + 1 : 0;
  const scenarioFields = useMemo(() => getScenarioFields(enrichedScenario), [enrichedScenario]);

  useEffect(() => {
    if (!hasPricingApi()) {
      setPricingQuote(null);
      setPricingError("Pricing API is not configured.");
      setRateGuidanceMessage("");
      previousPricingSelectionRef.current = null;
      return;
    }

    if (!hasPricingScenario) {
      setPricingQuote(null);
      setPricingError("Add loan amount and credit score to get live pricing.");
      setIsPricingLoading(false);
      setRateGuidanceMessage("");
      previousPricingSelectionRef.current = null;
      return;
    }

    const controller = new AbortController();
    setIsPricingLoading(true);
    setPricingError("");

    quotePricing(pricingScenarioPayload, { signal: controller.signal })
      .then((quote) => {
        suppressNextPricingGuidanceRef.current = true;
        setPricingQuote(quote);
        setRateGuidanceMessage(
          "Use the rate wheel or the table to compare real 30-day lock pricing options. Sally will help explain the tradeoff as you move."
        );
        setSelectedOptionId((current) => {
          const options = Array.isArray(quote.options) ? quote.options : [];
          if (options.some((option) => option.optionId === current)) return current;
          return options[0]?.optionId || "";
        });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.warn("Pricing API fallback:", error);
        setPricingQuote(null);
        setPricingError("Live pricing is unavailable.");
        setRateGuidanceMessage("");
        previousPricingSelectionRef.current = null;
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPricingLoading(false);
      });

    return () => controller.abort();
  }, [enrichedScenario, hasPricingScenario, pricingScenarioPayload]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Recognition));

    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setInput(transcript);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedRateStackItemRef.current) return;

    selectedRateStackItemRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });

    selectedPricingTableRowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedOptionId]);

  const speak = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopVoice = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
  };

  const startVoice = () => {
    if (!recognitionRef.current) return;
    window.speechSynthesis?.cancel();
    recognitionRef.current.start();
  };

  const selectLiveOption = (option, { sound = true } = {}) => {
    if (!option) return;
    if (option.optionId === selectedOptionId) return;

    setSelectedOptionId(option.optionId);

    if (sound) {
      playSoftClick();
    }
  };

  const moveRateWheel = (direction) => {
    const nextIndex = Math.min(
      Math.max(selectedLiveOptionIndex + direction, 0),
      livePricingOptions.length - 1
    );
    selectLiveOption(livePricingOptions[nextIndex]);
  };

  const handleRateWheel = (event) => {
    if (!livePricingOptions.length) return;
    event.preventDefault();

    const now = Date.now();
    if (now - rateWheelLastMoveRef.current < 160) return;

    rateWheelLastMoveRef.current = now;
    const direction = event.deltaY + event.deltaX > 0 ? 1 : -1;
    moveRateWheel(direction);
  };

  useEffect(() => {
    if (!selectedLiveOption || pricingPausedMessage) return;

    const previousOption = previousPricingSelectionRef.current;

    if (suppressNextPricingGuidanceRef.current || !previousOption) {
      previousPricingSelectionRef.current = selectedLiveOption;
      suppressNextPricingGuidanceRef.current = false;
      return;
    }

    if (previousOption.optionId === selectedLiveOption.optionId) return;

    pricingGuidanceMoveCountRef.current += 1;
    const { message, nextCounts } = buildRateGuidance(
      selectedLiveOption,
      previousOption,
      pricingGuidanceRotationRef.current,
      pricingGuidanceMoveCountRef.current,
    );

    pricingGuidanceRotationRef.current = nextCounts;
    previousPricingSelectionRef.current = selectedLiveOption;
    setRateGuidanceMessage(message);
    setPrompt(message);

    if (voiceEnabled) {
      speak(message);
    }
  }, [selectedLiveOption, pricingPausedMessage, voiceEnabled]);

  const normalizeScenarioAfterBrain = (next) => {
  const scenarioCopy = { ...next };

  if (!scenarioCopy.loanType) scenarioCopy.loanType = "Conventional";
  if (!scenarioCopy.loanPurpose) scenarioCopy.loanPurpose = "purchase";

  if (scenarioCopy.loanPurpose !== "purchase") {
    scenarioCopy.downPayment = "";
    scenarioCopy.downPaymentPercent = "";
  }

  return scenarioCopy;
};

  const sendMessage = async (rawInput = input) => {
    const userText = String(rawInput || "").trim();
    if (!userText || isThinking) return;

    const localResult = processSallyMessage(userText, scenario);

    setLastAnswer(userText);
    setInput("");
    setIsThinking(true);

    let result = localResult;

    if (chatMode === "ai" && hasSallyApi()) {
      try {
        result = await askSallyApi({
          message: userText,
          scenario,
          localResult,
        });
      } catch (error) {
        console.warn("Sally API fallback:", error);
        result = {
          ...localResult,
          message: `${localResult.message} I am using the rule-based guide until the AI connection is ready.`,
        };
      }
    }

    setPrompt(result.message);
    setScenario((prev) => normalizeScenarioAfterBrain({ ...prev, ...result.scenario }));
    setIsThinking(false);

    if (voiceEnabled) {
      speak(result.message);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const updateScenarioField = (field, rawValue) => {
    const numericFields = ["purchasePrice", "appraisalValue", "downPayment", "loanAmount", "creditScore"];
    let value = rawValue;

    if (numericFields.includes(field)) {
      value = rawValue.replace(/[^\d.]/g, "");
    }

    setScenario((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "loanPurpose" && value !== "purchase") {
  next.downPayment = "";
  next.downPaymentPercent = "";
}

      if (field === "purchasePrice" || field === "downPayment") {
        const purchasePrice = toNumber(field === "purchasePrice" ? value : next.purchasePrice);
        const downPayment = toNumber(field === "downPayment" ? value : next.downPayment);

        if (purchasePrice && downPayment && purchasePrice >= downPayment) {
          next.loanAmount = String(Math.round(purchasePrice - downPayment));
        }
      }

      return next;
    });
  };

  return (
    <div className="cmr-page">
      <div className="galaxy-bg" />
      <div className="stars stars-a" />
      <div className="stars stars-b" />
      <div className="stars stars-c" />

      <div className="cmr-shell">
        <header className="topbar">
          <div className="brand-left">
            <div className="brand-title">CHOOSE MY RATE</div>
            <div className="brand-subtitle">Powered by Home Lenders of America</div>
          </div>

          <div className="topbar-right">
            <button type="button" className="login-btn">Login</button>
          </div>
        </header>

        <section className="sally-section">
          <div className="sally-header">
            <div className="sally-left-zone">
              <div className="sally-identity">
                <div className={`sally-status-dot ${isSpeaking ? "speaking" : isListening ? "listening" : ""}`} />
                <div>
                  <div className="sally-name">Sally</div>
                  <div className="sally-subtitle-text">Your mortgage conversation guide</div>
                </div>
              </div>

              <div className="sally-inline-controls">
                <button
                  type="button"
                  className={`mode-toggle ${chatMode === "ai" ? "active-control" : ""}`}
                  onClick={() => setChatMode((prev) => (prev === "ai" ? "rules" : "ai"))}
                  title="Switch Sally mode"
                >
                  {chatMode === "ai" ? "AI" : "Rules"}
                </button>

                <button
                  type="button"
                  className="icon-control"
                  onClick={startVoice}
                  disabled={!speechSupported}
                  title="Talk"
                >
                  🎤
                </button>

                <button
                  type="button"
                  className="icon-control"
                  onClick={stopVoice}
                  title="Stop"
                >
                  ⏹
                </button>

                <button
                  type="button"
                  className={`icon-control ${voiceEnabled ? "active-control" : ""}`}
                  onClick={() => setVoiceEnabled((prev) => !prev)}
                  title="Voice"
                >
                  🔊
                </button>
              </div>
            </div>

            <div className="sally-right-tools">
              <div className="top-actions">
                <button type="button" className="top-action-btn">Request a Call</button>
                <button type="button" className="top-action-btn">Save Scenario</button>
                <button type="button" className="top-action-btn">Start Over</button>
              </div>
            </div>
          </div>

            <div className="question-stream">
              <div className="mini-label">Current question</div>
            <div className="question-text retro-text">
              {isThinking ? "Sally is thinking..." : prompt}
            </div>

            <div className="latest-answer-inline">
              <span className="mini-label">Latest answer</span>
              <span className="answer-text retro-text">{lastAnswer || "Waiting for your answer..."}</span>
            </div>
          </div>

          <div className="conversation-row">
            <textarea
              className="conversation-input retro-text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Answer Sally here..."
            />
            <button type="button" className="primary-cta" onClick={() => sendMessage()}>
              {isThinking ? "Thinking..." : "Start My Application"}
            </button>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="scenario-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title scenario-title-red">Your Scenario</h2>
              </div>
              <div className="panel-note-mini">You can change these numbers at any time.</div>
            </div>

            <div className="scenario-grid">
              {scenarioFields.map((field) => (
                <ScenarioControl
                  key={field.key}
                  field={field}
                  value={scenario[field.key] || ""}
                  onChange={updateScenarioField}
                />
              ))}
            </div>
          </div>

          <div className="pricing-panel">
            <div className="panel-header pricing-header">
              <div>
                <h2 className="panel-title pricing-title-white">Pricing Engine</h2>
                <div className="pricing-status-line">Live pricing based on a 30-day lock</div>
              </div>
              <button
                type="button"
                className="pricing-info"
                title="This rate is not locked yet. A rate only becomes secured after a full application, property address, and confirmed lock with the lender."
                aria-label="Rate lock information"
              >
                i
              </button>
            </div>

            <div className="pricing-status-note">{pricingStatusText}</div>
            {pricingQuote?.banner ? <div className="pricing-banner">{pricingQuote.banner}</div> : null}
            {pricingPausedMessage ? <div className="pricing-paused">{pricingPausedMessage}</div> : null}

            <div className="payment-hero">
              <div className="payment-main">
                <div className="mini-label">Estimated Monthly Payment</div>
                <div className="payment-value">{formatCurrency(pricingPausedMessage ? "" : pricing.total)}</div>
                {pricing.program ? <div className="pricing-program">{pricing.program}</div> : null}
                {pricing.tags?.length ? (
                  <div className="pricing-tags">
                    {pricing.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="payment-mini-breakdown">
                <div><span>P&I</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.principalInterest)}</strong></div>
                <div><span>Taxes</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.taxes)}</strong></div>
                <div><span>Insurance</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.insurance)}</strong></div>
                <div><span>MI</span><strong>{formatCurrency(pricingPausedMessage ? "" : pricing.mortgageInsurance)}</strong></div>
              </div>
            </div>

            {enginePricing && livePricingOptions.length > 0 ? (
              <div className="rate-wheel-section">
                <div className="rate-stack-heading">
                  <span>Rate Stack</span>
                  <strong>{livePricingOptions.length} real lender options</strong>
                </div>
                <div className="rate-wheel-shell">
                  <button
                    type="button"
                    className="wheel-nav"
                    onClick={() => selectLiveOption(livePricingOptions[selectedLiveOptionIndex - 1])}
                    disabled={selectedLiveOptionIndex <= 0}
                    aria-label="Previous rate"
                  >
                    &lsaquo;
                  </button>
                  <div className="rate-wheel" aria-label="Rate selector" onWheel={handleRateWheel}>
                    {livePricingOptions.map((option, index) => {
                      const distance = Math.min(Math.abs(index - selectedLiveOptionIndex), 5);
                      const isSelected = option.optionId === selectedLiveOption?.optionId;

                      return (
                        <button
                          key={option.optionId}
                          ref={isSelected ? selectedRateStackItemRef : null}
                          type="button"
                          className={`rate-wheel-item ${isSelected ? "selected" : ""}`}
                          style={{
                            "--distance": distance,
                          }}
                          onClick={() => selectLiveOption(option)}
                          aria-label={`Select rate ${formatPercent(option.rate)}`}
                        >
                          <span>{formatPercent(option.rate)}</span>
                          <small>{formatPointsCreditLabel(option.price)}</small>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="wheel-nav"
                    onClick={() => selectLiveOption(livePricingOptions[selectedLiveOptionIndex + 1])}
                    disabled={selectedLiveOptionIndex >= livePricingOptions.length - 1}
                    aria-label="Next rate"
                  >
                    &rsaquo;
                  </button>
                </div>
                <div className="rate-option-count">
                  Option {selectedOptionPosition} of {livePricingOptions.length}
                </div>
              </div>
            ) : (
              <div className="rate-stack-empty">
                <strong>
                  {isPricingLoading
                    ? "Loading lender rate stack"
                    : hasPricingScenario
                    ? "No eligible live pricing options returned"
                    : "Real lender pricing loads here"}
                </strong>
                <span>
                  {hasPricingScenario
                    ? "Adjust the scenario details or product type so Sally can request another real 30-day lock rate stack."
                    : "Add the core scenario details and Sally will load selectable lender rate options."}
                </span>
              </div>
            )}

            <div className="pricing-detail-grid">
              <div className="pricing-detail-card">
                <span>Selected Rate</span>
                <strong>{formatPercent(pricingPausedMessage ? "" : pricing.rate)}</strong>
              </div>
              <div className="pricing-detail-card">
                <span>Points / Credit</span>
                <strong className={pricing.pointsPct < 0 ? "credit-text" : pricing.pointsPct > 0 ? "cost-text" : ""}>
                  {pricingPausedMessage ? "Paused" : formatPointsCreditLabel(pricing.pointsPct)}
                </strong>
                <small>
                  {pricingPausedMessage
                    ? "Unavailable"
                    : pricing.pointsPct > 0
                    ? formatCurrency(pricing.pointsDollars)
                    : pricing.pointsPct < 0
                    ? `+${formatCurrency(Math.abs(pricing.pointsDollars))}`
                    : "No charge"}
                </small>
              </div>
              <div className="pricing-detail-card">
                <span>Cost / Credit</span>
                <strong className={pricing.pointsPct < 0 ? "credit-text" : pricing.pointsPct > 0 ? "cost-text" : ""}>
                  {pricingPausedMessage ? "Unavailable" : formatCostCreditDollars(pricing.pointsPct, pricing.pointsDollars)}
                </strong>
                <small>Rate pricing impact</small>
              </div>
            </div>

            {rateGuidanceMessage ? (
              <div className="sally-rate-guidance">
                <strong>Sally says</strong>
                <span>{rateGuidanceMessage}</span>
              </div>
            ) : null}

            <button type="button" className="closing-costs-link">
              Want to see estimated closing costs?
            </button>

            {!pricingPausedMessage && livePricingOptions.length > 0 ? (
              <div className="pricing-table-wrap">
                <div className="pricing-table-heading">
                  <span>Available 30-day lock pricing</span>
                  <strong>{livePricingOptions.length} options</strong>
                </div>
                <div className="pricing-table" role="table" aria-label="Available pricing options">
                  <div className="pricing-table-row pricing-table-head" role="row">
                    <span>Rate</span>
                    <span>Payment</span>
                    <span>Points/Credit</span>
                  </div>
                  {livePricingOptions.map((option) => {
                    const isSelected = selectedLiveOption?.optionId === option.optionId;
                    return (
                      <button
                        key={option.optionId}
                        ref={isSelected ? selectedPricingTableRowRef : null}
                        type="button"
                        className={`pricing-table-row ${isSelected ? "active" : ""}`}
                        onClick={() => selectLiveOption(option)}
                        role="row"
                      >
                        <span>
                          {formatPercent(option.rate)}
                          {option.tags?.length ? (
                            <small className="pricing-row-note">{option.tags.join(" / ")}</small>
                          ) : null}
                        </span>
                        <span>{formatCurrency(option.paymentPITI)}</span>
                        <span className={option.price < 0 ? "credit-text" : option.price > 0 ? "cost-text" : ""}>
                          {formatPointsCreditLabel(option.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
