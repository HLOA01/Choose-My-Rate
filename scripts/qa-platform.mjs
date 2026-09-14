/**
 * Choose My Rate — HLOA platform integration QA (PASS 3).
 *
 * Pure, offline checks of the platform client helpers: event-payload
 * minimization, scenario-kind mapping, and URL attribution parsing.
 * No network, no browser, no bundler.
 */

import assert from "node:assert/strict";
import { buildFunnelEventPayload, mapScenarioKind, readUrlAttribution } from "../src/platform/hloaPlatform.js";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}: ${error.message}`);
  }
}

console.log("Choose My Rate HLOA Platform Integration QA");

const FORBIDDEN_KEYS = [
  "ssn", "income", "annualincome", "assets", "liabilities", "creditscore", "fico",
  "purchaseprice", "downpayment", "loanamount", "propertytaxes", "homeownersinsurance",
  "currentloanbalance", "accountnumber", "routingnumber",
];

check("event payload contains only non-sensitive classification metadata", () => {
  const payload = buildFunnelEventPayload({
    loanPurpose: "purchase",
    occupancy: "primary",
    loanTypePreference: "conventional",
    propertyType: "single_family",
    zipCode: "90210",
    purchasePrice: 750000,
    downPayment: 150000,
    loanAmount: 600000,
    creditScore: 760,
  });
  const blob = JSON.stringify(payload).toLowerCase();
  for (const key of FORBIDDEN_KEYS) {
    assert.ok(!blob.includes(key), `payload must not include "${key}"`);
  }
  assert.ok(!blob.includes("750000") && !blob.includes("600000") && !blob.includes("760"));
  assert.equal(payload.zipPrefix, "902");
  assert.equal(payload.loanPurpose, "purchase");
  assert.equal(payload.loanType, "conventional");
  assert.equal(payload.occupancy, "primary");
});

check("empty scenario yields an empty payload", () => {
  assert.deepEqual(buildFunnelEventPayload({}), {});
  assert.deepEqual(buildFunnelEventPayload(), {});
});

check("scenario kind mapping", () => {
  assert.equal(mapScenarioKind({ borrowerPath: "purchase" }), "purchase");
  assert.equal(mapScenarioKind({ borrowerPath: "refinance", refinanceGoal: "cash_out" }), "cash_out");
  assert.equal(mapScenarioKind({ borrowerPath: "refinance" }), "refinance");
  assert.equal(mapScenarioKind({}), "refinance");
});

check("url attribution: campaign + source detail + valid opaque referral token only", () => {
  const a = readUrlAttribution("?utm_campaign=spring&utm_source=fb&ref=a1b2c3d4e9");
  assert.equal(a.campaign, "spring");
  assert.equal(a.sourceDetail, "fb");
  assert.equal(a.referralToken, "a1b2c3d4e9");
  assert.deepEqual(readUrlAttribution(""), {});
});

check("url attribution: a raw canonical agentId in the URL is never captured -- not a trusted credential", () => {
  assert.equal(readUrlAttribution("?agentId=CMR-AGT-01J000000000000000000000ZZ").agentId, undefined);
  assert.equal(readUrlAttribution("?agentId=CMR-AGT-01J000000000000000000000ZZ").referralToken, undefined);
  assert.equal(readUrlAttribution("?agent=CMR-AGT-01J000000000000000000000ZZ").agentId, undefined);
});

check("url attribution: a malformed ref token (wrong shape) is rejected", () => {
  assert.equal(readUrlAttribution("?ref=Not-Valid!").referralToken, undefined);
  assert.equal(readUrlAttribution("?ref=").referralToken, undefined);
});

console.log(`Total: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
