# Choose My Rate Internal Demo Script

Purpose: controlled internal/founder demo of Choose My Rate using the local frontend and a verified DB-backed PRMG pricing engine.

This is not a public borrower launch checklist. Do not present demo outputs as a loan approval, locked rate, guaranteed pricing, or final lender disclosure.

## Pre-Demo Startup Checklist

### Render Pricing Backend Path

Use this path for the controlled demo unless the team intentionally chooses a local-backend fallback.

1. Confirm the Render backend health URL works:

```powershell
Invoke-RestMethod https://choose-my-rate-pricing-engine.onrender.com/health
```

Expected DB-backed signals:

- `status` is `ok`.
- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`, or `skipped` with a no-change message after a published live version already exists.

2. Confirm the root frontend local `.env` points to the Render backend:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

Do not commit `.env`.

3. Start the frontend from:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate
npm.cmd run dev
```

4. Open the frontend at the local Vite URL, usually:

```text
http://127.0.0.1:5173/
```

5. Enter a complete purchase scenario and verify:

- Pricing panel shows `CONFIGURED PRICING ENGINE`.
- `Demo pricing mode` is not showing.
- The development fallback banner is not showing.
- Rate stack and estimated payment populate from the Render backend.

### Local Backend Fallback Path

Use this path only if the Render backend is unavailable and the demo intentionally switches to local DB-backed pricing.

1. Start PostgreSQL.
2. Confirm local database `choose_my_rate_pricing` is available.
3. Start the pricing backend from:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
npm.cmd run dev
```

4. Verify backend health:

```powershell
Invoke-RestMethod http://localhost:4100/health
```

Expected DB-backed signals:

- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`.
- No `devPrmgFallback` section is shown.

5. Set the root frontend local `.env` to:

```env
VITE_PRICING_ENGINE_API_URL=http://localhost:4100
```

6. Start the frontend from:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate
npm.cmd run dev
```

7. Open the frontend at the local Vite URL, usually:

```text
http://127.0.0.1:5173/
```

8. Enter a complete purchase scenario and verify:

- Pricing panel shows `CONFIGURED PRICING ENGINE`.
- `Demo pricing mode` is not showing.
- Rate stack and estimated payment populate from the local backend.

## Local Environment Baseline

Root frontend:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

Frontend local env for Render-backed controlled demo:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

Frontend local env for local-backend fallback:

```env
VITE_PRICING_ENGINE_API_URL=http://localhost:4100
```

Pricing backend:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
```

Backend local API:

```text
http://localhost:4100
```

For DB-backed verification, keep the backend configured with:

```env
ENABLE_DEV_PRMG_FALLBACK=false
```

Do not document or share database credentials, admin keys, or other secrets.

## QA Commands

