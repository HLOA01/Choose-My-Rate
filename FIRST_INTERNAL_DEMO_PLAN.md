# Choose My Rate First Internal Demo Plan

Purpose: give Cesar a simple plan for the first controlled internal demo of Choose My Rate with Eduardo or one trusted internal reviewer.

This is not a public borrower launch plan. Keep the demo controlled, internal, and framed as review of the current experience.

## Recommended First Demo Audience

Best first audience:

- Eduardo.

Good alternate first audience:

- One trusted HLOA internal reviewer who understands mortgage pricing, borrower experience, or compliance risk.

Do not use the first demo with:

- Public borrowers.
- Realtor or lender partners.
- Paid traffic.
- Unsupervised borrower self-service.
- Anyone who may interpret the demo as a public launch.

## Recommended Meeting Length

Recommended length: `30 minutes`.

Suggested timing:

- 3 minutes: context and restrictions.
- 15 minutes: live demo flow.
- 7 minutes: feedback questions.
- 5 minutes: decision and next step.

If the reviewer is Eduardo and wants deeper discussion, hold product strategy questions until after the core demo flow is complete.

## Pre-Demo Checklist

Before the meeting:

1. Confirm root frontend workspace:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

2. Confirm local `.env` points to Render:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

3. Confirm `.env` is not staged or committed:

```powershell
git status --short
```

4. Confirm Render backend health:

```powershell
Invoke-RestMethod https://choose-my-rate-pricing-engine.onrender.com/health
```

Acceptable signals:

- `status` is `ok`.
- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`, or `skipped` after a live version already exists.

5. Run the root checks:

```powershell
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
npm.cmd run build
npm.cmd audit --omit=dev
```

6. Start or confirm the frontend:

```powershell
npm.cmd run dev
```

7. Open the local app:

```text
http://127.0.0.1:5173/
```

8. In the purchase pricing panel, confirm:

- `CONFIGURED PRICING ENGINE` is visible.
- `Demo pricing mode` is not visible.
- Pricing options populate.
- Lender names are not visible.

## Opening Statement

Use this opening:

"This is a controlled internal demo of Choose My Rate. The goal is to show how a borrower or loan officer can compare mortgage pricing and refinance options in plain language. This is not public borrower launch, not a loan approval, not a locked rate, and not final pricing."

Then add:

"I am looking for blockers, confusing moments, and the single most important next improvement."

## Demo Flow Order

Follow this order.

### 1. Purchase Scenario

Show:

- Purchase price.
- Down payment.
- Loan amount.
- Credit score.
- Occupancy.
- ZIP code.

Say:

"The app turns borrower scenario inputs into a clear pricing view without exposing lender names in the borrower-facing UI."

### 2. Pricing Engine Panel

Show:

- `CONFIGURED PRICING ENGINE`.
- Live pricing as of timestamp.
- Estimated monthly payment.
- Rate stack.
- Points/credit tradeoff.
- Pricing disclosure.

Say:

"This demo is using the configured Render pricing backend. The figures are estimates, pricing can change, and rates are not locked."

Pause here and ask whether the pricing display feels credible and understandable.

### 3. FHA Vs Conventional

Run the comparison from the purchase scenario.

Show:

- FHA side.
- Conventional side.
- Monthly payment comparison.
- Cash-to-close/upfront comparison.
- Mortgage insurance comparison.
- Assumptions and disclosure.

Say:

"This is a comparison tool to help explain tradeoffs. It is not an underwriting decision."

### 4. Rate-And-Term Refinance

Switch to rate-and-term refinance.

Show:

- Current payment.
- New payment.
- Monthly savings or increase.
- Break-even.
- New LTV.

Say:

"This summary is meant to make the refinance tradeoff understandable without guessing when required inputs are missing."

### 5. Cash-Out Refinance

Switch to cash-out refinance.

Show:

- Requested cash out.
- Net cash to borrower.
- New loan amount.
- New LTV.
- Any high cash-out warning if applicable.

Say:

"Cash-out proceeds are estimates and depend on final underwriting, equity, fees, and program eligibility."

### 6. Debt Consolidation Refinance

Set refinance purpose to debt consolidation.

Show:

- Debt being paid off.
- Current debt monthly payments.
- Estimated monthly cash-flow impact.

Say:

"This is a simple monthly cash-flow estimate. It is not a full debt payoff timeline or interest-savings engine yet."

### 7. Sally Guided Refinance

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

"Sally collects missing inputs and explains only from controlled scenario data. If required values are missing, Sally asks for them instead of guessing."

## Key Talking Points

- This is a controlled internal demo.
- Pricing is Render-backed and DB-backed when `CONFIGURED PRICING ENGINE` is visible.
- Lender names are intentionally hidden from the borrower-facing pricing UI.
- Payments, rates, points, credits, cash-to-close, cash-out proceeds, and refinance savings are estimates.
- Rates are not locked.
- This is not a loan approval.
- Program eligibility is subject to final underwriting.
- Final lender disclosures happen later in the official loan process.
- Public launch still requires compliance approval, final disclosure placement, production hosting, monitoring, backups, rollback ownership, and pricing accuracy validation.

## Questions To Ask After The Demo

Ask:

- What part felt most valuable?
- Was the pricing panel clear enough?
- Did the rate and points/credit tradeoff make sense?
- Did FHA vs Conventional show the right comparison?
- Did the refinance summaries feel useful?
- Did Sally feel helpful or too rigid?
- Did anything sound too certain or compliance-sensitive?
- Was any disclosure missing, unclear, or in the wrong place?
- What would block a wider internal demo?
- What would block a public-launch checklist?
- What is the single highest-priority next improvement?

## Feedback Capture Format

Use `INTERNAL_DEMO_FEEDBACK.md` for detailed feedback.

For the first demo, capture at least:

```text
Reviewer:
Demo date:
Overall reaction:
Pricing confidence score, 1-5:
UI clarity score, 1-5:
Sally usefulness score, 1-5:
Compliance comfort score, 1-5:
Technical confidence score, 1-5:
Wow factor score, 1-5:
Blockers:
Must-fix before wider demo:
Demo polish:
Future roadmap:
Recommended next decision:
```

Use `POST_DEMO_DECISION_FRAMEWORK.md` to classify the decision after feedback is captured.

## What Not To Show Yet

Do not show:

- Mock pricing as if it is live pricing.
- Public borrower launch claims.
- Paid traffic or public funnel assumptions.
- Final application/handoff flow as complete.
- Admin-only controls as production-ready.
- Backend internals, database credentials, admin keys, or secrets.
- Nested `Choose-My-Rate` repo contents.
- Local backend fallback unless Render is unavailable and the fallback has been intentionally verified.

## What Not To Say

Do not say:

- "You are approved."
- "This loan is approved."
- "The rate is locked."
- "This pricing is guaranteed."
- "This is final pricing."
- "This is a final lender disclosure."
- "This is ready for public borrowers."
- "Compliance is done."
- "Production launch is ready."

## Decision After Demo

Choose one next decision.

### Continue Wider Internal Demo

Choose this if:

- Eduardo/trusted reviewer understands the value.
- No blocker was raised.
- Must-fix items are small or already accepted.
- The demo flow is clear enough for a broader internal group.

### Fix Issues

Choose this if:

- A confusing UI or script issue would distract the next audience.
- Sally needs safer or clearer behavior.
- Reviewers cannot explain the pricing panel.
- Demo setup is too fragile.

### Prepare Compliance Review

Choose this if:

- The demo is valuable enough to move toward borrower-facing review.
- Reviewer feedback raises disclosure, approval, locked-rate, guarantee, final-pricing, lender-name, or licensing concerns.
- The next step needs compliance language review before broader exposure.

### Prepare Production Launch Plan

Choose this only if:

- Internal feedback is strong.
- Compliance review is ready or underway.
- The team is ready to plan hosted frontend, production domain, Render/Postgres plan, monitoring, rollback, and support ownership together.

Keep public launch separate from the first internal demo decision.
