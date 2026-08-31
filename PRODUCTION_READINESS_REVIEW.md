# Choose My Rate Production Readiness Review

Date: June 13, 2026

## Scope

This review covers the current root Choose My Rate app at:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

The nested repo was not reviewed or changed:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate
```

## Readiness Summary

The app is demo-ready for controlled internal or stakeholder demonstrations of:

- Purchase scenario entry and pricing display.
- FHA vs Conventional comparison.
- Rate-and-term refinance comparison.
- Cash-out refinance comparison.
- Debt consolidation refinance cash-flow estimate.
- Sally-guided refinance data collection and explanation.

The controlled demo can now use the Render pricing backend at `https://choose-my-rate-pricing-engine.onrender.com`, with DB-backed PRMG pricing published live. The app is not yet production-ready for unsupervised borrower release. The main gaps are compliance approval, final domain/subdomain decisions, Render Postgres plan/expiration review, lender/licensing disclosure placement, lead/application handoff details, and `xlsx` parser mitigation planning before public production scale.

## Blockers Before Public Borrower Release

- Compliance review is still required for borrower-facing pricing, savings, cash-out, debt consolidation, and comparison language.
- Lender/license/legal disclosure placement needs final business approval.
- Hosted frontend deployment must be configured and smoke-tested with `VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com` or the final approved pricing backend URL.
- Render Postgres plan, expiration, backups, and upgrade path need review before any long-running public pilot.
- The remaining backend `xlsx` parser risk is accepted only for controlled demo use and needs mitigation planning before public production scale.
- Refinance pricing currently uses comparison helpers and entered refinance assumptions; a dedicated live refinance pricing mapper is still a future decision.
- Full end-to-end borrower handoff/application flow is not verified in this pass.

## Warnings

- Development mock pricing is available when the pricing engine URL is not configured. This is useful for local development but should not be used as borrower-facing production pricing.
- `npm audit --omit=dev` reported 0 production dependency vulnerabilities.
- Full `npm audit` reported dev-dependency findings in Vite/PostCSS. These affect development tooling and should be addressed before exposing any dev server outside trusted local use.
- Browser SpeechRecognition can fail with network/browser issues; OpenAI transcription remains the recommended long-term voice path.

## Refinance Flow Review

Rate-and-term refinance:

- Scenario fields are visible only for refinance scenarios.
- Current payment, new payment, payment change, closing costs, break-even, and LTV are shown safely.
- Missing values remain pending instead of crashing.

Cash-out refinance:

- Requested cash out, net cash to borrower, and new LTV are shown.
- High cash-out warning appears when requested cash out exceeds available equity.
- Sally does not state approval or locked-rate language in tested flows.

Debt consolidation refinance:

- Debt amount and current debt payment fields appear only for `debt_consolidation`.
- Monthly cash-flow impact is clearly presented as a simple estimate.
- The app does not calculate payoff timelines or interest savings yet, and the helper text says so.

Sally refinance behavior:

- Guided collection follows the controlled missing-field order.
- Explicit phrases such as `new rate is 6.5` are handled without overwriting the current rate.
- Short replies such as `25 years` fill the active missing field.
- Explanation responses include current/new payment, cash-out details, debt consolidation details when present, break-even, LTV, and refinance type.

## Purchase Flow Review

- Purchase fields remain the default scenario path.
- Purchase pricing behavior has not been intentionally changed by the refinance passes.
- FHA vs Conventional comparison remains available from the existing comparison button.
- Purchase browser smoke coverage verifies default purchase controls and comparison panel rendering.

## FHA vs Conventional Review

- Comparison panel opens from a completed purchase scenario.
- Both FHA and Conventional sides render in browser tests.
- Current comparison output is read-only and suitable for demo use.
- Final compliance wording and assumptions should be reviewed before borrower release.

## Pricing Integration Review

