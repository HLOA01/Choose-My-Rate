import { expect, test } from "@playwright/test";

const badPageText = /NaN|Infinity|undefined/;
const forbiddenText = /\b(?:pricing engine|returned lender option|request preview|autoplay|realtime|voice controls)\b/i;

const returnedOptions = [
  {
    optionId: "qa-low-rate",
    program: "Conventional 30 Year Fixed",
    rate: 6.25,
    price: 0.875,
    paymentPI: 2633,
    estimatedCashToClose: 31000,
  },
  {
    optionId: "qa-par",
    program: "Conventional 30 Year Fixed",
    rate: 6.5,
    price: 0,
    paymentPI: 2731,
    estimatedCashToClose: 27500,
  },
  {
    optionId: "qa-credit",
    program: "Conventional 30 Year Fixed",
    rate: 6.75,
    price: -0.625,
    paymentPI: 2832,
    estimatedCashToClose: 24000,
  },
];

function quoteBodyFor(payload, mode) {
  if (mode === "empty") {
    return { status: "qa-local", options: [], message: "No mocked options" };
  }

  return {
    status: "qa-local",
    pricingAsOf: "2026-08-31T12:00:00.000Z",
    options: payload.loanTypePreference === "fha"
      ? [
          {
            optionId: "qa-fha-par",
            program: "FHA 30 Year Fixed",
            rate: 6.125,
            price: 0,
            paymentPI: 2582,
            estimatedCashToClose: 28500,
          },
        ]
      : returnedOptions,
  };
}

async function installNetworkBoundary(page, options = {}) {
  const capturedPayloads = [];
  const blockedHosts = [];
  const mode = options.mode || "success";

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.hostname === "127.0.0.1" && url.pathname === "/__qa-pricing/pricing/quote") {
      if (mode === "error") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "QA pricing failure" }),
        });
        return;
      }

      const payload = route.request().method() === "POST" ? route.request().postDataJSON() : {};
      capturedPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(quoteBodyFor(payload, mode)),
      });
      return;
    }

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }

    blockedHosts.push(url.hostname);
    await route.abort("blockedbyclient");
  });

  return { blockedHosts, capturedPayloads };
}

async function openApp(page, options = {}) {
  await page.addInitScript(() => window.localStorage.clear());
  if (options.disableSpeech) {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
    });
  }
  if (options.trackAudio) {
    await page.addInitScript(() => {
      window.__qaAudioTicks = 0;
      window.AudioContext = class {
        constructor() {
          window.__qaAudioTicks += 1;
          this.currentTime = 0;
          this.destination = {};
        }

        createOscillator() {
          return {
            connect() {},
            start() {},
            stop() {
              this.onended?.();
            },
            frequency: { value: 0 },
            onended: null,
          };
        }

        createGain() {
          return {
            connect() {},
            gain: {
              setValueAtTime() {},
              exponentialRampToValueAtTime() {},
            },
          };
        }

        close() {}
      };
      window.webkitAudioContext = window.AudioContext;
    });
  }
  const boundary = await installNetworkBoundary(page, options);
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  return boundary;
}

async function fillPurchaseProperty(page) {
  await page.getByRole("button", { name: "Purchase" }).click();
  await page.getByTestId("home-price").fill("450000");
  await page.getByTestId("down-payment").fill("22500");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByTestId("property-type").selectOption("single_family");
}

async function fillBorrowerBasics(page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("credit-range").selectOption("740-759");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("first-time-homebuyer").selectOption("no");
  await page.getByTestId("annual-income").fill("145000");
}

async function submitPurchase(page) {
  await fillPurchaseProperty(page);
  await fillBorrowerBasics(page);
  await page.getByTestId("submit-scenario").click();
  await expect(page.getByTestId("results-screen")).toBeVisible();
}

async function fillCashOutRefinance(page) {
  await page.getByRole("button", { name: "Refinance" }).click();
  await page.getByTestId("property-value").fill("650000");
  await page.getByTestId("current-balance").fill("400000");
  await page.getByTestId("refinance-goal").selectOption("cash_out");
  await page.getByTestId("current-rate").fill("7.125");
  await page.getByTestId("cash-out-amount").fill("50000");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("credit-range").selectOption("760+");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("annual-income").fill("180000");
}

