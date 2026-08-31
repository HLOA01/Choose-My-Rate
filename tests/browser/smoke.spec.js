import { expect, test } from "@playwright/test";

const forbiddenSallyText = /\b(?:approved for|you are approved|you're approved|rate is locked|locked in|guaranteed|guarantee|PRMG|Rocket|loanDepot|Guaranteed Rate|UWM|PennyMac)\b/i;
const lenderNameText = /\b(?:PRMG|Rocket|loanDepot|Guaranteed Rate|UWM|PennyMac)\b/i;
const badPageText = /NaN|Infinity|undefined/;
const guestScenarioStorageKey = "chooseMyRate.guestScenario.v1";
const responsiveViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

async function openApp(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("choose-my-rate-sally-chat-mode", "rules");
  });
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
}

async function selectLoanPurpose(page, value) {
  await page.getByTestId("scenario-field-loanPurpose").selectOption(value);
}

async function fillScenario(page, field, value) {
  await page.getByTestId(`scenario-field-${field}`).fill(String(value));
}

async function fillPurchaseScenario(page) {
  await fillScenario(page, "purchasePrice", "450000");
  await fillScenario(page, "downPayment", "22500");
  await fillScenario(page, "creditScore", "720");
  await page.getByTestId("scenario-field-occupancy").selectOption("primary");
  await fillScenario(page, "zipCode", "92660");
}

async function expectNoBadPageText(page) {
  await expect(page.getByTestId("app-shell")).not.toContainText(badPageText);
}

async function expectNoPageBreakingHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="app-shell"]');
    const shellRight = shell?.getBoundingClientRect().right || 0;
    const viewportWidth = window.innerWidth;
    return {
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth,
      shellOverflow: shellRight - viewportWidth,
    };
  });

  expect(overflow.documentOverflow).toBeLessThanOrEqual(2);
  expect(overflow.shellOverflow).toBeLessThanOrEqual(2);
}

async function expectNoForbiddenSallyText(page) {
  await expect(page.getByTestId("sally-panel")).not.toContainText(forbiddenSallyText);
}

async function fillRateTermRefinance(page, overrides = {}) {
  const values = {
    propertyValue: "650000",
    currentLoanBalance: "400000",
    currentInterestRate: "7",
    currentRemainingTermYears: "27",
    newLoanAmount: "400000",
    newInterestRate: "6",
    newLoanTermYears: "30",
    estimatedClosingCosts: "6000",
    ...overrides,
  };

  await selectLoanPurpose(page, "rate_term_refinance");
  await fillScenario(page, "propertyValue", values.propertyValue);
  await fillScenario(page, "currentLoanBalance", values.currentLoanBalance);
  await fillScenario(page, "currentInterestRate", values.currentInterestRate);
  await fillScenario(page, "currentRemainingTermYears", values.currentRemainingTermYears);
  await fillScenario(page, "newLoanAmount", values.newLoanAmount);
  await fillScenario(page, "newInterestRate", values.newInterestRate);
  await fillScenario(page, "newLoanTermYears", values.newLoanTermYears);
  await fillScenario(page, "estimatedClosingCosts", values.estimatedClosingCosts);
}

async function fillCashOutRefinance(page, overrides = {}) {
  const values = {
    propertyValue: "700000",
    currentLoanBalance: "420000",
    currentInterestRate: "6.875",
    currentRemainingTermYears: "25",
    newLoanAmount: "470000",
    newInterestRate: "6.5",
    newLoanTermYears: "30",
    estimatedClosingCosts: "8000",
    requestedCashOut: "50000",
    ...overrides,
  };

  await selectLoanPurpose(page, "cash_out_refinance");
  await page.getByTestId("scenario-field-refinancePurpose").selectOption(values.refinancePurpose || "cash_out");
  await fillScenario(page, "propertyValue", values.propertyValue);
  await fillScenario(page, "currentLoanBalance", values.currentLoanBalance);
  await fillScenario(page, "currentInterestRate", values.currentInterestRate);
  await fillScenario(page, "currentRemainingTermYears", values.currentRemainingTermYears);
  await fillScenario(page, "newLoanAmount", values.newLoanAmount);
  await fillScenario(page, "newInterestRate", values.newInterestRate);
  await fillScenario(page, "newLoanTermYears", values.newLoanTermYears);
  await fillScenario(page, "estimatedClosingCosts", values.estimatedClosingCosts);
  await fillScenario(page, "requestedCashOut", values.requestedCashOut);
}

