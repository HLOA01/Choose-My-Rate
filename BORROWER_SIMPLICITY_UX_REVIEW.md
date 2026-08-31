# Choose My Rate Borrower Simplicity UX Review

Purpose: review the current app from a borrower-first perspective and recommend a simpler path focused on the core promise: help a borrower choose a rate and understand rate, payment, and cost tradeoffs.

This is a planning review only. It does not change product code, pricing math, backend behavior, or compliance language.

## Executive Summary

The current app proves the pricing and comparison engine can work, but the first screen feels like an internal mortgage workbench. A borrower sees Sally, scenario fields, demo presets, loan-purpose controls, FHA vs Conventional comparison, refinance panels, pricing-engine labels, rate stack controls, technical status, and dense disclosures all at once.

The borrower-first experience should become:

1. Tell us the basics.
2. See your rate options.
3. Choose what matters most: lower payment, lower upfront cost, or balanced option.
4. Understand the tradeoff in plain English.
5. Ask Sally for help.
6. Continue to an advisor/handoff when ready.

The product should still keep the current deeper tools, but behind an internal/loan-officer view or an "Advanced details" layer.

## Current Friction Points

### Purchase Flow

What is confusing:

- The page starts with too many controls before the borrower understands the goal.
- "Your Scenario" feels like a loan officer form, not a guided borrower path.
- Loan amount appears as an editable field even though borrowers usually think in purchase price and down payment.
- Occupancy, ZIP, credit score, and loan type details appear before explaining why they matter.
- Demo presets are useful internally but signal that this is a demo/workbench, not a borrower experience.

What is useful:

- Purchase price, down payment, credit score, occupancy, and ZIP are the right core inputs.
- Auto-calculating loan amount is helpful.
- Letting borrowers change numbers quickly is useful once they understand what they are changing.

What should move to advanced:

- Loan amount manual editing.
- Demo presets.
- Any assumption that is not required to show first rate choices.
- Internal labels that read like implementation details.

### Pricing Engine Panel

What is confusing:

- "Pricing Engine" is an internal label. Borrowers do not choose a pricing engine; they choose a rate/payment option.
- "Live pricing based on a 30-day lock" may sound like the rate is locked even though disclosures say it is not.
- "Rate Stack" is industry/internal language.
- The wheel, table, selected rate cards, points/credit card, cost/credit card, and "Sally says" block compete for attention.
- The borrower sees the full option table before being taught the three common choices: lowest payment, lowest upfront cost, balanced.
- "Cost / Credit" and "Points / Credit" are useful but need plainer hierarchy and explanation.

What is useful:

- Showing multiple pricing options is the core product value.
- Estimated monthly payment, selected rate, points/cost/credit, and option count are valuable.
- The ability to compare rate options by selecting them is essential.
- Showing that lender names are hidden is useful internally, but not necessarily borrower-facing.

What should move to advanced:

- "Pricing Engine" label.
- Configured/demo mode badge.
- Rate stack term.
- Full table by default.
- Option index, pricing-status implementation details, and detailed P&I/taxes/insurance/MI breakdown before the borrower asks.

### FHA Vs Conventional Comparison

What is confusing:

- It appears as a separate button outside the main borrower path.
- "Compare FHA vs Conventional" assumes the borrower knows what FHA and Conventional mean.
- The panel is dense: monthly payment comparison, cash-to-close, assumptions, side cards, summary metrics, mortgage insurance, and status.
- It currently feels like an analysis mode, not a simple choice path.

What is useful:

- FHA vs Conventional is a real borrower question, especially for lower down-payment buyers.
- Monthly payment, upfront cash, and mortgage insurance are the right tradeoffs.
- Asking about a Conventional down-payment assumption is smart, but it should be more guided.

Recommendation:

- FHA vs Conventional should become a borrower question: "Want to compare FHA and Conventional?"
- It should appear as a side-by-side helper after the borrower enters basic purchase info, not as a separate top-level mode.
- The first view should summarize three differences: estimated payment, estimated upfront cash, and mortgage insurance.
- Detailed assumptions should be behind "View assumptions."

### Refinance Comparison Panel

What is confusing:

