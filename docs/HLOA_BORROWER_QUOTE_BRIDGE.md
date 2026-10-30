# Borrower quote contract bridge

This change follows the active `src/main.jsx` -> `SimplifiedBorrowerFunnel.jsx`
runtime. It adds no backend, lender connection, dependency or alternate UI.

Source contract: HLOA `197d5ea003dbd8b78322ba88f5adf9f97a6f0a85`,
`services/cmr-pricing-boundary/src/responseShaping.ts` (`BorrowerSafeQuoteResponse`)
and `quoteEnrichment.ts` (`BorrowerQuoteDetail`). That contract supplies `points`,
`lenderCreditFromPrice`, `feeCompleteness`, `estimatedClosingCosts`,
`estimatedCashToClose`, fee line items and monthly payment metadata. The active
CMR UI previously read only legacy `pricingOption`, `closingCostEstimate` and
`estimatedClosingCharges`, so it could not display the returned HLOA detail.

## Explicit adapters and financial meaning

`src/pricing/borrowerQuoteContract.js` defines client schema adapters named
`hloa-borrower-quote-v1` and `cmr-legacy-borrower-quote-v1`. These names identify
supported shapes; they are not server policy versions or approvals. Current
servers do not advertise these version labels, so recognition uses the named
structures in each existing contract. An explicit unknown version is unsupported.
An explicit new-contract field, including null or UNAVAILABLE, never falls back
to a conflicting legacy value. An advertised new version without its required
detail remains unavailable. Malformed fees cannot silently become a complete
total. Unknown rate statuses cannot become live because options are attached.

The UI preserves supplied rate percentages, points percentages, dollar amounts,
positive credit magnitudes with direction, and monthly P&I. It does not infer
decimal-vs-percent scaling, calculate APR, annualize a monthly payment, recalculate
fees, or turn missing costs into zero. PARTIAL_ESTIMATE displays a known-cost
subtotal and missing categories, with per-line statuses. A partial fee estimate
does not invalidate an otherwise usable rate. UNAVAILABLE has no synthesized
zero adjustment or cost total. The public allow-list removes unexpected internal
lender/raw pricing fields before storing options in UI state or sending them to
existing Sally UI calls.

## Request and selection lifecycle

Monotonic request generations reject obsolete success, error and comparison
handlers, even if transport ignores abort and the scenario goes A -> B -> A.
Scenario signatures additionally bind accepted rates to the current scenario.
A stale Sally completion cannot overwrite newer scenario/quote state.
Edits, Back/reset, repricing, selection changes, unavailable responses, explicit
server expiry, browser return and reload invalidate the applicable selection and
stored handoff. Reload never hydrates an old or incompatible handoff as pricing.

Only explicit server expiry fields are enforced; the existing HLOA public
contract has no expiry field, so no client max-age or lender validity threshold
is invented. Expired/superseded statuses or explicit snapshot state are rejected.
Apply rechecks current state, scenario binding and any explicit deadline before
preparing a handoff. Hidden server revocation or supersession while the browser
is idle cannot be detected without a server protocol. A real application
receiver must revalidate current pricing/approval before durable acceptance.

## Temporary application handoff

The existing sessionStorage key is retained, with an explicit version-2 payload.
It includes a local stable intent id for repeated attempts on the same selection,
scenario signature, supplied snapshot id, adapter version, fee completeness,
missing categories and known costs. `estimatedClosingCharges` stays null for
partial/unavailable estimates; known subtotals remain separately labelled.
Storage failure prevents navigation. No old payload is trusted on Apply.

Configured navigation preserves this prepared payload for the destination; a
return to CMR invalidates it. Neither preparation nor navigation emits
`application.started`. No receiving application, durable acceptance, lender
submission or cross-origin payload transport is implemented. SessionStorage is
origin-scoped and is not an LOS integration. The local intent id is not a
canonical HLOA application identity or proof of server-side idempotency.

## Verification and release scope

Synthetic fixtures live only in `tests/fixtures`; application code never imports
them. Their responses emulate the real protocol's live/warning shapes behind
mocked localhost network boundaries; the adapter never upgrades a TEST or unknown
status to live. No lender login or real quote is performed.

Run `npm run qa:quote-contract`, `npm run qa:browser` and
`npm run qa:application`, plus lint/build and existing scenario/Sally/platform QA.
The configured-destination cases run separately in CI; default omissions include
those separately executed tests and the previously superseded smoke suite.

This branch depends on CMR PR #3 (`31eacfc`) and is reviewed against that branch.
HLOA PR #25 remains a separate unmerged prerequisite for its server-side validity
gate and TEST adapter seam. No CRM/Lead Engine source, production resource,
existing database or borrower record is changed. Real policy approval, production
identity and actual application acceptance remain separate prerequisites.
