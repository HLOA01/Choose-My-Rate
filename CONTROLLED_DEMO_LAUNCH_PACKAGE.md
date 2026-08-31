# Choose My Rate Controlled Demo Launch Package

Purpose: give Cesar a simple, safe package for showing Choose My Rate in a controlled internal demo using the verified Render pricing backend.

This is not a public borrower launch package. Do not use this demo with public borrowers yet.

## Demo Readiness Summary

Choose My Rate is ready for a controlled internal demo.

Verified demo baseline:

- Root frontend app: `C:\Users\Owner\OneDrive\Desktop\choose-my-rate`
- Pricing backend: `https://choose-my-rate-pricing-engine.onrender.com`
- Root frontend env: `VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com`
- Render backend `/health` is healthy with a non-null `currentLivePricingVersion`.
- Render `/pricing/quote` returns `status: live`.
- Pricing uses a DB UUID `pricingVersionId`, not `dev-prmg-xls`.
- Borrower-facing pricing keeps lender names hidden.
- Latest Render-backed dry run passed 23/23 checks.

## What Is Working

- Purchase scenario input and pricing display.
- Configured pricing engine mode with Render-backed PRMG pricing.
- FHA vs Conventional comparison.
- Rate-and-term refinance comparison.
- Cash-out refinance comparison.
- Debt consolidation refinance cash-flow estimate.
- Sally guided refinance data collection.
- Sally refinance explanations and missing-input guardrails.
- Borrower-facing disclosures for estimates, pricing changes, rate-lock status, approval status, underwriting eligibility, cash-out estimates, debt-consolidation estimates, and later lender disclosure.
- QA harnesses:
  - `npm.cmd run qa:scenarios`
  - `npm.cmd run qa:sally`
  - `npm.cmd run qa:browser`
  - `npm.cmd run build`
  - `npm.cmd audit --omit=dev`

## What Is Not Public-Release Ready Yet

- Compliance has not approved final borrower-facing wording.
- Final lender/licensing disclosure placement is not approved.
- Hosted frontend production domain/subdomain is not finalized.
- Render Postgres plan, expiration, backups, and upgrade path need review before a longer public pilot.
- Final borrower application or handoff flow is not verified.
- Production monitoring and rollback ownership still need final owners.
- Backend `xlsx` parser risk is accepted only for controlled demo use and needs mitigation planning before public production scale.

## Demo Startup Checklist

1. Confirm `.env` points to the Render backend:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

2. Confirm `.env` is not staged or committed.

```powershell
git status --short
```

3. Confirm Render backend health:

```powershell
Invoke-RestMethod https://choose-my-rate-pricing-engine.onrender.com/health
```

Acceptable signals:

- `status` is `ok`.
- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`, or `skipped` with a no-change message after a live version already exists.

4. Run the root checks:

```powershell
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
npm.cmd run build
npm.cmd audit --omit=dev
```

5. Start the frontend:

```powershell
npm.cmd run dev
```

6. Open the local Vite URL, usually:

```text
http://127.0.0.1:5173/
```

7. Enter a complete purchase scenario and confirm:

- Pricing panel shows `CONFIGURED PRICING ENGINE`.
- `Demo pricing mode` is not showing.
- The development fallback banner is not showing.
- Pricing options populate.
- Lender names are not visible.

## Demo Script In Plain Language

### 1. Open With The Purpose

"This is Choose My Rate. The goal is to help a borrower or loan officer compare mortgage options clearly, while keeping pricing explanations simple and controlled."

### 2. Purchase Scenario

Enter a purchase example:

- Purchase price.
- Down payment.
- Credit score.
- Occupancy.
- ZIP code.

Say:

"The app turns the borrower scenario into a pricing view. The borrower sees the rate and payment tradeoffs, but lender names stay hidden from the borrower-facing UI."

### 3. Pricing Panel

Show:

- `CONFIGURED PRICING ENGINE`.
- Estimated monthly payment.
- Rate and points/credit tradeoff.
- Pricing disclosure.

Say:

"This demo is connected to the Render pricing backend. These figures are estimates, pricing can change, and nothing here is a rate lock or loan approval."

### 4. FHA Vs Conventional

Run the FHA vs Conventional comparison.

Say:

"This helps explain the tradeoff between estimated payment, upfront cash, and mortgage insurance. It is a comparison tool, not an underwriting decision."

### 5. Rate-And-Term Refinance

Switch to rate-and-term refinance and enter or load a clean scenario.

Show:

- Current payment.
- New payment.
- Monthly savings or increase.
- Break-even.
- New LTV.

Say:

"This is a borrower-facing refinance summary. It explains the estimate in plain English and keeps missing values safe."

### 6. Cash-Out Refinance

Switch to cash-out refinance.

Show:

- Requested cash out.
- Net cash to borrower.
- New loan amount.
- New LTV.
- High cash-out warning if applicable.

Say:

"Cash-out proceeds are estimates and depend on final underwriting, equity, fees, and program eligibility."

### 7. Debt Consolidation Refinance

Set refinance purpose to debt consolidation.

Show:

- Debt being paid off.
- Current debt monthly payments.
- Estimated monthly cash-flow impact.

Say:

"This is a simple monthly cash-flow estimate. It is not a full debt payoff timeline or interest-savings engine yet."

### 8. Sally Guided Refinance

Use Sally:

```text
I want to refinance
```

Then:

```text
500k
new rate is 6.5
explain my refinance
```

Say:

"Sally guides the borrower through missing inputs and explains the comparison only from the controlled scenario data. If required values are missing, Sally asks for them instead of guessing."

## Safe Talking Points

- "This is a controlled internal demo."
- "Pricing is subject to change."
- "Rates are not locked."
- "This is not a loan approval."
- "Payments and cash-out proceeds are estimates."
- "Program eligibility is subject to final underwriting."
- "Lender disclosures happen later in the official loan process."
- "Lender names are intentionally hidden from the borrower-facing pricing UI."
- "The app is using the configured pricing engine when `CONFIGURED PRICING ENGINE` is visible."

## Things Not To Say

Do not say:

- "You are approved."
- "This loan is approved."
- "The rate is locked."
- "This pricing is guaranteed."
- "This is final pricing."
- "This is a final lender disclosure."
- "This is ready for public borrowers."

## Backup Plan If Render Backend Is Slow Or Unavailable

1. Refresh the app once and wait for Render to wake up.
2. Check backend health:

```powershell
Invoke-RestMethod https://choose-my-rate-pricing-engine.onrender.com/health
```

3. If health is unavailable, do not present live pricing as working.
4. If continuing the demo, switch to a non-pricing walkthrough:
   - Scenario controls.
   - Refinance comparison panel behavior.
   - Sally guided data collection.
   - Disclosures and guardrails.
5. If mock pricing appears, clearly state that it is demo fallback only and do not present those numbers as live pricing.
6. Optional controlled fallback: use the local DB-backed backend only if it has already been started and verified according to `INTERNAL_DEMO_SCRIPT.md`.

## Known Blockers Before Public Launch

- Compliance approval for borrower-facing language.
- Final production domain/subdomain.
- Hosted frontend production environment configuration.
- Render Postgres plan, expiration, backups, and upgrade path.
- Final borrower application or handoff flow.
- Final lender/licensing disclosure placement.
- Backend `xlsx` parser mitigation plan.
- Production monitoring, alerting, and rollback ownership.

## Suggested Audience

Safe controlled-demo audience:

- Cesar only.
- Eduardo.
- Trusted HLOA internal team.

Not ready for:

- Public borrowers.
- Paid acquisition traffic.
- Unsupervised borrower self-service.
- Public launch demos without compliance review.
