import type { PricingRow } from "../db/models/pricingRow.js";
import type { PricingScenario } from "../types/scenario.js";
import { calculateLtv } from "./mapScenarioToProducts.js";

export function filterEligiblePrograms(rows: PricingRow[], scenario: PricingScenario) {
  const ltv = calculateLtv(scenario);

  return rows.filter((row) => {
    if (scenario.loanTypePreference && row.loanType !== scenario.loanTypePreference) {
      return false;
    }

    if (row.loanType === "unknown") return false;
    if (row.termMonths <= 0) return false;
    if (row.lockDays !== 30) return false;

    if (scenario.loanPurpose === "cash_out" && row.loanType === "usda") {
      return false;
    }

    if (row.loanType === "va" && scenario.loanTypePreference !== "va") {
      return false;
    }

    if (row.loanType === "jumbo" && scenario.loanAmount < 766550) {
      return false;
    }

    if (ltv && row.loanType === "conventional" && ltv > 97) {
      return false;
    }

    if (ltv && row.loanType === "fha" && ltv > 96.5) {
      return false;
    }

    if (scenario.occupancy === "investment" && row.loanType === "usda") {
      return false;
    }

    return true;
  });
}
