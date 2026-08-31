import { useCallback, useMemo, useState } from "react";
import {
  buildScenarioVariant,
  calculateComparisonDeltas,
  formatComparisonSummary,
} from "../comparison/comparisonUtils";

const EMPTY_COMPARISON = null;

function createComparisonSide(side, baseScenario = {}) {
  const source = side && typeof side === "object" ? side : {};
  const scenarioUpdates =
    source.scenarioUpdates && typeof source.scenarioUpdates === "object" ? source.scenarioUpdates : {};
  const scenario =
    source.scenario && typeof source.scenario === "object"
      ? source.scenario
      : buildScenarioVariant(baseScenario, scenarioUpdates);

  return {
    id: source.id || "",
    label: source.label || "",
    scenario,
    scenarioUpdates,
    pricingQuote: source.pricingQuote || null,
    selectedOptionId: source.selectedOptionId || "",
    selectedOption: source.selectedOption || null,
    pricing: source.pricing || null,
    message: source.message || "",
  };
}

function buildComparisonDraft(request = {}) {
  const source = request && typeof request === "object" ? request : {};
  const baseScenario = source.baseScenario && typeof source.baseScenario === "object" ? source.baseScenario : {};
  const left = createComparisonSide(source.left, baseScenario);
  const right = createComparisonSide(source.right, baseScenario);
  const deltas = calculateComparisonDeltas(left, right);
  const comparison = {
    id: source.id || `comparison-${Date.now()}`,
    type: source.type || "custom",
    title: source.title || [left.label, right.label].filter(Boolean).join(" vs ") || "Scenario Comparison",
    left,
    right,
    summary: {
      deltas,
      text: "",
    },
    status: source.status || "idle",
    createdAt: source.createdAt || new Date().toISOString(),
  };

  return {
    ...comparison,
    summary: {
      ...comparison.summary,
      text: source.summary?.text || formatComparisonSummary(comparison),
    },
  };
}

function updateSide(comparison, sideKey, updates = {}) {
  if (!comparison || (sideKey !== "left" && sideKey !== "right")) return comparison;

  const nextSide = {
    ...comparison[sideKey],
    ...updates,
  };
  const nextComparison = {
    ...comparison,
    [sideKey]: nextSide,
  };
  const deltas = calculateComparisonDeltas(nextComparison.left, nextComparison.right);

  return {
    ...nextComparison,
    summary: {
      ...nextComparison.summary,
      deltas,
      text: formatComparisonSummary({
        ...nextComparison,
        summary: {
          ...nextComparison.summary,
          deltas,
        },
      }),
    },
  };
}

export function useScenarioComparison() {
  const [activeComparison, setActiveComparison] = useState(EMPTY_COMPARISON);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  // Future use: Sally or a comparison UI can call this with a base scenario
  // and left/right scenarioUpdates, then a later pass can price each side.
  const startComparison = useCallback((request) => {
    const nextComparison = buildComparisonDraft(request);
    setActiveComparison(nextComparison);
    setIsComparisonOpen(true);
    return nextComparison;
  }, []);

  const clearComparison = useCallback(() => {
    setActiveComparison(EMPTY_COMPARISON);
    setIsComparisonOpen(false);
  }, []);

  // Future use: selected rate options can update either side after quote data
  // quotes are available, while this hook keeps deltas and summary in sync.
  const updateComparisonSide = useCallback((sideKey, updates) => {
    setActiveComparison((current) => updateSide(current, sideKey, updates));
  }, []);

  return useMemo(
    () => ({
      activeComparison,
      isComparisonOpen,
      startComparison,
      clearComparison,
      updateComparisonSide,
    }),
    [activeComparison, clearComparison, isComparisonOpen, startComparison, updateComparisonSide],
  );
}
