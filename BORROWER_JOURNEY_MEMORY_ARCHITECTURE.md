# Choose My Rate Borrower Journey and Memory Architecture

Purpose: define the next product direction before more coding. This is a planning document only. It does not change app code, pricing math, backend behavior, data storage, or compliance language.

## Executive Summary

Choose My Rate should become a borrower-first guided experience, not a mortgage workbench with every tool visible at once. The core path should help a borrower enter a few basics, review rate options, understand monthly payment and cash-to-close tradeoffs, choose an option, and continue with HLOA.

Sally should remain important, but she should not be the main flow. The main flow should be structured with steps, fields, cards, buttons, and clear next actions. Sally should sit beside that flow as an assistant who answers questions, explains tradeoffs, helps fill fields from natural-language messages, and summarizes the borrower's selected option.

Long term, Choose My Rate should become a front door to the larger HLOA brain. It should remember borrower profiles, scenarios, conversations, rate quote records, selected options, document needs, follow-up status, and processing handoff data so borrowers can return later instead of starting over.

## Borrower-First Product Direction

The borrower-facing product promise should be:

"Choose the mortgage rate option that fits your budget."

The app should lead with a guided borrower path:

1. Choose a goal.
2. Enter basic information.
3. Review simple rate options.
4. Select an option.
5. Understand the payment, closing costs, and cash-to-close tradeoff.
6. Ask Sally for help if needed.
7. Save, continue later, or hand off to HLOA.

The current detailed panels should remain available for internal/demo/loan-officer use, but they should not define the borrower's first experience.

## Borrower-Friendly Language Rules

Borrower-facing UI and Sally copy should avoid the word "pricing" except in internal/advanced areas.

Use borrower language:

- rate
- rate option
- monthly payment
- closing costs
- cash to close
- loan option
- loan program
- upfront cost
- lender credit
- points
- estimated payment
- estimated costs

Avoid borrower-facing language:

- pricing
- pricing engine
- rate stack
- configured pricing engine
- pricing status
- quote payload
- read-only
- API
- mock pricing
- scenario object

Recommended replacements:

- "Pricing Engine" -> "Rate Options"
- "Live pricing" -> "Current rate options"
- "Rate Stack" -> "Available rates"
- "Pricing options" -> "Rate options"
- "Configured pricing engine" -> hide from borrower view, keep in loan-officer details
- "Demo pricing mode" -> if visible to borrower, use a warning such as "Sample rate options only"

Disclosures should stay clear and visible:

- Estimates only.
- Not a loan approval.
- Rate is not locked.
- Rate options and costs are subject to change.
- Final terms depend on application, property, underwriting, and lender disclosures.

## Structured Guided Step Flow

The main borrower experience should become a step flow, not a chat-first interface.

Recommended purchase flow:

1. Goal
   - Buy a home
   - Refinance my mortgage
   - Take cash out
   - Compare FHA vs Conventional

2. Basic Info
   - Purchase price
   - Down payment or down-payment percent
   - Estimated credit score
   - ZIP code
   - Home use

3. Rate Options
   - Lower payment
   - Balanced option
   - Lower upfront cost
   - Clear payment, rate, points/credit, and cash-to-close summary

4. Explain My Choice
   - Selected rate option
   - Estimated monthly payment
   - Estimated closing costs/cash to close
   - Tradeoff in plain English
   - Short disclosure

5. Optional Helpers
   - Compare FHA vs Conventional
   - Show all rate options
   - View payment breakdown
   - Ask Sally

6. Continue
   - Save progress
   - Request a call
   - Continue application
   - Send to HLOA processing/advisor workflow

Refinance should follow its own guided path:

1. Refinance goal
   - Lower payment
   - Take cash out
   - Consolidate debt
   - Shorten term
   - Not sure yet
2. Current loan basics
3. New loan estimate
4. Payment/cash-out comparison
5. Save or hand off

## Sally's New Role As Side Assistant

Sally should be repositioned as a helper layer, not the primary navigation.

Sally should:

- Answer borrower questions.
- Explain rate options.
- Explain payment, points, credits, closing costs, and cash to close.
- Explain FHA vs Conventional in plain English.
- Help fill missing fields from borrower messages.
- Summarize a selected loan option.
- Identify unclear inputs and ask for confirmation.
- Keep compliance guardrails visible in her answers.

Sally should not:

- Replace the guided flow.
- Hide or bypass required fields.
- Make approval claims.
- Say a rate is locked.
- Expose AI mode, rules mode, debug data, API details, or internal status in borrower view.
- Use "pricing" in borrower-facing responses.

## Sally-To-Scenario Sync Requirements

Natural-language borrower messages must reliably update the actual scenario fields that drive rate options.

Example:

Borrower says:

"$425,000 purchase, 720 credit score, 5% down."

Expected scenario updates:

- `loanPurpose`: `purchase`
- `purchasePrice`: `425000`
- `creditScore`: `720`
- `downPaymentPercent`: `5`
- `downPayment`: `21250`
- `loanAmount`: `403750`

Requirements:

- Extract structured field updates from Sally messages before or alongside reply generation.
- Normalize money, percent, rate, term, ZIP code, and occupancy values.
- Support multiple fields in one borrower sentence.
- Compute dependent fields deterministically, such as down payment dollars and loan amount.
- Show a visible confirmation summary when Sally updates fields.
- Let the borrower correct extracted values before rate options refresh if confidence is low.
- Never let Sally-only text become the source of truth; the scenario state must be updated.
- Add browser and unit-level QA for common borrower phrases.

Suggested sync model:

1. Parse borrower message into candidate field updates.
2. Validate values against loan-purpose rules.
3. Apply high-confidence updates to scenario state.
4. Queue low-confidence updates for confirmation.
5. Refresh rate options from the updated scenario.
6. Have Sally explain what changed.

## Data That Should Be Saved Now

Near-term save/restore can start locally without a full account system.

Save in local session/local storage:

- selected borrower goal
- current step
- scenario fields
- selected rate option id
- last returned rate option summary
- selected loan program
- FHA vs Conventional comparison preference
- Sally conversation history for the current browser session
- disclosure acknowledgment flags if added later
- timestamp of last update
- source of rate options, such as Render backend vs sample/demo mode

This allows "continue where I left off" in the same browser without building login, authentication, or backend storage yet.

## Data That Should Be Saved Later

Persistent HLOA-backed storage should eventually save:

- borrower profile
- contact information
- consent and communication preferences
- borrower authentication identity
- scenario records
- conversation history
- rate quote records
- selected rate option
- selected loan program
- comparison results
- documents needed
- uploaded document metadata
- advisor notes
- follow-up status
- processing handoff status
- task history
- compliance/disclosure acknowledgments
- audit trail for key rate-option views and selections

Rate quote records should preserve enough context to explain what the borrower saw:

- date/time generated
- source/backend version
- loan purpose
- loan program
- scenario inputs
- rate
- payment
- points/cost/credit
- estimated closing costs/cash to close if available
- selected flag
- whether the rate was locked, which should remain false unless an actual lock workflow exists

## Guest Session Vs Logged-In Borrower Strategy

Guest mode should be the default early experience:

- No login wall.
- Let borrower explore rate options quickly.
- Save progress locally in the browser.
- Ask for contact/login only when saving across devices, requesting a call, continuing application, or handing off to HLOA.

Logged-in mode should add:

- Continue later across devices.
- Save multiple scenarios.
- Resume conversation history.
- Track selected options.
- Support advisor/processing visibility.
- Support document checklist and follow-up workflow.

Recommended strategy:

1. Start with guest local save/restore.
2. Add "Save and continue later" as an account/contact capture moment.
3. Add server-side borrower/session storage.
4. Connect saved borrower/session data to HLOA advisor and processing workflows.

## Return-Visit / Continue-Later Experience

Returning borrowers should not start from zero.

Guest return experience:

- Detect local saved session.
- Show "Continue where you left off."
- Show last goal, last selected rate option, and last updated time.
- Allow "Start over" without deleting the saved session until confirmed.