- Refinance appears in the same surface as purchase, which dilutes the "choose my rate" purchase path.
- The refinance form asks many loan-officer-style fields: current loan term, current remaining term, new loan amount, new term, closing costs, refinance goal.
- "Borrower Summary" is useful, but the surrounding comparison sections repeat data and feel analytical.
- Cash-out and debt consolidation are valuable but should not be visible during a purchase flow.

What is useful:

- Current payment vs new payment is borrower-friendly.
- Monthly payment change, cash out, net cash, break-even, and LTV are useful.
- Debt consolidation monthly cash-flow impact is useful when presented as a simple estimate.

Recommendation:

- Refinance should be a separate starting path: "Lower my payment / take cash out / consolidate debt."
- Do not mix refinance panels into the first purchase rate-choice experience.
- Keep the current refinance comparison as an advanced/internal tool until a borrower-specific refinance wizard is designed.

### Sally Panel

What is confusing:

- Sally is visually first, but the borrower may not know whether to type, use the form, or use pricing controls.
- AI/Rules mode, Stop, Vol, auto-play, voice configuration, and voice API messages are internal controls.
- "Current question" and "Latest answer" are useful for a guided chat, but the surrounding controls make it feel technical.
- Request a Call, Save Scenario, and Start Over are visible but not yet connected to a complete borrower handoff.

What is useful:

- Sally can guide missing inputs and explain rate tradeoffs.
- Sally is a strong helper for borrowers who do not understand mortgage terms.
- Sally can reduce form anxiety if she asks one question at a time.

Recommendation:

- Sally should be a helper beside the borrower path, not the main application shell.
- In the simplified experience, Sally should:
  - Ask for one missing basic input at a time.
  - Explain selected rate options in plain English.
  - Help compare lower payment vs lower upfront cost.
  - Offer FHA vs Conventional comparison when relevant.
  - Keep compliance guardrails.
- Sally should not expose AI/rules/voice/debug controls in borrower view.

### Scenario Controls

What is confusing:

- Current controls are too broad for a borrower-first first screen.
- The same panel tries to support purchase, rate-and-term refinance, cash-out refinance, debt consolidation, demo presets, and internal testing.
- Field labels are accurate but not sequenced as a guided decision.

What is useful:

- Dynamic fields by loan purpose are useful.
- The app already knows which fields are needed for pricing.
- Scenario editing is valuable for loan officers and internal reviewers.

What should move to advanced or internal view:

- Demo presets.
- Full refinance field set.
- Manual loan amount.
- Current loan term/current remaining term until refinance path is selected.
- Internal scenario editing after the borrower has entered basic info.

### Borrower-Facing Disclosures

What is confusing:

- Disclosure text is safe, but it appears early and dense.
- Borrowers may miss the important parts because the text competes with pricing details.
- "30-day lock" language should be carefully framed so it does not imply the displayed rate is locked.

What is useful:

- The disclosure content is directionally right: estimates, subject to change, not locked, not approval, final underwriting, lender disclosures later.

Recommendation:

- Keep short disclosures visible.
- Move longer disclosure language into expandable "Important pricing notes."
- Use simple first-line copy near selected rate: "These are estimates. Your rate is not locked yet."

## Proposed Simplified Borrower Flow

Top-level path:

1. Start with a choice:
   - "I am buying a home"
   - "I want to refinance"
   - "I want to take cash out"
2. If purchase, ask only:
   - Purchase price.
   - Down payment.
   - Estimated credit score.
   - ZIP code.
   - Occupancy, defaulting to primary home.
3. Show rate choices as cards:
   - Lowest monthly payment.
   - Lowest upfront cost.
   - Balanced option.
4. Let borrower select a rate card.
5. Show plain-English explanation:
   - Estimated monthly payment.
   - Rate.
   - Upfront cost or credit.
   - Cash-to-close estimate if available.
   - One-sentence tradeoff.
6. Offer secondary actions:
   - "Show all rate options."
   - "Compare FHA and Conventional."
   - "Ask Sally to explain."
   - "Request a call."

## Proposed Screen Order

### Screen 1: Choose Your Goal

Primary headline:

"Choose the rate option that fits you best."

Primary choices:

- Buy a home.
- Refinance.
- Take cash out.

For the first borrower simplification pass, focus on "Buy a home."

### Screen 2: Basic Info

Ask for:

- Purchase price.
- Down payment.
- Credit score range or estimated score.
- ZIP code.
- Home use: primary, second home, investment.