test("app loads and default purchase scenario controls render", async ({ page }) => {
  await openApp(page);

  await expect(page.getByText("CHOOSE MY RATE")).toBeVisible();
  await expect(page.getByTestId("borrower-main-flow")).toBeVisible();
  await expect(page.getByTestId("borrower-guided-flow")).toBeVisible();
  await expect(page.getByTestId("borrower-step-indicator")).toBeVisible();
  await expect(page.getByTestId("borrower-step-goal")).toBeVisible();
  await expect(page.getByTestId("sally-side-assistant")).toBeVisible();
  await expect(page.getByTestId("sally-helper-title")).toContainText("Need help? Ask Sally.");
  await expect(page.getByTestId("sally-helper-description")).toContainText("rate options");
  await expect(page.getByTestId("sally-helper-panel")).toBeVisible();
  await expect(page.getByTestId("borrower-goal-landing")).toBeVisible();
  await expect(page.getByTestId("borrower-goal-buy")).toContainText("Buy a home");
  await expect(page.getByTestId("borrower-goal-refinance")).toContainText("Refinance my mortgage");
  await expect(page.getByTestId("borrower-goal-cash-out")).toContainText("Take cash out");
  await expect(page.getByTestId("borrower-goal-fha-conventional")).toContainText("Compare FHA vs Conventional");
  await expect(page.getByTestId("borrower-main-flow")).not.toContainText(/\bpricing\b/i);
  await page.getByTestId("borrower-flow-next").click();
  await expect(page.getByTestId("borrower-step-property")).toBeVisible();
  await page.getByTestId("borrower-flow-back").click();
  await expect(page.getByTestId("borrower-step-goal")).toBeVisible();
  await expect(page.getByTestId("borrower-advanced-details")).toBeVisible();
  await expect(page.getByTestId("scenario-panel")).toBeVisible();
  await expect(page.getByTestId("sally-panel")).toBeVisible();
  await expect(page.getByTestId("scenario-field-loanPurpose")).toHaveValue("purchase");
  await expect(page.getByTestId("scenario-field-purchasePrice")).toBeVisible();
  await expect(page.getByTestId("scenario-field-downPayment")).toBeVisible();
  await expect(page.getByTestId("scenario-control-currentLoanBalance")).toHaveCount(0);
  await expect(page.getByTestId("pricing-disclosure")).toContainText("Payments, rates, points, credits");
  await expect(page.getByTestId("pricing-disclosure")).toContainText("Rates are not locked");
  await expectNoBadPageText(page);
});

test("FHA vs Conventional comparison opens from purchase scenario", async ({ page }) => {
  await openApp(page);

  await fillPurchaseScenario(page);
  await page.getByTestId("borrower-goal-buy").click();
  await page.getByTestId("borrower-flow-next").click();
  await page.getByTestId("borrower-flow-next").click();
  await page.getByTestId("borrower-flow-next").click();
  await page.getByTestId("borrower-flow-next").click();

  await expect(page.getByTestId("borrower-step-rate-options")).toBeVisible();
  await expect(page.getByTestId("borrower-rate-cards")).toBeVisible();
  await expect(page.getByTestId("borrower-rate-card-lower-payment")).toContainText("Lower Payment");
  await expect(page.getByTestId("borrower-rate-card-balanced-option")).toContainText("Balanced Option");
  await expect(page.getByTestId("borrower-rate-card-lower-upfront-cost")).toContainText("Lower Upfront Cost");
  await expect(page.getByTestId("borrower-rate-cards-disclosure")).toContainText("Estimates only");
  await expect(page.getByTestId("borrower-rate-cards")).not.toContainText(forbiddenSallyText);
  await expect(page.getByTestId("app-shell")).not.toContainText(lenderNameText);
  await expect(page.getByTestId("pricing-mode-indicator")).toContainText("Sample rate options");
  await expect(page.getByTestId("app-shell")).toContainText("sample rate options");
  await page.getByRole("button", { name: /Goal/ }).click();
  await page.getByTestId("borrower-goal-fha-conventional").click();
  await expect(page.getByTestId("loan-comparison-panel")).toBeVisible();
  await expect(page.getByTestId("loan-comparison-panel")).toContainText("FHA");
  await expect(page.getByTestId("loan-comparison-panel")).toContainText("Conventional");
  await expect(page.getByTestId("comparison-disclosure")).toContainText("Comparison figures are estimates");
  await expectNoBadPageText(page);
});

