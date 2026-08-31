# Choose My Rate Deployment Readiness Checklist

Date: June 13, 2026

Active root app:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

Do not edit or deploy from the nested repo unless explicitly instructed:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate
```

## Local Development Checks

- Confirm the app is running from the root workspace.
- Confirm `.env` is present locally and is not committed.
- Confirm `.env.example` documents all required public Vite environment variables.
- Confirm local mock pricing is visibly labeled as `Demo pricing mode`.
- Confirm mock pricing is used only for local development or controlled internal QA.
- Confirm borrower-facing screens do not say rates are locked, pricing is approved, or the loan is approved.
- Confirm borrower-facing pricing options do not expose lender names.
- Confirm the nested `Choose-My-Rate/` repo is not staged or committed.

## Controlled Internal Demo Checks

- Use `INTERNAL_DEMO_SCRIPT.md` as the controlled founder/internal demo runbook.
- Use `RENDER_DEPLOYMENT_CHECKLIST.md` before creating Render backend or managed Postgres resources.
- Confirm the demo audience understands that payment, pricing, cash-out, debt consolidation, and savings outputs are estimates.
- Confirm whether the demo should use the configured pricing engine or local mock pricing.
- If using mock pricing, confirm `Demo pricing mode` is visible before presenting pricing results.
- If using configured pricing engine data, confirm `VITE_PRICING_ENGINE_API_URL` points to the intended demo pricing endpoint.
- For the verified Render backend, use `VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com`.
- Confirm Sally responses avoid approval, lock, guarantee, and lender-name wording.
- Confirm refinance, cash-out, debt consolidation, purchase, and FHA vs Conventional flows have been smoke-tested immediately before the demo.
- Confirm the root local `.env` points to the Render backend for the controlled demo and is not staged or committed.
- Confirm the local frontend shows configured pricing engine, does not show `Demo pricing mode`, and does not show the development fallback banner.

## Production Deployment Blockers

Public borrower release is blocked until:

- Compliance approves borrower-facing pricing, payment, savings, cash-out, debt consolidation, and comparison wording.
- The production pricing engine URL is verified in the deployment environment.
- Lender/licensing disclosure placement is approved.
- Borrower application or handoff flow is verified.
- Responsive/mobile QA is completed.
- Accessibility and keyboard-navigation QA is completed.
- Mock/demo pricing cannot be mistaken for final borrower pricing.
- Production monitoring, logging, and rollback ownership are defined.
- Render Postgres plan, expiration, backup, and upgrade path are approved before any long-running public pilot.
- Remaining backend `xlsx` parser risk has an approved mitigation path before public production scale.

## Required Environment Variables

```text
VITE_PRICING_ENGINE_API_URL
VITE_SALLY_API_URL
VITE_SALLY_VOICE_API_URL
VITE_SALLY_VOICE_MODE
```

Environment notes:

- `VITE_PRICING_ENGINE_API_URL` must point to the intended pricing-engine API base URL for live or controlled-demo pricing-engine verification.
- Leaving `VITE_PRICING_ENGINE_API_URL` blank is allowed only for local development and QA of mock-pricing guardrails.
- When `VITE_PRICING_ENGINE_API_URL` is blank, the app should show `Demo pricing mode` and use mock pricing only as a development fallback.
- Sally and voice environment variables should be configured only according to the intended deployment target.

## Pricing Engine API Verification

Before a controlled demo with configured pricing:

- Use `CLOUD_DEPLOYMENT_PLAN.md` before creating hosted backend or cloud Postgres resources.
- Use `RENDER_DEPLOYMENT_CHECKLIST.md` for the Render-specific backend, Postgres, environment, verification, and rollback checklist if Render is selected.
- Confirm the pricing-engine API is reachable from the deployed frontend environment.
- Confirm CORS and network policy allow frontend requests to the pricing engine.
- Confirm the pricing panel displays configured pricing-engine mode, not mock/demo mode.
- Confirm fallback behavior is visible and clearly labeled if the pricing engine is unavailable.
- Confirm the pricing engine response does not expose lender names in borrower-facing UI.
- Confirm pricing output remains estimate/disclosure-safe and does not imply approval or rate lock.

Verified Render pricing backend baseline:

- Render backend API: `https://choose-my-rate-pricing-engine.onrender.com`.
- `/health.status` is `ok`.
- `/health.currentLivePricingVersion` is not null.
- `/health.lastRefresh.status` is `published`.
- A later `/health.lastRefresh.status` or `scheduler.lastRunStatus` of `skipped` can be acceptable when the message says no source-file change was detected and `currentLivePricingVersion` remains non-null.
- `/pricing/quote.status` is `live`.
- `/pricing/quote.pricingVersionId` is a DB UUID rather than `dev-prmg-xls`.
- Safe purchase quote test returned 13 pricing options.
- Borrower-facing options keep `displayLender` false and do not expose lender names.
- Root local `.env` can point `VITE_PRICING_ENGINE_API_URL` to the Render backend for configured pricing-engine verification.

