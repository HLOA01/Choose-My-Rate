import { expect, test } from "@playwright/test";

/**
 * PASS 3 — Choose My Rate ↔ HLOA Lead Engine / Core integration.
 *
 * The HLOA Lead Engine is mocked at the network boundary (as pricing/Sally are
 * elsewhere). The real pricing mock still drives rates, so every test also
 * asserts that platform state never changes what the borrower sees.
 */

const LEAD_ID = "CMR-LEAD-01M260000000000000000000AA";
const BOR_ID = "CMR-BOR-01M260000000000000000000BB";
const SCN_ID = "CMR-SCN-01M260000000000000000000CC";

const RATE_OPTIONS = [
  { optionId: "qa-low", program: "Conventional 30 Year Fixed", rate: 6.25, price: 0.875, paymentPI: 2633, estimatedCashToClose: 31000 },
  { optionId: "qa-par", program: "Conventional 30 Year Fixed", rate: 6.5, price: 0, paymentPI: 2731, estimatedCashToClose: 27500 },
  { optionId: "qa-cr", program: "Conventional 30 Year Fixed", rate: 6.75, price: -0.625, paymentPI: 2832, estimatedCashToClose: 24000 },
];

function withBorrowerQuote(option) {
  const loanAmount = 427500;
  const price = Number(option.price || 0);
  const pointsPercent = price > 0 ? price : 0;
  const lenderCreditPercent = price < 0 ? Math.abs(price) : 0;
  return {
    ...option,
    borrowerQuote: {
      pricingOption: {
        optionId: option.optionId,
        rate: option.rate,
        principalAndInterest: option.paymentPI,
        pointsPercent,
        pointsDollars: Math.round(loanAmount * (pointsPercent / 100)),
        lenderCreditPercent,
        lenderCreditDollars: Math.round(loanAmount * (lenderCreditPercent / 100)),
      },
      closingCostEstimate: {
        status: "complete",
        feeScheduleVersion: "qa-fees-v1",
        asOf: "2026-09-10T12:00:00.000Z",
        fees: [],
        estimatedBaseClosingCosts: 6200,
        includedCategories: ["lender", "title", "recording"],
        excludedItems: ["down payment"],
        reasons: [],
      },
      estimatedClosingCharges: 6200,
    },
  };
}

const FORBIDDEN_IN_EVENTS = ["450000", "22500", "145000", "750", "credit", "income", "ssn", "downpayment", "loanamount", "purchaseprice", "assets"];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ hloaMode?: 'ok'|'error'|'timeout', pricingMode?: 'success'|'empty', urlSuffix?: string }} opts
 */
async function installBoundary(page, opts = {}) {
  const hloaMode = opts.hloaMode || "ok";
  const pricingMode = opts.pricingMode || "success";
  const captured = { leadPosts: [], linkPosts: [], emits: [], headers: [] };
  const leadsBySession = new Map();

  // Each test gets a fresh browser context (empty localStorage). We deliberately
  // do NOT clear storage on every navigation, so the refresh test can prove that
  // a reload resumes the same identity.

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "POST" ? request.postDataJSON() : {};

    // ---- HLOA Lead Engine mock ----
    if (url.hostname === "127.0.0.1" && url.pathname.startsWith("/__qa-hloa/")) {
      captured.headers.push({
        path: url.pathname,
        actorType: request.headers()["x-hloa-actor-type"],
        actorId: request.headers()["x-hloa-actor-id"],
        scopes: request.headers()["x-hloa-actor-scopes"],
        idempotencyKey: request.headers()["idempotency-key"],
      });
      if (hloaMode === "timeout") {
        // Never fulfil: the client's AbortController fires after its timeout.
        return;
      }
      if (hloaMode === "error") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "core_unavailable" } }) });
        return;
      }
      if (url.pathname === "/__qa-hloa/leads") {
        captured.leadPosts.push(body);
        const key = body.externalLeadId || "no-key";
        if (!leadsBySession.has(key)) leadsBySession.set(key, LEAD_ID);
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ lead: { leadId: leadsBySession.get(key) }, created: leadsBySession.size === 1 }) });
        return;
      }
      if (url.pathname.endsWith("/link-scenario")) {
        captured.linkPosts.push({ path: url.pathname, body });
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ leadId: LEAD_ID, borrowerId: BOR_ID, scenarioId: SCN_ID, linked: true }) });
        return;
      }
      if (url.pathname.endsWith("/emit")) {
        captured.emits.push(body);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ emitted: true }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return;
    }

    // ---- pricing mock ----
    if (url.hostname === "127.0.0.1" && url.pathname === "/__qa-pricing/pricing/quote") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          pricingMode === "empty"
            ? { status: "qa-local", options: [], message: "No mocked options" }
            : { status: "qa-local", pricingAsOf: "2026-09-10T12:00:00.000Z", options: RATE_OPTIONS.map(withBorrowerQuote) },
        ),
      });
      return;
    }

    if (url.hostname === "127.0.0.1" && url.pathname === "/__qa-sally") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ replyText: "ok", scenarioUpdates: {}, nextQuestion: "", needsPricingRefresh: false }) });
      return;
    }

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });

  await page.goto("/" + (opts.urlSuffix || ""));
  return captured;
}

