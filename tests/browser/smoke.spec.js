import { expect, test } from "@playwright/test";

test.skip(true, "Superseded by funnel.spec.js for the revised progressive borrower funnel.");

const badPageText = /NaN|Infinity|undefined/;
const forbiddenSallyText = /\b(?:approved|approval|rate lock|locked in|guaranteed|autoplay|realtime|voice control)\b/i;
const restoreKey = "chooseMyRate.simpleScenario.v1";

const returnedOptions = [
  {
    optionId: "qa-lower-rate",
    program: "Conventional 30 Year Fixed",
    rate: 6.25,
    price: 0.75,
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

  const baseOptions = payload.loanTypePreference === "fha"
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
    : returnedOptions;

  return {
    status: "qa-local",
    pricingAsOf: "2026-08-31T12:00:00.000Z",
    options: baseOptions,
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
  const boundary = await installNetworkBoundary(page, options);
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  return boundary;
}

async function fillPurchaseScenario(page) {
  await page.getByTestId("home-price").fill("450000");
  await page.getByTestId("down-payment").fill("22500");
  await page.getByTestId("property-type").selectOption("single_family");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("credit-range").selectOption("740-759");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByTestId("annual-income").fill("145000");
}

async function fillRefinanceScenario(page, goal = "lower_payment") {
  await page.getByRole("button", { name: "Refinance" }).click();
  await page.getByTestId("property-value").fill("650000");
  await page.getByTestId("current-balance").fill("400000");
  await page.getByTestId("refinance-goal").selectOption(goal);
  await page.getByTestId("current-rate").fill("7.125");
  if (goal === "cash_out") {
    await page.getByTestId("cash-out-amount").fill("50000");
  }
  await page.getByTestId("property-type").selectOption("single_family");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("credit-range").selectOption("760+");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByTestId("annual-income").fill("180000");
}

async function submitScenario(page) {
  await page.getByTestId("submit-scenario").click();
  await expect(page.getByTestId("pricing-status")).toContainText("Live rate options returned");
}

async function expectCleanPage(page) {
  await expect(page.getByTestId("app-shell")).not.toContainText(badPageText);
  await expect(page.getByTestId("sally-card")).not.toContainText(forbiddenSallyText);
}

test("simplified borrower layout shows brand, primary paths, and Sally composer", async ({ page }) => {
  await openApp(page);

  await expect(page.locator(".simple-brand-title", { hasText: "CHOOSE MY RATE" })).toBeVisible();
  await expect(page.getByText("Powered by Home Lenders of America.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Purchase" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Refinance" })).toBeVisible();
  await expect(page.getByTestId("sally-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use microphone" })).toBeVisible();
  await expect(page.getByTestId("submit-scenario")).toHaveText("View Live Rates");
  await expectCleanPage(page);
});

test("purchase scenario posts through the existing pricing boundary", async ({ page }) => {
  const { capturedPayloads, blockedHosts } = await openApp(page);

  await fillPurchaseScenario(page);
  await submitScenario(page);

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

test("rate wheel moves only through returned options and updates selected pricing", async ({ page }) => {
  await openApp(page);
  await fillPurchaseScenario(page);
  await submitScenario(page);

  await expect(page.getByTestId("selected-rate")).toHaveText("6.500%");
  await expect(page.getByTestId("selected-payment")).toHaveText("$2,731");
  await expect(page.getByTestId("selected-points")).toHaveText("Closest to par");
  await expect(page.getByTestId("rate-options").locator("button")).toHaveCount(3);
  await expect(page.getByLabel("Rate wheel")).toHaveAttribute("max", "2");

  await page.getByTestId("rate-wheel").getByRole("button", { name: "6.750%" }).click();
  await expect(page.getByTestId("selected-rate")).toHaveText("6.750%");
  await expect(page.getByTestId("selected-payment")).toHaveText("$2,832");
  await expect(page.getByTestId("selected-points")).toHaveText("0.625% lender credit");
  await expect(page.getByTestId("selected-cash")).toHaveText("$24,000");
});

test("refinance scenario and cash-out amount map to pricing payload", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await fillRefinanceScenario(page, "cash_out");
  await submitScenario(page);

  expect(capturedPayloads).toHaveLength(1);
  expect(capturedPayloads[0]).toMatchObject({
    purchasePrice: 650000,
    loanAmount: 450000,
    creditScore: 780,
    loanPurpose: "cash_out",
    zipCode: "92660",
  });
});

test("incomplete scenarios validate before pricing is requested", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await page.getByTestId("submit-scenario").click();

  await expect(page.getByTestId("validation-message")).toContainText("Home price is required");
  expect(capturedPayloads).toEqual([]);
});

test("FHA versus Conventional comparison uses mocked returned pricing only", async ({ page }) => {
  const { capturedPayloads } = await openApp(page);

  await fillPurchaseScenario(page);
  await page.getByRole("button", { name: "Compare" }).click();

  await expect(page.getByTestId("comparison-result")).toContainText("FHA");
  await expect(page.getByTestId("comparison-result")).toContainText("Conventional");
  expect(capturedPayloads.map((payload) => payload.loanTypePreference)).toEqual(["fha", "conventional"]);
});

test("saved scenario restore keeps non-identifying borrower fields", async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        scenario: {
          borrowerPath: "purchase",
          homePrice: "455000",
          downPayment: "22750",
          propertyType: "single_family",
          occupancy: "primary",
          creditRange: "720-739",
          zipCode: "92660",
          annualIncome: "135000",
        },
      }),
    );
  }, restoreKey);

  await installNetworkBoundary(page);
  await page.goto("/");
  await expect(page.getByTestId("saved-scenario-restore")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("home-price")).toHaveValue("455000");
  await expect(page.getByTestId("annual-income")).toHaveValue("135000");
});