async function expectCleanPage(page) {
  await expect(page.getByTestId("app-shell")).not.toContainText(badPageText);
  await expect(page.getByTestId("header-composer")).not.toContainText(forbiddenText);
  await expect(page.getByTestId("sally-card")).not.toContainText(forbiddenText);
}

test("revised funnel opens with compact brand, one-line Sally composer, and purpose step", async ({ page }) => {
  await openApp(page, { disableSpeech: true });

  await expect(page.locator(".simple-brand-title", { hasText: "CHOOSE MY RATE" })).toBeVisible();
  await expect(page.getByText("Powered by Home Lenders of America")).toBeVisible();
  await expect(page.getByRole("heading", { name: "See your real mortgage rate options." })).toBeVisible();
  await expect(page.getByPlaceholder("Ask Sally about your mortgage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dictate a question" })).toBeDisabled();
  await expect(page.getByTestId("progress-indicator")).toHaveText("1 of 3");
  await expect(page.getByTestId("purpose-step")).toBeVisible();
  await expect(page.getByTestId("comparison-trigger")).toHaveCount(0);
  await expectCleanPage(page);
});

test("purchase path progresses through property questions and borrower basics", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Purchase" }).click();
  await expect(page.getByTestId("progress-indicator")).toHaveText("2 of 3");
  await expect(page.getByTestId("purchase-property-step")).toBeVisible();
  await expect(page.getByTestId("home-price")).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("progress-indicator")).toHaveText("3 of 3");
  await expect(page.getByTestId("borrower-basics-step")).toBeVisible();
  await expect(page.getByTestId("submit-scenario")).toHaveText("Show My Live Rates");
});

test("purchase submission preserves the live pricing request contract", async ({ page }) => {
  const { capturedPayloads, blockedHosts } = await openApp(page);

  await submitPurchase(page);

  expect(capturedPayloads).toHaveLength(1);
  expect(capturedPayloads[0]).toMatchObject({
    purchasePrice: 450000,
    loanAmount: 427500,
    creditScore: 750,
    loanPurpose: "purchase",
    loanTypePreference: "conventional",
    propertyType: "single_family",
    occupancy: "primary",
    zipCode: "92660",
  });
  expect(capturedPayloads[0]).not.toHaveProperty("annualIncome");
  expect(blockedHosts).toEqual([]);
});

test("rate dial changes only among real options and updates tradeoff values", async ({ page }) => {
  await openApp(page);
  await submitPurchase(page);

  await expect(page.getByTestId("compact-scenario-summary")).toContainText("Purchase · $450,000 home · 5% down · ZIP 92660");
  await expect(page.getByTestId("selected-rate")).toHaveText("6.500%");
  await expect(page.getByTestId("selected-payment")).toHaveText("$2,731/mo P&I");
  await expect(page.getByTestId("rate-tradeoff")).toContainText("Principal & interest");
  await expect(page.getByTestId("selected-points")).toHaveText("Closest to par");
  await expect(page.getByTestId("selected-cash")).toHaveText("$27,500");

  await page.getByRole("button", { name: "Next rate" }).click();
  await expect(page.getByTestId("selected-rate")).toHaveText("6.750%");
  await expect(page.getByTestId("selected-payment")).toHaveText("$2,832/mo P&I");
  await expect(page.getByTestId("selected-points")).toHaveText("0.625% lender credit");
  await expect(page.getByTestId("selected-cash")).toHaveText("$24,000");

  await page.getByRole("button", { name: "Lowest rate" }).click();
  await expect(page.getByTestId("selected-rate")).toHaveText("6.250%");
  await expect(page.getByTestId("selected-points")).toHaveText("0.875% points");
  await expect(page.getByTestId("selected-cash")).toHaveText("$31,000");

  await page.getByTestId("rate-wheel").press("ArrowRight");
  await expect(page.getByTestId("selected-rate")).toHaveText("6.500%");
});

