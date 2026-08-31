import { useMemo } from "react";
import { buildDebtConsolidationComparison } from "../utils/debtConsolidationComparison";

export function useDebtConsolidationComparison(input) {
  return useMemo(() => buildDebtConsolidationComparison(input), [input]);
}