test("Sally remains text-first and receives scenario context without voice autoplay", async ({ page }) => {
  await openApp(page);
  await fillPurchaseScenario(page);

  await page.getByLabel("Ask Sally").fill("What should I compare first?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("sally-messages")).toContainText("current scenario");
  await expect(page.getByTestId("sally-card")).not.toContainText(/spoken|autoplay|realtime|voice controls/i);
  await expectCleanPage(page);
});

test("empty and error pricing states do not invent options", async ({ page }) => {
  await openApp(page, { mode: "empty" });
  await fillPurchaseScenario(page);
  await page.getByTestId("submit-scenario").click();
  await expect(page.getByTestId("empty-results")).toBeVisible();
  await expect(page.getByTestId("rate-options")).toHaveCount(0);

  const errorPage = await page.context().newPage();
  await openApp(errorPage, { mode: "error" });
  await fillPurchaseScenario(errorPage);
  await errorPage.getByTestId("submit-scenario").click();
  await expect(errorPage.getByTestId("pricing-error")).toContainText("No rates are shown");
  await expect(errorPage.getByTestId("rate-options")).toHaveCount(0);
});

test("mobile layout fits 390px viewport and keeps high-contrast colors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  const metrics = await page.evaluate(() => {
    const brand = getComputedStyle(document.querySelector(".simple-brand-title")).color;
    const active = getComputedStyle(document.querySelector(".simple-path-toggle button.active")).backgroundColor;
    const heading = getComputedStyle(document.querySelector(".simple-hero-copy h1")).color;
    return {
      brand,
      active,
      heading,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.brand).toBe("rgb(244, 197, 66)");
  expect(metrics.active).toBe("rgb(193, 18, 31)");
  expect(metrics.heading).toBe("rgb(255, 255, 255)");
});

test("QA blocks browser requests to non-localhost endpoints", async ({ page }) => {
  const { blockedHosts } = await openApp(page);

  await page.evaluate(() => fetch("https://example.com/blocked-by-qa").catch(() => null));

  expect(blockedHosts).toEqual(["example.com"]);
});
