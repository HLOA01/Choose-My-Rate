import { expect, test } from "@playwright/test";

const forbiddenSallyText = /\b(?:approved for|you are approved|you're approved|rate is locked|locked in|guaranteed|guarantee|PRMG|Rocket|loanDepot|Guaranteed Rate|UWM|PennyMac)\b/i;
const badPageText = /NaN|Infinity|undefined/;

async function blockExternalNetwork(page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
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
  await page.locator(".primary-cta").click();
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
  await expect(page.getByText("Your Scenario")).toBeVisible();
  await expect(page.getByText("Pricing Engine")).toBeVisible();
  await expect(page.locator(".conversation-input")).toBeVisible();
  await expect(page.locator(".primary-cta")).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Loan Purpose" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Purchase Price" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Down Payment" })).toBeVisible();
  await expectNoBadPageText(page);
});

test("manual purchase scenario updates local payment estimate without external calls", async ({ page }) => {
  const externalRequests = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
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

  await expect(page.locator(".payment-value")).not.toHaveText("");
  await expect(page.locator(".pricing-status-note")).toContainText(/configured|scenario|pricing/i);
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

  await selectScenarioOption(page, "Loan Purpose", "refinance");

  await expect(page.locator(".scenario-control-label", { hasText: "Estimated Value" })).toBeVisible();
  await expect(page.locator(".scenario-control-label", { hasText: "Purchase Price" })).toHaveCount(0);
  await fillScenarioInput(page, "Estimated Value", "650000");
  await fillScenarioInput(page, "Loan Amount", "400000");
  await fillScenarioInput(page, "Credit Score", "740");

  await expect(page.locator(".payment-value")).not.toHaveText("");
  await expectNoBadPageText(page);
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