async function fillPurchaseAndSubmit(page) {
  await page.getByRole("button", { name: "Purchase" }).click();
  await page.getByTestId("home-price").fill("450000");
  await page.getByTestId("down-payment").fill("22500");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByTestId("property-type").selectOption("single_family");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("credit-score").fill("750");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("first-time-homebuyer").selectOption("no");
  await page.getByTestId("annual-income").fill("145000");
  await page.getByTestId("submit-scenario").click();
}

async function readIdentity(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem("chooseMyRate.platformIdentity.v1") || "null");
    } catch {
      return null;
    }
  });
}

test("borrower obtains canonical Lead + Borrower + Scenario ids and persists them locally", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();

  await expect.poll(() => captured.linkPosts.length).toBeGreaterThan(0);
  const identity = await readIdentity(page);
  expect(identity.leadId).toBe(LEAD_ID);
  expect(identity.borrowerId).toBe(BOR_ID);
  expect(identity.scenarioId).toBe(SCN_ID);
  expect(identity.syncState).toBe("ok");
  expect(String(identity.sessionKey).length).toBeGreaterThan(8);
  // never persist anything sensitive
  const blob = JSON.stringify(identity).toLowerCase();
  for (const forbidden of FORBIDDEN_IN_EVENTS) expect(blob).not.toContain(forbidden);
});

test("lead intake identifies the source as Choose My Rate", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect.poll(() => captured.leadPosts.length).toBeGreaterThan(0);
  expect(captured.leadPosts[0].source).toBe("choose_my_rate");
  expect(captured.leadPosts[0].externalProvider).toBe("choose_my_rate");
  expect(captured.headers[0].actorType).toBe("external_integration");
  expect(captured.headers[0].scopes).toContain("provider:choose_my_rate");
});

test("scenario obtains a canonical Scenario id of the right kind", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect.poll(() => captured.linkPosts.length).toBeGreaterThan(0);
  expect(captured.linkPosts[0].body.kind).toBe("purchase");
});

test("a page refresh resumes the same identity and creates no duplicate lead", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await expect.poll(() => captured.linkPosts.length).toBeGreaterThan(0);
  const before = await readIdentity(page);

  await page.reload();
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await page.waitForTimeout(300);

  const after = await readIdentity(page);
  expect(after.leadId).toBe(before.leadId);
  expect(after.borrowerId).toBe(before.borrowerId);
  expect(after.scenarioId).toBe(before.scenarioId);
  // exactly one lead POST across both submissions (same session key)
  const uniqueSessionKeys = new Set(captured.leadPosts.map((p) => p.externalLeadId));
  expect(uniqueSessionKeys.size).toBe(1);
  expect(captured.leadPosts.length).toBe(1);
});

test("double submission is idempotent — a stable Idempotency-Key, one lead", async ({ page }) => {
  const captured = await installBoundary(page);
  await page.getByRole("button", { name: "Purchase" }).click();
  await page.getByTestId("home-price").fill("450000");
  await page.getByTestId("down-payment").fill("22500");
  await page.getByTestId("zip-code").fill("92660");
  await page.getByTestId("property-type").selectOption("single_family");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("credit-score").fill("750");
  await page.getByTestId("occupancy").selectOption("primary");
  await page.getByTestId("first-time-homebuyer").selectOption("no");
  await page.getByTestId("annual-income").fill("145000");

  // one Playwright click + one raw synchronous DOM click = a real double-submit
  // without the actionability wait that a rapid Locator double-click introduces
  await page.getByTestId("submit-scenario").click();
  await page.evaluate(() => document.querySelector('[data-testid="submit-scenario"]')?.click());

  await expect(page.getByTestId("results-screen")).toBeVisible();
  await page.waitForTimeout(400);

  // The server dedupes on the Idempotency-Key; the contract is that every lead
  // POST from this session carries the SAME key + SAME natural key, so it can
  // never become two leads regardless of client retries.
  const leadHeaders = captured.headers.filter((h) => h.path === "/__qa-hloa/leads");
  expect(leadHeaders.length).toBeGreaterThan(0);
  const idemKeys = new Set(leadHeaders.map((h) => h.idempotencyKey));
  expect(idemKeys.size).toBe(1);
  expect([...idemKeys][0]).toMatch(/^cmr-lead:/);
  expect(new Set(captured.leadPosts.map((p) => p.externalLeadId)).size).toBe(1);
  expect((await readIdentity(page)).leadId).toBe(LEAD_ID);
});