Hide:

- Loan amount unless it is calculated and read-only.
- Loan type unless borrower chooses FHA/Conventional compare.
- Demo presets.

### Screen 3: Choose My Rate

Main section:

- "Lower payment"
- "Lower upfront cost"
- "Balanced"

Each card should show:

- Rate.
- Estimated monthly payment.
- Estimated upfront cost or credit.
- Plain-language tradeoff.

Example:

- "Lower payment: pay more upfront, lower monthly payment."
- "Lower upfront cost: higher monthly payment, less cash due now."
- "Balanced: middle payment and middle upfront cost."

### Screen 4: Explain My Choice

After selecting a card, show:

- Selected rate.
- Estimated monthly payment.
- Estimated cost or credit.
- What this means.
- Short disclosure.
- Button: "Show all rate options."
- Button: "Ask Sally to explain."

### Screen 5: Optional Helpers

Offer:

- "Compare FHA and Conventional."
- "View payment breakdown."
- "View assumptions."
- "See all pricing options."

These should be optional, not the first screen.

## What To Hide In Borrower View

Hide by default:

- "Pricing Engine" wording.
- "Configured pricing engine" badge.
- "Demo pricing mode" unless fallback is active, in which case it should be a warning.
- "Rate Stack" label.
- Full pricing table.
- Demo presets.
- AI/Rules toggle.
- Stop/Vol/Auto-play technical controls.
- Voice API configuration messages.
- Internal status labels such as "read-only."
- Full assumption grids.
- Full refinance field set unless borrower chooses refinance.
- FHA vs Conventional detailed assumptions until requested.
- Loan-officer-level editable scenario controls.

Keep available under advanced/internal:

- Full rate table.
- P&I/taxes/insurance/MI breakdown.
- Points/credit details.
- Assumptions.
- Pricing status/debug details.
- Scenario field editor.
- Refinance details.
- Comparison deltas.

## What To Keep In Borrower View

Keep visible:

- Goal selection.
- Basic borrower inputs.
- Three recommended rate-option cards.
- Selected rate explanation.
- Monthly payment.
- Upfront cost or credit.
- Short disclosure.
- Ask Sally.
- Request a call or advisor handoff when ready.

Keep optional:

- FHA vs Conventional helper.
- Payment breakdown.
- All rate options.
- Assumptions.
- Refinance path.

## Main Top-Level Borrower Path

The main path should be:

"I am buying a home" -> basic info -> choose my rate -> explain my selected option -> ask Sally/request call.

The product should not start as:

"Here is every scenario field, every pricing option, Sally, comparison tools, refinance analysis, and internal controls."

## Choose My Rate Section Structure

Recommended structure:

1. Header:
   - "Choose your rate option"
   - "Compare monthly payment vs upfront cost."
2. Three primary cards:
   - Lower payment.
   - Lower upfront cost.
   - Balanced.
3. Selected option explanation:
   - "You selected..."
   - Payment.
   - Rate.
   - Cost/credit.
   - Tradeoff.
4. Secondary controls:
   - "See all options."
   - "Compare FHA and Conventional."
   - "Ask Sally."
5. Expandable details:
   - Payment breakdown.
   - Assumptions.
   - Disclosures.

## FHA Vs Conventional Recommendation

FHA vs Conventional should be a borrower question:

"Do you want to compare FHA and Conventional?"

It should appear when:

- The borrower has a purchase scenario.
- The down payment or credit profile makes the comparison relevant.
- Sally detects a borrower asking about FHA, low down payment, first-time buyer, or mortgage insurance.

It should not be the main primary flow.

Recommended display:

- Simple side-by-side helper.
- First row: estimated monthly payment.
- Second row: estimated upfront cash.
- Third row: mortgage insurance.
- Fourth row: plain-language note.
- Advanced: assumptions, loan amount, ZIP, occupancy, full pricing table.

## Refinance Recommendation

Refinance should be separated from the purchase "Choose My Rate" path.

Recommended approach:

- Keep refinance as a separate goal on the landing screen.
- Build a guided refinance wizard later.
- For now, keep current refinance comparison available in internal/advanced mode for demos.
- Do not mix refinance summary cards into the first purchase rate-selection experience.

Future borrower refinance flow:

1. What is your goal?
   - Lower payment.
   - Take cash out.
   - Consolidate debt.
   - Shorten term.