test("refinance fields and comparison panel render only for refinance scenarios", async ({ page }) => {
  await openApp(page);

  await expect(page.getByTestId("refinance-comparison-panel")).toHaveCount(0);
  await expect(page.getByTestId("scenario-control-currentLoanBalance")).toHaveCount(0);

  await selectLoanPurpose(page, "rate_term_refinance");
  await expect(page.getByTestId("refinance-comparison-panel")).toBeVisible();
  await expect(page.getByTestId("scenario-field-propertyValue")).toBeVisible();
  await expect(page.getByTestId("scenario-field-currentLoanBalance")).toBeVisible();
  await expect(page.getByTestId("scenario-field-newInterestRate")).toBeVisible();
  await expect(page.getByTestId("scenario-control-debtConsolidationAmount")).toHaveCount(0);

  await fillScenario(page, "propertyValue", "650000");
  await fillScenario(page, "currentLoanBalance", "400000");
  await fillScenario(page, "currentInterestRate", "7");
  await fillScenario(page, "currentRemainingTermYears", "27");
  await fillScenario(page, "newInterestRate", "6");
  await fillScenario(page, "newLoanTermYears", "30");
  await fillScenario(page, "estimatedClosingCosts", "6000");

  await expect(page.getByTestId("refinance-benefit-summary")).toBeVisible();
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Borrower Summary");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Mortgage Payment Change");
  await expect(page.getByTestId("refinance-disclosure")).toContainText("Refinance savings");
  await expect(page.getByTestId("refinance-disclosure")).toContainText("not locked");
  await expectNoBadPageText(page);
});

test("debt consolidation fields are conditional and high cash-out warning appears", async ({ page }) => {
  await openApp(page);

  await selectLoanPurpose(page, "cash_out_refinance");
  await expect(page.getByTestId("refinance-comparison-panel")).toBeVisible();
  await expect(page.getByTestId("scenario-control-debtConsolidationAmount")).toHaveCount(0);

  await page.getByTestId("scenario-field-refinancePurpose").selectOption("debt_consolidation");
  await expect(page.getByTestId("scenario-field-debtConsolidationAmount")).toBeVisible();
  await expect(page.getByTestId("scenario-field-debtConsolidationMonthlyPayments")).toBeVisible();

  await fillScenario(page, "propertyValue", "500000");
  await fillScenario(page, "currentLoanBalance", "480000");
  await fillScenario(page, "currentInterestRate", "6.875");
  await fillScenario(page, "currentRemainingTermYears", "25");
  await fillScenario(page, "newInterestRate", "6.5");
  await fillScenario(page, "newLoanTermYears", "30");
  await fillScenario(page, "estimatedClosingCosts", "8000");
  await fillScenario(page, "requestedCashOut", "50000");

  await expect(page.getByTestId("high-cash-out-warning")).toBeVisible();
  await expect(page.getByTestId("high-cash-out-warning")).toContainText("Cash out may exceed available equity");
  await expectNoBadPageText(page);
});

test("Sally accepts a refinance prompt and responds without forbidden claims", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("sally-input").fill("I want to refinance");
  await page.getByTestId("sally-send").click();

  await expect(page.getByTestId("sally-response")).toContainText("estimated property value");
  await expect(page.getByTestId("scenario-field-loanPurpose")).toHaveValue("rate_term_refinance");
  await expect(page.getByTestId("sally-response")).not.toContainText(forbiddenSallyText);

  await page.getByTestId("sally-input").fill("new rate is 6.5");
  await page.getByTestId("sally-send").click();
  await expect(page.getByTestId("sally-response")).not.toContainText(forbiddenSallyText);
});

