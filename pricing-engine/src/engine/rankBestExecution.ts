import { v4 as uuidv4 } from "uuid";
import type { PricingRow } from "../db/models/pricingRow.js";
import type { BorrowerPricingOption } from "../types/pricing.js";
import type { PricingScenario } from "../types/scenario.js";
import { estimatePiti } from "./calculatePayment.js";
import { getBorrowerProgramName } from "./programDisplayName.js";

function roundedMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function estimateCashToClose(row: PricingRow, scenario: PricingScenario) {
  const downPayment = scenario.downPayment ?? Math.max(scenario.purchasePrice - scenario.loanAmount, 0);
  const pricingCost = scenario.loanAmount * (row.price / 100);
  return roundedMoney(Math.max(0, downPayment + pricingCost));
}

function toOption(row: PricingRow, scenario: PricingScenario, tags: string[]): BorrowerPricingOption {
  const payments = estimatePiti({
    purchasePrice: scenario.purchasePrice,
    loanAmount: scenario.loanAmount,
    annualRate: row.rate,
    termMonths: row.termMonths,
  });

  return {
    optionId: uuidv4(),
    program: getBorrowerProgramName(row),
    rate: row.rate,
    price: row.price,
    paymentPI: roundedMoney(payments.paymentPI),
    paymentPITI: roundedMoney(payments.paymentPITI),
    estimatedCashToClose: estimateCashToClose(row, scenario),
    tags,
    displayLender: false,
  };
}

export function rankBestExecution(rows: PricingRow[], scenario: PricingScenario) {
  const candidates = rows.map((row) => {
    const payments = estimatePiti({
      purchasePrice: scenario.purchasePrice,
      loanAmount: scenario.loanAmount,
      annualRate: row.rate,
      termMonths: row.termMonths,
    });
    const cashToClose = estimateCashToClose(row, scenario);
    return {
      row,
      paymentPITI: payments.paymentPITI,
      cashToClose,
      blendedScore: payments.paymentPITI + cashToClose / 180,
    };
  });

  const lowestRate = [...candidates].sort((a, b) => a.row.rate - b.row.rate)[0];
  const noPoints = [...candidates].sort((a, b) => Math.abs(a.row.price) - Math.abs(b.row.price))[0];
  const highestCredit = [...candidates].sort((a, b) => a.row.price - b.row.price)[0];

  const selected = new Map<string, { row: PricingRow; tags: string[] }>();

  for (const candidate of candidates) {
    selected.set(candidate.row.id, { row: candidate.row, tags: [] });
  }

  if (lowestRate) {
    selected.get(lowestRate.row.id)?.tags.push("Lowest Payment");
  }

  if (noPoints) {
    selected.get(noPoints.row.id)?.tags.push("No Points");
  }

  if (highestCredit && highestCredit.row.price < 0) {
    selected.get(highestCredit.row.id)?.tags.push("Highest Credit");
  }

  return [...selected.values()]
    .sort((a, b) => a.row.rate - b.row.rate || a.row.price - b.row.price)
    .map((selection) => toOption(selection.row, scenario, selection.tags));
}