- The PRMG backend is documented as separate from the root frontend app.
- The frontend expects live pricing through `VITE_PRICING_ENGINE_API_URL`.
- If the URL is missing, local mock pricing is used for development only.
- Pass 18 added `.env.example` documentation for `VITE_PRICING_ENGINE_API_URL`.
- Browser QA runs with `VITE_PRICING_ENGINE_API_URL` blank on a dedicated test port to verify the no-API safe path.
- Mock pricing now shows a visible `Demo pricing mode` indicator and a development-only warning banner when active.
- Pass 19 added `DEPLOYMENT_READINESS_CHECKLIST.md` for environment, pricing-engine, disclosure, QA, audit, and rollback checks before demo or deployment.
- Pass 20B verified local DB-backed PRMG pricing with PostgreSQL 16.14, local database `choose_my_rate_pricing`, backend API `http://localhost:4100`, and frontend env `VITE_PRICING_ENGINE_API_URL=http://localhost:4100`.
- Local DB-backed success signals are: `/health.currentLivePricingVersion` not null, `/health.lastRefresh.status` is `published`, `/pricing/quote.pricingVersionId` is a DB UUID rather than `dev-prmg-xls`, no `devPrmgFallback` section is shown, and the frontend pricing panel shows configured pricing engine rather than Demo pricing mode.
- Keep `ENABLE_DEV_PRMG_FALLBACK=false` for local DB-backed pricing verification. Dev fallback should only be enabled intentionally for local fallback demos.
- Pass 22A verified the Render pricing backend at `https://choose-my-rate-pricing-engine.onrender.com`.
- Render `/health` is healthy with a non-null `currentLivePricingVersion` and `lastRefresh.status` of `published`.
- Render `/pricing/quote` returns `status: live`, a DB UUID `pricingVersionId`, 13 pricing options for the safe purchase test, `displayLender: false`, and no borrower-facing lender names.
- Pass 22B confirmed the local frontend can use the Render backend for controlled-demo verification without showing Demo pricing mode or the development fallback banner.
- Current Render scheduler health may show `lastRefresh.status` or `scheduler.lastRunStatus` as `skipped` when no PRMG source-file change is detected after a published version already exists. That is acceptable for the controlled demo as long as `currentLivePricingVersion` remains non-null and `/pricing/quote` returns `status: live`.
- Public production readiness still depends on hosted frontend environment promotion, final domain/subdomain decisions, compliance approval, lender/licensing disclosure placement, monitoring, and rollback ownership.

## Borrower-Facing Disclosures

Current tested guardrails include:

- Sally does not say the loan/refinance is approved.
- Sally does not say the rate is locked.
- Sally does not expose lender names in tested flows.
- Sally describes refinance outputs as estimates for comparison.
- FHA vs Conventional summary says rates are not locked until application and property address are complete.
- Pricing, comparison, and refinance panels now include concise borrower-facing disclosures for estimates, pricing changes, rate-lock status, approval status, underwriting eligibility, cash-out/debt-consolidation estimate limits, and later lender disclosures.

Remaining disclosure hardening:

- Confirm exact legal language for pricing subject to change, estimated payments, not an approval, and rate-lock conditions.
- Confirm how and when lender/licensing disclosures should appear.

## QA Coverage

Current automated coverage:

- `npm.cmd run qa:scenarios`: helper/scenario coverage for purchase, refinance, cash-out, debt consolidation, Sally intents, high cash-out, and missing inputs.
- `npm.cmd run qa:sally`: multi-turn Sally refinance conversation coverage.
- `npm.cmd run qa:browser`: Playwright Chromium smoke, full refinance browser-flow coverage, and responsive checks at 1440x900, 1280x800, 768x1024, and 390x844.
- `npm.cmd run build`: production build check.

Coverage gaps:

- No visual regression snapshots yet.
- One-off Render-backed frontend smoke verification has been completed; the standard `qa:browser` suite still intentionally blanks `VITE_PRICING_ENGINE_API_URL` to verify the Demo pricing guardrail.
- No lead/application handoff test.
- No automated accessibility audit command yet.
- Responsive/accessibility QA is basic coverage only; it verifies core panel usability, accessible names for important controls, keyboard focus for the loan-purpose selector, and page-level horizontal overflow guardrails.

## Small Fix Made In This Pass

- Replaced corrupted empty-value placeholder characters in pricing formatters with plain `-` so borrower-facing empty states render cleanly.

## Recommended Next Passes

1. Run the controlled internal demo using `INTERNAL_DEMO_SCRIPT.md`.
2. Configure and smoke-test the hosted frontend environment with the Render pricing backend.
3. Confirm compliance timing and lender/licensing disclosure placement before borrower-facing release.
4. Review Render Postgres plan, expiration, backups, and upgrade path before a longer-running public pilot.
5. Plan backend `xlsx` parser mitigation before public production scale.