test("Sally syncs purchase details into visible scenario fields", async ({ page }) => {
  await openApp(page);

  await page
    .getByTestId("sally-input")
    .fill(
      "I want to buy a home for $425,000. I have a 720 credit score, I want to put 5% down, taxes are about $400 per month, insurance is $150 per month, no HOA, and ZIP is 92660.",
    );
  await page.getByTestId("sally-send").click();

  await expect(page.getByTestId("sally-response")).toContainText("$425,000 purchase price");
  await expect(page.getByTestId("sally-response")).toContainText("720 credit score");
  await expect(page.getByTestId("sally-response")).toContainText("rate options");
  await expect(page.getByTestId("sally-response")).not.toContainText(/\bpricing\b/i);
  await expect(page.getByTestId("scenario-field-purchasePrice")).toHaveValue("425000");
  await expect(page.getByTestId("scenario-field-downPayment")).toHaveValue("21250");
  await expect(page.getByTestId("scenario-field-loanAmount")).toHaveValue("403750");
  await expect(page.getByTestId("scenario-field-creditScore")).toHaveValue("720");
  await expect(page.getByTestId("scenario-field-zipCode")).toHaveValue("92660");
  await expect(page.getByTestId("scenario-field-propertyTaxes")).toHaveValue("400");
  await expect(page.getByTestId("scenario-field-homeownersInsurance")).toHaveValue("150");
  await expect(page.getByTestId("scenario-field-hoaDues")).toHaveValue("0");
  await expect(page.getByTestId("borrower-rate-cards")).toBeVisible();
  await expect(page.getByTestId("borrower-main-flow")).not.toContainText(/\bpricing\b/i);
  await expect(page.getByTestId("app-shell")).not.toContainText(lenderNameText);
  await expectNoBadPageText(page);
});

test("saved local scenario can be restored or cleared", async ({ page }) => {
  await openApp(page);
  await page.evaluate((key) => window.localStorage.removeItem(key), guestScenarioStorageKey);

  await fillPurchaseScenario(page);
  await page.getByTestId("borrower-flow-next").click();
  await page.getByTestId("borrower-flow-next").click();

  await page.waitForFunction(
    (key) => {
      const draft = JSON.parse(window.localStorage.getItem(key) || "null");
      return draft?.scenario?.purchasePrice === "450000" && draft?.borrowerFlowStep === "loan";
    },
    guestScenarioStorageKey,
  );

  await page.reload();
  await expect(page.getByTestId("saved-scenario-restore")).toBeVisible();
  await page.getByTestId("saved-scenario-continue").click();

  await expect(page.getByTestId("scenario-field-purchasePrice")).toHaveValue("450000");
  await expect(page.getByTestId("scenario-field-downPayment")).toHaveValue("22500");
  await expect(page.getByTestId("scenario-field-creditScore")).toHaveValue("720");
  await expect(page.getByTestId("scenario-field-zipCode")).toHaveValue("92660");
  await expect(page.getByTestId("borrower-step-loan")).toBeVisible();
  await expect(page.getByTestId("borrower-rate-cards")).toBeVisible();
  await expect(page.getByTestId("borrower-main-flow")).not.toContainText(/\bpricing\b/i);

  await page.reload();
  await expect(page.getByTestId("saved-scenario-restore")).toBeVisible();
  await page.getByTestId("saved-scenario-start-over").click();
  await expect(page.getByTestId("saved-scenario-restore")).toHaveCount(0);
  await expect(page.getByTestId("scenario-field-purchasePrice")).toHaveValue("");
  await expect(page.getByTestId("scenario-field-creditScore")).toHaveValue("");
  await expect(page.getByTestId("borrower-step-goal")).toBeVisible();
  const clearedDraft = await page.evaluate((key) => window.localStorage.getItem(key), guestScenarioStorageKey);
  expect(clearedDraft).toBeNull();
  await expectNoBadPageText(page);
});

test("full rate-and-term refinance flow updates the borrower summary", async ({ page }) => {
  await openApp(page);
  await fillRateTermRefinance(page);

  await expect(page.getByTestId("scenario-control-requestedCashOut")).toHaveCount(0);
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Current Payment");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("New Payment");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Mortgage Payment Change");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("$353 savings");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("17 months");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("61.54%");
  await expectNoBadPageText(page);
});

test("full cash-out refinance flow shows cash-out and net cash without forbidden wording", async ({ page }) => {
  await openApp(page);
  await fillCashOutRefinance(page);

  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Cash Out Amount");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("$50,000");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Net Cash To Borrower");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("$42,000");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("67.14%");
  await expectNoForbiddenSallyText(page);
  await expectNoBadPageText(page);
});