Run from the root frontend app before the demo:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
npm.cmd run build
npm.cmd audit --omit=dev
```

## Demo Flow

### 1. Purchase Scenario

Show the default purchase path:

- Purchase price.
- Down payment.
- Loan amount.
- Credit score.
- Occupancy.
- ZIP code.

Talking point: Choose My Rate turns borrower scenario inputs into a clear pricing view without exposing lender names in the borrower UI.

### 2. Pricing Engine Panel

After entering a complete purchase scenario, show:

- `CONFIGURED PRICING ENGINE`.
- Estimated monthly payment.
- Rate stack.
- Points/credit tradeoff.
- Pricing disclosure.

Talking point: The controlled demo is using DB-backed PRMG pricing through the configured pricing engine. Pricing is still subject to change and is not locked.

### 3. FHA vs Conventional Comparison

Run the FHA vs Conventional comparison from the purchase scenario.

Show:

- Monthly payment comparison.
- Cash-to-close/upfront comparison.
- Mortgage insurance comparison.
- Assumptions used.

Talking point: This is a comparison tool to help explain options, not a final underwriting decision.

### 4. Rate-and-Term Refinance

Switch to a rate-and-term refinance scenario.

Enter or load a clean demo scenario with:

- Property value.
- Current loan balance.
- Current rate.
- Current remaining term.
- New loan amount.
- New rate.
- New term.
- Estimated closing costs.

Show:

- Current payment.
- New payment.
- Monthly savings or increase.
- Break-even months.
- New LTV.

### 5. Cash-Out Refinance

Switch to a cash-out refinance scenario.

Show:

- Requested cash out.
- Net cash to borrower.
- New loan amount.
- New LTV.
- High cash-out warning when applicable.

Talking point: Cash-out proceeds are estimates and depend on final underwriting, equity, fees, and program eligibility.

### 6. Debt Consolidation Refinance

Set refinance purpose to debt consolidation.

Show:

- Debt being paid off.
- Current monthly debt payments.
- Estimated monthly cash-flow impact.

Talking point: This is a simple cash-flow estimate, not a debt payoff timeline or interest-savings engine.

### 7. Sally Guided Refinance Conversation

Use Sally with a prompt such as:

```text
I want to refinance
```

Then demonstrate short replies:

```text
500k
```

and explicit updates:

```text
new rate is 6.5
```

Ask:

```text
explain my refinance
```

Talking point: Sally guides data collection and explains estimates, while the app controls deterministic pricing/comparison logic. If required refinance inputs are still missing, Sally should ask for the missing comparison inputs instead of guessing.

## Latest Dry Run Notes

- Controlled Render-backed demo dry run passed purchase pricing, FHA vs Conventional comparison, rate-and-term refinance, cash-out refinance, debt consolidation refinance, and Sally guided refinance flow.
- Pricing panel showed `CONFIGURED PRICING ENGINE`, not `Demo pricing mode`.
- Disclosures were visible in pricing, comparison, and refinance areas.
- Lender names remained hidden from borrower-facing UI.
- Sally avoided approval, locked-rate, guarantee, and lender-name wording.
- A rehearsal friction point where Sally repeated a missing refinance field question was fixed before the latest dry run passed.

## Key Talking Points

- Lender names are hidden from borrower-facing pricing UI.
- Pricing is subject to change.
- Rates are not locked in this demo.
- This is not a loan approval.
- Final eligibility is subject to program rules and underwriting.
- Lender disclosures are provided later in the official loan process.
- DB-backed pricing is verified when the backend returns a DB UUID `pricingVersionId`, not `dev-prmg-xls`.

## Known Public Launch Blockers

- Compliance approval for borrower-facing language.
- Final production domain/subdomain.
- Render Postgres plan, expiration, backups, and upgrade path.
- Production frontend hosting and environment promotion.
- Final borrower application or handoff flow.
- Final lender/licensing disclosure placement.
- `xlsx` parser mitigation plan before public production scale.
- Production monitoring and rollback plan.

## Troubleshooting

### Backend Not Running

Check:

```powershell
Test-NetConnection localhost -Port 4100
```

If not listening, start backend:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
npm.cmd run dev
```

### Postgres Not Reachable

Check:

```powershell
Test-NetConnection localhost -Port 5432
```

If not reachable, start PostgreSQL before starting the backend.

### Demo Pricing Mode Is Showing

Check the root frontend env:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

Then restart the frontend dev server. Also confirm the Render pricing backend health URL is healthy.

### No Live Pricing Version

Check:

```powershell
Invoke-RestMethod https://choose-my-rate-pricing-engine.onrender.com/health
```

If `currentLivePricingVersion` is null, the pricing database does not have a published PRMG pricing version. Do not present DB-backed pricing until PRMG refresh has published successfully. A `lastRefresh.status` of `skipped` can be acceptable when the message says no source-file change was detected and a live pricing version already exists.

### Frontend Not Connecting To Backend

Confirm:

- Render backend health is healthy at `https://choose-my-rate-pricing-engine.onrender.com/health`.
- Root `.env` has `VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com`.
- Frontend dev server was restarted after env changes.
- Browser is loaded from the current frontend dev URL.