Logged-in return experience:

- Show saved scenarios.
- Highlight the most recent scenario.
- Show selected rate option, if one exists.
- Show current document/request status.
- Show next best action:
  - finish basic info
  - review updated rate options
  - upload documents
  - schedule call
  - continue application

Important return-visit rule:

Rate options may change. The app should clearly say that returning to a saved scenario may require refreshing current rate options.

## Larger HLOA Processing Brain Connection

Choose My Rate should become the borrower-facing intake and decision layer for HLOA.

It should send clean, structured data into the larger HLOA brain:

- borrower identity/profile
- stated goal
- scenario inputs
- selected rate option
- selected loan program
- borrower questions and concerns
- Sally summary
- missing information
- document checklist
- follow-up priority
- advisor/processor handoff notes

The HLOA brain can then support:

- advisor follow-up
- processing task creation
- document collection
- compliance review
- borrower status updates
- next-best-action recommendations
- cross-product borrower memory

Architectural principle:

Choose My Rate should not become the entire loan origination system. It should produce high-quality borrower intent, scenario, option-selection, and handoff data for HLOA systems.

## What Not To Build Yet

Do not build these in the next immediate UI pass:

- full authentication system
- full borrower database
- document upload
- e-signature
- loan application workflow
- rate lock workflow
- CRM replacement
- LOS replacement
- automated underwriting claims
- public borrower launch flow
- complex multi-user admin controls
- backend schema migrations from the frontend repo

Also avoid:

- changing pricing math
- changing backend API contracts
- exposing lender names
- removing internal tools before an internal/advanced view is stable
- making Sally the only way to complete the borrower journey

## Safe Implementation Sequence For Future Passes

### Pass 34: Borrower-Facing Language Polish

- Replace borrower-visible "pricing" language with rate/payment/cost language.
- Keep internal/backend terms only inside loan-officer details or developer docs.
- Update Sally borrower-facing copy to avoid "pricing."
- Preserve QA and disclosures.

### Pass 35: Guided Step Flow Foundation

- Add a stepper for goal -> basic info -> rate options -> explain choice.
- Keep existing scenario state underneath.
- Keep internal panels available below or behind loan-officer details.
- Do not change pricing math or backend APIs.

### Pass 36: Sally Side Assistant Positioning

- Move Sally visually beside/under the guided journey as helper support.
- Hide internal Sally controls from borrower view.
- Keep Sally guardrails and existing QA.
- Add "Ask Sally to explain this option" actions from rate cards.

### Pass 37: Sally-To-Scenario Field Sync

- Build structured extraction for borrower messages.
- Ensure phrases like "$425,000 purchase, 720 credit score, 5% down" update scenario fields.
- Add confirmation behavior for ambiguous inputs.
- Add scenario sync QA.

### Pass 38: Scenario Save/Restore Local Foundation

- Save selected goal, step, scenario fields, selected option, and current session conversation locally.
- Add continue-later prompt for same-browser return.
- Add start-over confirmation.

### Pass 39: Borrower Lead/Session Architecture

- Plan backend data model and API contracts for borrower lead/session persistence.
- Define privacy, consent, retention, and compliance requirements.
- Keep implementation planning separate from frontend UI changes until approved.

### Pass 40: HLOA Processing Handoff Architecture

- Define the structured handoff package from Choose My Rate to HLOA.
- Include scenario, selected option, borrower concerns, Sally summary, missing data, document needs, and follow-up status.
- Define advisor/processor views and event triggers.
- Avoid replacing LOS/CRM systems; integrate cleanly with them.

## Final Recommendation

The next coding work should focus on borrower clarity before deeper persistence:

1. Fix borrower-facing language.
2. Create a guided step flow.
3. Reposition Sally as a side assistant.
4. Make Sally update real scenario fields.
5. Add local save/restore.
6. Then design persistent borrower/session memory and HLOA handoff.

That sequence protects the current working demo while moving the product toward the larger HLOA brain.