test("full debt consolidation refinance flow shows cash-flow impact", async ({ page }) => {
  await openApp(page);
  await fillCashOutRefinance(page, {
    refinancePurpose: "debt_consolidation",
    propertyValue: "650000",
    currentLoanBalance: "390000",
    currentInterestRate: "7",
    currentRemainingTermYears: "26",
    newLoanAmount: "455000",
    newInterestRate: "6.5",
    newLoanTermYears: "30",
    estimatedClosingCosts: "8000",
    requestedCashOut: "65000",
  });
  await fillScenario(page, "debtConsolidationAmount", "45000");
  await fillScenario(page, "debtConsolidationMonthlyPayments", "950");

  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Debt Being Paid Off");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("$45,000");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Current Debt Payments");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("$950");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Monthly Cash-flow Impact");
  await expect(page.getByTestId("refinance-benefit-summary")).toContainText("improvement");
  await expectNoBadPageText(page);
});

test("Sally browser refinance flow advances fields and keeps guardrails", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("sally-input").fill("I want to refinance");
  await page.getByTestId("sally-send").click();
  await expect(page.getByTestId("sally-response")).toContainText("estimated property value");

  await page.getByTestId("sally-input").fill("500k");
  await page.getByTestId("sally-send").click();
  await expect(page.getByTestId("scenario-field-propertyValue")).toHaveValue("500000");
  await expect(page.getByTestId("sally-response")).toContainText("currently owe");

  await page.getByTestId("sally-input").fill("new rate is 6.5");
  await page.getByTestId("sally-send").click();
  await expect(page.getByTestId("sally-response")).not.toContainText(forbiddenSallyText);
  await expectNoBadPageText(page);
  await expectNoForbiddenSallyText(page);
});

test("expanded browser guardrail does not show bad calculated values", async ({ page }) => {
  await openApp(page);

  await fillRateTermRefinance(page, {
    propertyValue: "0",
    currentLoanBalance: "0",
    currentInterestRate: "0",
    currentRemainingTermYears: "0",
    newLoanAmount: "0",
    newInterestRate: "0",
    newLoanTermYears: "0",
    estimatedClosingCosts: "0",
  });

  await expectNoBadPageText(page);
});

for (const viewport of responsiveViewports) {
  test(`responsive QA keeps core flows usable at ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);

    await expect(page.getByTestId("borrower-main-flow")).toBeVisible();
    await expect(page.getByTestId("borrower-guided-flow")).toBeVisible();
    await expect(page.getByTestId("borrower-step-indicator")).toBeVisible();
    await expect(page.getByTestId("sally-side-assistant")).toBeVisible();
    await expect(page.getByTestId("sally-helper-panel")).toBeVisible();
    await expect(page.getByTestId("borrower-goal-landing")).toBeVisible();
    await expect(page.getByTestId("borrower-goal-buy")).toBeVisible();
    await expect(page.getByTestId("scenario-panel")).toBeVisible();
    await expect(page.getByTestId("pricing-panel")).toBeVisible();
    await expect(page.getByTestId("sally-panel")).toBeVisible();
    await expect(page.getByLabel("Loan Purpose")).toBeVisible();
    await expect(page.getByLabel("Purchase Price")).toBeVisible();
    await expect(page.getByLabel("Ask Sally")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await page.getByLabel("Loan Purpose").focus();
    await expect(page.getByLabel("Loan Purpose")).toBeFocused();

    await fillPurchaseScenario(page);
    await expect(page.getByTestId("pricing-mode-indicator")).toContainText("Sample rate options");
    await expect(page.getByTestId("borrower-rate-cards")).toBeVisible();
    await expect(page.getByTestId("pricing-panel")).toContainText("Estimated Monthly Payment");
    await page.getByTestId("fha-conventional-compare").click();
    await expect(page.getByTestId("loan-comparison-panel")).toBeVisible();
    await expect(page.getByTestId("loan-comparison-panel")).toContainText("FHA");
    await expect(page.getByTestId("loan-comparison-panel")).toContainText("Conventional");
    await page.getByRole("button", { name: "Back to Rate Options" }).click();
    await expect(page.getByTestId("pricing-panel")).toBeVisible();

    await selectLoanPurpose(page, "rate_term_refinance");
    await expect(page.getByTestId("refinance-comparison-panel")).toBeVisible();
    await expect(page.getByLabel("Property Value")).toBeVisible();
    await fillRateTermRefinance(page);
    await expect(page.getByTestId("refinance-benefit-summary")).toContainText("Borrower Summary");
    await expect(page.getByTestId("sally-panel")).toBeVisible();
    await expectNoBadPageText(page);
    await expectNoPageBreakingHorizontalOverflow(page);
  });
}
