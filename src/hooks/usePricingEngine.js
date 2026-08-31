import { useEffect, useMemo, useRef, useState } from "react";
import { hasPricingApi, quoteMockPricing, quotePricing } from "../pricingApi";
import {
  EMPTY_PRICING,
  adaptPricingOptionToPanel,
  buildPricingScenario,
  calculatePricing,
  hasMinimumPricingScenario,
} from "../pricing/pricingScenario";
import { buildRefinanceAnalysis } from "../pricing/refinanceAnalysis";
import { buildRateGuidance } from "../pricing/rateGuidance";

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

export function usePricingEngine({ baseRate, enrichedScenario, setPrompt, speakSallyMessage }) {
  const [pricingQuote, setPricingQuote] = useState(null);
  const [pricingError, setPricingError] = useState("");
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [pricingRefreshNonce, setPricingRefreshNonce] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [rateGuidanceMessage, setRateGuidanceMessage] = useState("");

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
  const refinanceAnalysis = useMemo(
    () => buildRefinanceAnalysis(enrichedScenario, pricing),
    [enrichedScenario, pricing]
  );
  const pricingStatusText = enginePricing
    ? `${pricingQuote?.status === "mock" ? "Sample rate options" : "Current rate options"}${pricingQuote?.pricingAsOf ? ` as of ${new Date(pricingQuote.pricingAsOf).toLocaleTimeString()}` : ""}`
    : pricingError || (isPricingLoading ? "Loading current rate options..." : "Complete the loan details to load current rate options.");
  const pricingPausedMessage =
    pricingQuote?.status === "paused"
      ? pricingQuote.message || "Online rate options are temporarily unavailable."
      : "";
  const selectedOptionPosition = livePricingOptions.length ? selectedLiveOptionIndex + 1 : 0;

  useEffect(() => {
    if (!hasPricingApi()) {
      if (hasPricingScenario) {
        const mockQuote = quoteMockPricing(pricingScenarioPayload);
        console.log("[Pricing] VITE_PRICING_ENGINE_API_URL not configured; using mock rate stack.", {
          scenario: pricingScenarioPayload,
          optionCount: mockQuote.options.length,
        });
        suppressNextPricingGuidanceRef.current = true;
        setPricingQuote(mockQuote);
        setPricingError("");
        setIsPricingLoading(false);
        setSelectedOptionId((current) => {
          if (mockQuote.options.some((option) => option.optionId === current)) return current;
          return mockQuote.options[3]?.optionId || mockQuote.options[0]?.optionId || "";
        });
        setRateGuidanceMessage(
          "Sample rate options are loaded so you can test the rate selector, table, payment, and points or credit tradeoffs."
        );
        previousPricingSelectionRef.current = null;
        return;
      }

      setPricingQuote(null);
      setPricingError(
        pricingScenarioPayload.loanAmount && pricingScenarioPayload.creditScore && !pricingScenarioPayload.zipCode
          ? "ZIP needed for more accurate rate options."
          : "Add loan amount, credit score, and ZIP to get rate options."
      );
      setIsPricingLoading(false);
      setRateGuidanceMessage("");
      previousPricingSelectionRef.current = null;
      return;
    }

    if (!hasPricingScenario) {
      setPricingQuote(null);
      setPricingError(
        pricingScenarioPayload.loanAmount && pricingScenarioPayload.creditScore && !pricingScenarioPayload.zipCode
          ? "ZIP needed for more accurate rate options."
          : "Add loan amount, credit score, and ZIP to get current rate options."
      );
      setIsPricingLoading(false);
      setRateGuidanceMessage("");
      previousPricingSelectionRef.current = null;
      return;
    }

    const controller = new AbortController();
    setIsPricingLoading(true);
    setPricingError("");
    console.log("[Pricing] Requesting configured pricing API.", pricingScenarioPayload);

    quotePricing(pricingScenarioPayload, { signal: controller.signal })
      .then((quote) => {
        console.log("[Pricing] Pricing API response received.", {
          status: quote?.status,
          optionCount: Array.isArray(quote?.options) ? quote.options.length : 0,
        });
        suppressNextPricingGuidanceRef.current = true;
        setPricingQuote(quote);
        setRateGuidanceMessage(
          "Use the rate selector or the table to compare current 30-day rate options. Sally will help explain the tradeoff as you move."
        );
        setSelectedOptionId((current) => {
          const options = Array.isArray(quote.options) ? quote.options : [];
          if (options.some((option) => option.optionId === current)) return current;
          return options[0]?.optionId || "";
        });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        const mockQuote = quoteMockPricing(pricingScenarioPayload);
        console.warn("[Pricing] Pricing API failed; using mock rate stack.", error);
        setPricingQuote(mockQuote);
        setPricingError("");
        setSelectedOptionId((current) => {
          if (mockQuote.options.some((option) => option.optionId === current)) return current;
          return mockQuote.options[3]?.optionId || mockQuote.options[0]?.optionId || "";
        });
        setRateGuidanceMessage(
          "Current rate options were unavailable, so sample rate options are loaded for testing the selector and table."
        );
        previousPricingSelectionRef.current = null;
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPricingLoading(false);
      });

    return () => controller.abort();
  }, [enrichedScenario, hasPricingScenario, pricingRefreshNonce, pricingScenarioPayload]);

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
    speakSallyMessage(message);
  }, [pricingPausedMessage, selectedLiveOption, setPrompt, speakSallyMessage]);

  return {
    enginePricing,
    hasPricingScenario,
    isPricingLoading,
    livePricingOptions,
    pricing,
    pricingPausedMessage,
    pricingQuote,
    refinanceAnalysis,
    pricingStatusText,
    rateGuidanceMessage,
    refreshPricing: setPricingRefreshNonce,
    selectedLiveOption,
    selectedLiveOptionIndex,
    selectedOptionPosition,
    selectedPricingTableRowRef,
    selectedRateStackItemRef,
    handleRateWheel,
    selectLiveOption,
  };
}
