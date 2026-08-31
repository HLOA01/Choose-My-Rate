import { useMemo } from "react";
import { buildRefinanceComparison } from "../utils/refinanceComparison";

export function useRefinanceComparison(input) {
  return useMemo(() => buildRefinanceComparison(input), [input]);
}
