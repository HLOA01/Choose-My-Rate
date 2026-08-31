import { expect, test } from "@playwright/test";

const forbiddenSallyText = /\b(?:approved for|you are approved|you're approved|rate is locked|locked in|guaranteed|guarantee|PRMG|Rocket|loanDepot|Guaranteed Rate|UWM|PennyMac)\b/i;
const badPageText = /NaN|Infinity|undefined/;

async function blockExternalNetwork(page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.pathname === "/__qa-pricing/pricing/quote") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "qa-local",
          pricingAsOf: "2026-08-31T12:00:00.000Z",
          options: [
            {
              optionId: "qa-lower-payment",
              program: "Conventional 30 Year Fixed",
              rate: 6.25,
              price: 0.75,
              paymentPI: 2633,
              paymentPITI: 3230,
              estimatedCashToClose: 31000,
              tags: ["Lower Rate"],
            },
            {
              optionId: "qa-balanced",
              program: "Conventional 30 Year Fixed",
              rate: 6.5,
              price: 0,
              paymentPI: 2731,
              paymentPITI: 3328,
              estimatedCashToClose: 27500,
              tags: ["Near Par"],
            },
            {
              optionId: "qa-lower-upfront",
              program: "Conventional 30 Year Fixed",
              rate: 6.75,
              price: -0.625,
              paymentPI: 2832,
              paymentPITI: 3429,
              estimatedCashToClose: 24000,
              tags: ["Higher Credit"],
            },
          ],
        }),
      });
      return;
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      route.continue();
      return;
    }
    route.abort("blockedbyclient");
  });
}

async function openApp(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("choose-my-rate-sally-chat-mode", "rules");
  });
  await blockExternalNetwork(page);
  await page.goto("/");
  await expect(page.locator(".cmr-page")).toBeVisible();
}

async function scenarioControl(page, label) {
  return page
    .locator(".scenario-control")
    .filter({ has: page.locator(".scenario-control-label", { hasText: label }) });
}

async function fillScenarioInput(page, label, value) {
  const control = await scenarioControl(page, label);
  await control.locator("input").fill(String(value));
}

async function selectScenarioOption(page, label, value) {
  const control = await scenarioControl(page, label);
  await control.locator("select").selectOption(value);
}

async function sendSallyMessage(page, message) {
  await page.locator(".conversation-input").fill(message);
  await page.getByRole("button", { name: /start my application|thinking/i }).click();
}

async function expectNoBadPageText(page) {
  await expect(page.locator(".cmr-page")).not.toContainText(badPageText);
}

async function expectNoForbiddenSallyText(page) {
  await expect(page.locator(".sally-section")).not.toContainText(forbiddenSallyText);
}

test("app loads with current-main purchase controls", async ({ page }) => {
  await openApp(page);

  await expect(page.getByText("CHOOSE MY RATE")).toBeVisible();
  await expect(page.getByTestId("borrower-guided-flow")).toBeVisible();
  await expect(page.getByTestId("sally-side-assistant")).toBeVisible();
  await expect(page.getByText("Your Scenario")).toBeVisible();
  await expect(page.getByText("Pricing Engine")).toBeVisible();
  await expect(page.locator(".conversation-input")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start My Application" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Loan Purpose" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Purchase Price" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Down Payment" })).toBeVisible();
  await expectNoBadPageText(page);
});

test("manual purchase scenario updates local payment estimate without external calls", async ({ page }) => {
  const externalRequests = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.pathname === "/__qa-pricing/pricing/quote") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "qa-local",
          options: [
            {
              optionId: "qa-balanced",
              program: "Conventional 30 Year Fixed",
              rate: 6.5,
              price: 0,
              paymentPI: 2731,
              paymentPITI: 3328,
              estimatedCashToClose: 27500,
              tags: ["Near Par"],
            },
          ],
        }),
      });
      return;
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      route.continue();
      return;
    }
    externalRequests.push(route.request().url());
    route.abort("blockedbyclient");
  });

  await page.goto("/");
  await fillScenarioInput(page, "Purchase Price", "450000");
  await fillScenarioInput(page, "Down Payment", "22500");
  await fillScenarioInput(page, "Credit Score", "720");
  await page.getByTestId("borrower-submit-scenario").click();

  await expect(page.locator(".payment-value")).not.toHaveText("");
  await expect(page.getByTestId("borrower-rate-cards")).toContainText("Balanced Option");
  expect(externalRequests).toEqual([]);
  await expectNoBadPageText(page);
});