Local DB-backed verification baseline:

- Local PostgreSQL version verified: `16.14`.
- Local database name: `choose_my_rate_pricing`.
- Local backend API: `http://localhost:4100`.
- Local frontend env: `VITE_PRICING_ENGINE_API_URL=http://localhost:4100`.
- Keep `ENABLE_DEV_PRMG_FALLBACK=false` in the local pricing-engine backend when verifying DB-backed pricing.
- DB-backed pricing is active when `/health.currentLivePricingVersion` is not null, `/health.lastRefresh.status` is `published`, `/pricing/quote.pricingVersionId` is a DB UUID rather than `dev-prmg-xls`, and `/health` does not include a `devPrmgFallback` section.
- The frontend pricing panel should show configured pricing engine and should not show `Demo pricing mode`.
- Do not document or commit database credentials or admin keys.
- Public production still requires a deployed backend HTTPS URL and cloud Postgres.

## Mock/Demo Pricing Restrictions

- Mock pricing is development-only.
- Mock pricing must not be presented as final borrower pricing.
- Mock pricing must remain visibly labeled as `Demo pricing mode`.
- Mock pricing should be used only when `VITE_PRICING_ENGINE_API_URL` is intentionally blank or the configured engine is unavailable during local QA.
- Pricing-engine dev fallback should only be enabled intentionally for local fallback demos, not DB-backed pricing verification.
- Any internal demo using mock pricing should verbally state that the numbers are illustrative.

## Compliance/Disclosure Review

Confirm final approved wording for:

- Payment estimates.
- Pricing subject to change.
- Rates not locked.
- Not a loan approval.
- Cash-out proceeds are estimates.
- Debt consolidation cash-flow impact is an estimate.
- Program eligibility and final underwriting.
- Lender disclosure timing during the official loan process.

## Lender/Licensing Disclosure Review

- Confirm required lender, licensing, state, and regulatory disclosures.
- Confirm where disclosures must appear in the borrower flow.
- Confirm whether disclosures are needed before pricing, before application handoff, or both.
- Confirm borrower-facing UI does not expose lender names before the approved disclosure point.

## QA Commands

Run from the root workspace:

```powershell
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
```

## Build Command

```powershell
npm.cmd run build
```

## Audit Command

```powershell
npm audit --omit=dev
```

Review any production dependency findings before deployment. Dev dependency findings should be evaluated before exposing development tooling or dev servers outside trusted local use.

## Browser QA Command

```powershell
npm.cmd run qa:browser
```

Current browser QA covers purchase controls, FHA vs Conventional comparison, refinance panel visibility, refinance input flows, debt consolidation fields, high cash-out warning, Sally refinance prompts, guardrails against bad calculated values, and responsive smoke checks at:

- Desktop: `1440x900`
- Laptop: `1280x800`
- Tablet: `768x1024`
- Mobile: `390x844`

The responsive checks confirm core panels remain usable, important controls have accessible names, the loan-purpose selector can receive keyboard focus, and the page does not show page-breaking horizontal overflow.

## Rollback And Checkpoint Instructions

- Confirm the latest known-good commit hash before deployment.
- Tag or record a deployment checkpoint before promoting a build.
- Keep the prior deployed artifact available until the new deployment passes smoke checks.
- If pricing, Sally, or borrower-facing disclosures regress, roll back to the last known-good deployment.
- After rollback, rerun:

```powershell
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
npm.cmd run build
npm audit --omit=dev
```