2. Ask current balance, estimated value, current rate, and remaining term.
3. Show current payment vs new estimated payment.
4. Show cash-out/debt-consolidation details only when selected.

## Sally Role In Simplified Experience

Sally should become the borrower guide, not an internal control panel.

Sally should:

- Welcome the borrower.
- Ask one question at a time.
- Explain why each input matters.
- Explain selected rate options.
- Translate points/credits into simple cost/payment tradeoffs.
- Offer FHA vs Conventional helper when relevant.
- Ask for missing inputs instead of guessing.
- Repeat guardrails: estimates, not locked, not approval.

Sally should not show:

- AI/rules mode.
- Voice API status.
- Debug indicators.
- Internal mode toggles.

## Default Landing Screen

Default landing screen should show:

- Brand: Choose My Rate.
- Simple headline: "Choose the mortgage rate option that fits your budget."
- Three goal buttons:
  - Buy a home.
  - Refinance.
  - Take cash out.
- Sally prompt in plain English:
  - "I can help you compare payment and upfront cost. What are you trying to do today?"
- Short disclosure:
  - "Estimates only. Rates are not locked and this is not a loan approval."

It should not immediately show:

- Full scenario editor.
- Pricing engine terminology.
- Full rate table.
- Refinance comparison panels.
- Internal controls.

## First Screen After Basic Info

After entering basic purchase info, the borrower should first see:

- Three rate option cards.
- A selected recommended/balanced option.
- Estimated monthly payment.
- Upfront cost or credit.
- One-sentence tradeoff.
- "See all options" as a secondary action.
- "Ask Sally to explain" as a helper.

They should not first see:

- Rate wheel plus full rate table plus payment breakdown plus pricing details plus disclosures all at once.

## Internal / Loan Officer View Should Keep

Loan officer/internal view should keep:

- Full scenario controls.
- Demo presets.
- Loan amount editing.
- Full rate stack.
- Full pricing table.
- Pricing status/mode labels.
- FHA vs Conventional detailed assumptions.
- Refinance comparison details.
- Debt consolidation details.
- Internal QA/rehearsal controls.
- Sally mode/debug/voice controls.
- Detailed disclosures.
- Full payment breakdown.

The borrower view should be a simpler presentation layer over the same pricing and scenario logic.

## Safe Implementation Passes

Recommended implementation sequence:

### Pass A: Borrower View Shell

- Add a borrower/internal view split.
- Default to borrower view.
- Keep current app available as internal/advanced view.
- No pricing math changes.

### Pass B: Basic Purchase Wizard

- Replace first-screen scenario grid with a guided basic-info flow for purchase.
- Keep the existing scenario object underneath.
- Make loan amount calculated/read-only for borrowers.

### Pass C: Rate Option Cards

- Convert live pricing options into three borrower cards:
  - Lower payment.
  - Lower upfront cost.
  - Balanced.
- Keep full rate table under "See all options."
- No pricing math changes.

### Pass D: Plain-English Rate Explanation

- Add selected-option explanation text.
- Explain points/credits as cash due now vs monthly payment tradeoff.
- Keep short disclosure visible and full disclosure expandable.

### Pass E: FHA Vs Conventional Helper

- Move FHA vs Conventional behind a borrower question/helper.
- Show simple side-by-side summary first.
- Move detailed assumptions behind "View assumptions."

### Pass F: Sally Simplification

- Hide internal Sally controls in borrower view.
- Make Sally focus on one-question-at-a-time guidance and rate explanation.
- Preserve current guardrail tests.

### Pass G: Refinance Separate Path

- Move refinance into its own borrower goal path.
- Keep current refinance comparison as internal/advanced until the guided refinance borrower flow is ready.

### Pass H: Internal View Preservation

- Confirm all current internal/demo capabilities remain available.
- Add QA coverage for borrower view and internal view.

## Final Recommendation

Do not start by redesigning everything. Start by creating a borrower-first layer that uses the existing pricing engine and scenario state but changes the order and language:

- Goal first.
- Basic info second.
- Three rate choices third.
- Explanation fourth.
- Details and comparisons optional.

That gives Cesar the core product promise: a borrower can choose a rate, understand the payment/cost tradeoff, and ask Sally for help without feeling like they are inside a loan officer tool.