test("Sally rules mode updates purchase scenario locally", async ({ page }) => {
  await openApp(page);

  await sendSallyMessage(page, "I want to buy a home for $425,000 with 5% down and my score is 720 in 92660.");

  await expect(page.locator(".latest-answer-inline")).toContainText("425,000");
  await expect(page.locator(".question-stream")).toContainText(/zip|updated|scenario/i);
  await expectNoForbiddenSallyText(page);
  await expectNoBadPageText(page);
});

test("refinance selection swaps purchase fields for value and loan amount", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("borrower-goal-refinance").click();
  await selectScenarioOption(page, "Loan Purpose", "refinance");

  await expect(page.locator(".scenario-control-label", { hasText: "Estimated Value" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Purchase Price" })).toHaveCount(0);
  await fillScenarioInput(page, "Estimated Value", "650000");
  await fillScenarioInput(page, "Loan Amount", "400000");
  await fillScenarioInput(page, "Credit Score", "740");

  await expect(page.locator(".payment-value")).not.toHaveText("");
  await expectNoBadPageText(page);
});

test("borrower journey advances purchase path and shows rate-card step", async ({ page }) => {
  await openApp(page);

  await page.getByTestId("borrower-goal-buy").click();
  await page.getByTestId("borrower-flow-next").click();
  await expect(page.getByTestId("borrower-step-property")).toBeVisible();
  await page.getByTestId("borrower-flow-next").click();
  await expect(page.getByTestId("borrower-step-loan")).toBeVisible();
  await page.getByTestId("borrower-flow-next").click();
  await page.getByTestId("borrower-flow-next").click();
  await expect(page.getByTestId("borrower-step-rate-options")).toBeVisible();
});

test("FHA versus Conventional comparison opens through live pricing boundary", async ({ page }) => {
  await openApp(page);

  await fillScenarioInput(page, "Purchase Price", "450000");
  await fillScenarioInput(page, "Down Payment", "22500");
  await fillScenarioInput(page, "Credit Score", "720");
  await page.getByTestId("fha-conventional-compare").click();

  await expect(page.getByTestId("loan-comparison-panel")).toBeVisible();
  await expect(page.getByTestId("loan-comparison-panel")).toContainText("FHA");
  await expect(page.getByTestId("loan-comparison-panel")).toContainText("Conventional");
});

test("saved non-identifying scenario can be restored", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "chooseMyRate.guestScenario.v1",
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        selectedBorrowerGoal: "buy",
        borrowerFlowStep: "loan",
        scenario: {
          loanPurpose: "purchase",
          purchasePrice: "455000",
          downPayment: "22750",
          loanAmount: "432250",
          creditScore: "730",
          loanType: "Conventional",
          occupancy: "primary",
          zipCode: "92660",
        },
      }),
    );
  });

  await openApp(page);
  await expect(page.getByTestId("saved-scenario-restore")).toBeVisible();
  await page.getByTestId("saved-scenario-continue").click();
  await expect(page.locator(".scenario-control").filter({ hasText: "Purchase Price" }).locator("input")).toHaveValue("455000");
  await expect(page.getByTestId("borrower-step-loan")).toBeVisible();
});

test("QA blocks browser requests to non-localhost endpoints", async ({ page }) => {
  const blocked = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      route.continue();
      return;
    }
    blocked.push(url.hostname);
    route.abort("blockedbyclient");
  });

  await page.goto("/");
  await page.evaluate(() => fetch("https://example.com/blocked-by-qa").catch(() => null));

  expect(blocked).toEqual(["example.com"]);
});