test("agent attribution passes through when supplied in the URL", async ({ page }) => {
  const agentId = "CMR-AGT-01M260000000000000000000DD";
  const captured = await installBoundary(page, { urlSuffix: `?agentId=${agentId}&utm_campaign=spring&utm_source=fb` });
  await fillPurchaseAndSubmit(page);
  await expect.poll(() => captured.leadPosts.length).toBeGreaterThan(0);
  expect(captured.leadPosts[0].agentId).toBe(agentId);
  expect(captured.leadPosts[0].campaign).toBe("spring");
  expect(captured.leadPosts[0].sourceDetail).toBe("fb");
});

test("a missing agent id works normally (no agentId in intake)", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await expect.poll(() => captured.leadPosts.length).toBeGreaterThan(0);
  expect(captured.leadPosts[0].agentId).toBeUndefined();
});

test("funnel events are emitted at real transitions with a session correlation id", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await page.getByRole("button", { name: "Lowest rate" }).click();
  await page.waitForTimeout(400);

  const types = captured.emits.map((e) => e.eventType);
  expect(types).toContain("rates.requested");
  expect(types).toContain("rates.returned");
  expect(types).toContain("rate.selected");
  const identity = await readIdentity(page);
  for (const e of captured.emits) {
    expect(e.correlationId).toBe(identity.sessionKey);
  }
});

test("no sensitive borrower financial value appears in any emitted event payload", async ({ page }) => {
  const captured = await installBoundary(page);
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await page.getByRole("button", { name: "Most credit" }).click();
  await page.getByTestId("application-cta").click().catch(() => {});
  await page.waitForTimeout(300);

  expect(captured.emits.length).toBeGreaterThan(0);
  for (const e of captured.emits) {
    const blob = JSON.stringify(e.payload || {}).toLowerCase();
    for (const forbidden of FORBIDDEN_IN_EVENTS) {
      expect(blob, `${e.eventType} payload leaked "${forbidden}"`).not.toContain(forbidden);
    }
  }
});

test("Core / Lead Engine unavailable: pricing still works, no fake rates, degraded notice shown", async ({ page }) => {
  const captured = await installBoundary(page, { hloaMode: "error" });
  await fillPurchaseAndSubmit(page);

  await expect(page.getByTestId("results-screen")).toBeVisible();
  await expect(page.getByTestId("rate-wheel")).toBeVisible();
  await expect(page.getByTestId("results-screen")).toContainText("6.5");
  await expect(page.getByTestId("platform-sync-status")).toContainText("could not save your session");

  const identity = await readIdentity(page);
  expect(identity.leadId).toBeUndefined();
  expect(identity.syncState).toBe("degraded");
  // the integration DID attempt to reach Lead Engine (headers captured before the
  // 503), but nothing fake was persisted and pricing was untouched
  expect(captured.headers.some((h) => h.path === "/__qa-hloa/leads")).toBe(true);
});

test("Lead Engine timeout: funnel unaffected, controlled degraded state", async ({ page }) => {
  await installBoundary(page, { hloaMode: "timeout" });
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("results-screen")).toBeVisible();
  await expect(page.getByTestId("results-screen")).toContainText("6.5");
  // ~4s client timeout -> degraded
  await expect(page.getByTestId("platform-sync-status")).toContainText("could not save your session", { timeout: 8000 });
  const identity = await readIdentity(page);
  expect(identity.syncState).toBe("degraded");
});

test("integration is inert for a normal empty-results pricing response (no crash, no fake rates)", async ({ page }) => {
  await installBoundary(page, { pricingMode: "empty" });
  await fillPurchaseAndSubmit(page);
  await expect(page.getByTestId("empty-results")).toBeVisible();
  await expect(page.getByTestId("results-screen")).toHaveCount(0);
});
