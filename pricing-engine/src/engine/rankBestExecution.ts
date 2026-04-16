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

  const lowestPayment = [...candidates].sort((a, b) => a.paymentPITI - b.paymentPITI)[0];
  const lowestCost = [...candidates].sort((a, b) => a.cashToClose - b.cashToClose)[0];
  const blended = [...candidates].sort((a, b) => a.blendedScore - b.blendedScore)[0];

  const selected = new Map<string, { row: PricingRow; tags: string[] }>();

  if (lowestPayment) {
    selected.set(lowestPayment.row.id, { row: lowestPayment.row, tags: ["Lowest Payment"] });
  }

  if (lowestCost) {
    const existing = selected.get(lowestCost.row.id);
    if (existing) existing.tags.push("Lowest Cost");
    else selected.set(lowestCost.row.id, { row: lowestCost.row, tags: ["Lowest Cost"] });
  }

  if (blended) {
    const existing = selected.get(blended.row.id);
    if (existing) existing.tags.push("Best Blend");
    else selected.set(blended.row.id, { row: blended.row, tags: ["Best Blend"] });
  }

  return [...selected.values()]
    .slice(0, 3)
    .map((selection) => toOption(selection.row, scenario, selection.tags));
}