test("rate dial sound and speaker controls only react to real selection changes", async ({ page }) => {
  await openApp(page, { trackAudio: true });
  await submitPurchase(page);

  await expect(page.getByRole("button", { name: "Turn sound off" })).toBeVisible();
  expect(await page.evaluate(() => window.__qaAudioTicks)).toBe(0);

  await page.getByRole("button", { name: "Closest to par" }).click();
  expect(await page.evaluate(() => window.__qaAudioTicks)).toBe(0);

  await page.getByRole("button", { name: "Next rate" }).click();
  expect(await page.evaluate(() => window.__qaAudioTicks)).toBe(1);

  await page.getByRole("button", { name: "Turn sound off" }).click();
  await page.getByRole("button", { name: "Previous rate" }).click();
  expect(await page.evaluate(() => window.__qaAudioTicks)).toBe(1);
});

test("application CTA and optional comparison stay below selected rate information", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await submitPurchase(page);
  await page.getByTestId("application-cta").click();
  await expect(page.getByTestId("handoff-message")).toContainText("not configured yet");
  await page.getByTestId("comparison-trigger").click();
  await expect(page.getByTestId("comparison-result")).toContainText("FHA");
  await expect(page.getByTestId("comparison-result")).toContainText("Conventional");
  expect(capturedPayloads.map((payload) => payload.loanTypePreference)).toEqual(["conventional", "fha", "conventional"]);
});

test("cash-out refinance captures requested cash out and maps payload", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await fillCashOutRefinance(page);
  await page.getByTestId("submit-scenario").click();
  await expect(page.getByTestId("results-screen")).toBeVisible();

  expect(capturedPayloads).toHaveLength(1);
  expect(capturedPayloads[0]).toMatchObject({
    purchasePrice: 650000,
    loanAmount: 450000,
    creditScore: 780,
    loanPurpose: "cash_out",
    zipCode: "92660",
  });
});

test("validation and provider error states do not invent rates", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("submit-scenario").click();
  await expect(page.getByTestId("validation-message")).toContainText("Home price is required");
  expect(capturedPayloads).toEqual([]);

  const errorPage = await page.context().newPage();
  await openApp(errorPage, { mode: "error" });
  await fillPurchaseProperty(errorPage);
  await fillBorrowerBasics(errorPage);
  await errorPage.getByTestId("submit-scenario").click();
  await expect(errorPage.getByTestId("pricing-error")).toContainText("No rates are shown");
  await expect(errorPage.getByTestId("results-screen")).toHaveCount(0);
});

test("Sally remains compact and text-first with scenario context", async ({ page }) => {
  await openApp(page);
  await fillPurchaseProperty(page);

  await page.getByLabel("Ask Sally").fill("What should I compare?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("sally-response")).toContainText("principal-and-interest payment");
  await expect(page.getByTestId("purchase-property-step")).toBeVisible();
  await expect(page.getByTestId("home-price")).toHaveValue("450000");
  await expect(page.getByTestId("sally-card")).not.toContainText(/spoken|autoplay|realtime|voice controls/i);
});

test("disclosures are compact and expandable", async ({ page }) => {
  await openApp(page);

  await expect(page.getByTestId("disclosure")).toContainText("Important rate information");
  await page.getByText("Important rate information").click();
  await expect(page.getByTestId("disclosure")).toContainText("not a loan approval");
  await expect(page.getByTestId("disclosure")).toContainText("taxes, homeowners insurance, mortgage insurance, HOA dues");
});

test("mobile layout keeps one question group and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await expect(page.getByTestId("purpose-step")).toBeVisible();
  await expect(page.getByTestId("home-price")).toHaveCount(0);
  const activeColor = await page.evaluate(() => getComputedStyle(document.querySelector(".simple-purpose-grid button.active")).backgroundColor);
  await page.getByRole("button", { name: "Purchase" }).click();
  await expect(page.getByTestId("purchase-property-step")).toBeVisible();
  await expect(page.getByTestId("borrower-basics-step")).toHaveCount(0);

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    brand: getComputedStyle(document.querySelector(".simple-brand-title")).color,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.brand).toBe("rgb(244, 197, 66)");
  expect(activeColor).toBe("rgb(193, 18, 31)");
});

test("QA blocks browser requests to non-localhost endpoints", async ({ page }) => {
  const { blockedHosts } = await openApp(page);

  await page.evaluate(() => fetch("https://example.com/blocked-by-qa").catch(() => null));

  expect(blockedHosts).toEqual(["example.com"]);
});
