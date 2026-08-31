# Choose My Rate Internal Demo Feedback Guide

Purpose: give Cesar a simple way to capture structured feedback after showing the controlled internal demo to Eduardo and trusted internal reviewers.

This is for internal review only. It is not a public borrower launch approval.

## Demo Audience

Approved reviewers:

- Cesar.
- Eduardo.
- Trusted HLOA internal team members.
- Compliance or operations reviewers invited by Cesar.

Not intended for:

- Public borrowers.
- Paid acquisition traffic.
- Unsupervised borrower self-service.
- Public launch demos without compliance review.

## Demo Objective

The demo should answer four questions:

- Does the purchase pricing experience feel clear enough for internal review?
- Does Render-backed pricing appear credible and explainable without exposing lender names?
- Does Sally help collect refinance inputs without making approval, locked-rate, guarantee, or lender-name claims?
- What must be fixed before a broader internal demo or any public-launch checklist?

## What To Show

Use the controlled demo materials:

- `CONTROLLED_DEMO_CHECKPOINT.md`
- `CONTROLLED_DEMO_LAUNCH_PACKAGE.md`
- `INTERNAL_DEMO_SCRIPT.md`

Recommended order:

1. Open with the controlled-demo purpose and restrictions.
2. Show a complete purchase scenario.
3. Pause on the pricing panel and confirm `CONFIGURED PRICING ENGINE`.
4. Show the rate stack, estimated payment, points/credit tradeoff, and pricing disclosure.
5. Run FHA vs Conventional comparison.
6. Show rate-and-term refinance.
7. Show cash-out refinance.
8. Show debt consolidation refinance.
9. Show Sally guided refinance with missing-input guardrails.
10. Close by reviewing public-launch blockers and asking for prioritized feedback.

## Questions To Ask Reviewers

Ask Eduardo and internal reviewers:

- What part of the demo was most immediately valuable?
- Did the pricing display feel clear, credible, and safe?
- Was the points/credit tradeoff easy to understand?
- Did the FHA vs Conventional comparison explain the right tradeoffs?
- Did the refinance summaries feel useful enough for a borrower-facing explanation?
- Did Sally's guided refinance flow feel helpful or too rigid?
- Did Sally say anything that sounded risky, too certain, or compliance-sensitive?
- Were any disclosures missing, unclear, or in the wrong place?
- What would block this from being shown to a broader internal audience?
- What would block this from being included in a public-launch checklist?
- What is the single highest-priority next improvement?

## Feedback Categories

Use these categories when logging feedback.

### Pricing Accuracy

Capture:

- Scenario shown.
- Pricing options observed.
- Whether pricing looked credible.
- Whether rate, payment, points, credits, taxes, insurance, mortgage insurance, or cash-to-close need review.
- Whether the reviewer needs lender-side validation before broader demo use.

### UI Clarity

Capture:

- Which screen caused confusion.
- Whether labels were clear.
- Whether the order of fields made sense.
- Whether the pricing panel, comparison panel, or refinance summary was too dense.
- Whether any mobile or laptop display concern came up.

### Sally Behavior

Capture:

- Prompt used.
- Sally response.
- Whether Sally captured fields correctly.
- Whether Sally asked for the right missing input.
- Whether Sally sounded too certain, too generic, or too repetitive.
- Whether Sally avoided approval, locked-rate, guarantee, final-pricing, and lender-name claims.

### Compliance / Disclosure Concerns

Capture:

- Exact wording that raised concern.
- Screen where it appeared.
- Whether the issue is disclosure placement, disclosure wording, missing disclosure, or risky sales language.
- Whether compliance review is required before another demo.

### Missing Features

Capture:

- Feature requested.
- Why it matters.
- Whether it is required for broader internal demo, public launch, or future roadmap.
- Whether it affects purchase, refinance, pricing, Sally, disclosures, or deployment.

### Technical / Deployment Concerns

Capture:

- Render availability or latency concern.
- Frontend hosting concern.
- Environment variable concern.
- Database, backup, monitoring, or rollback concern.
- Browser/device issue.
- Any dependency, audit, parser, or operational risk.

## Severity Levels

Assign one severity to each item.

### Blocker Before Public Launch

Use when the issue prevents public borrower exposure.

Examples:

- Compliance language concern.
- Missing lender/licensing disclosure.
- Pricing accuracy concern that needs lender validation.
- Public hosting, monitoring, backup, or rollback gap.
- Any approval, locked-rate, guaranteed-pricing, or final-pricing claim.

### Fix Before Broader Demo

Use when the issue should be corrected before showing a wider internal group.

Examples:

- Confusing demo flow.
- Sally response that is safe but awkward or repetitive.
- UI wording that creates avoidable misunderstanding.
- Missing internal talking point.
- Render or frontend setup step that is fragile.

### Nice-To-Have

Use when the issue would improve polish but does not block the controlled demo.

Examples:

- Label refinement.
- Better summary wording.
- More helpful example scenario.
- Minor layout polish.
- Additional internal FAQ note.

### Future Roadmap

Use when the item is valuable but outside the controlled-demo/public-launch decision.

Examples:

- Full borrower application handoff.
- Deeper refinance savings engine.
- Debt payoff timeline.
- OpenAI transcription.
- CRM or LOS integrations.
- Multi-lender expansion.

## Feedback Log Template

Use one row per feedback item.

```text
Reviewer:
Demo date:
Screen or flow:
Category:
Severity:
Feedback:
Why it matters:
Recommended action:
Owner:
Decision:
```

Decision options:

- Accept as blocker.
- Fix before broader demo.
- Add to public-launch checklist.
- Add to roadmap.
- No action needed.

## Decision Checklist After Demo

After the demo, Cesar should choose one primary next step:

- Proceed to wider internal demo.
- Fix issues first.
- Prepare public-launch checklist.
- Prioritize next feature.

Before choosing, confirm:

- No pricing accuracy blocker was raised.
- No compliance/disclosure blocker was raised.
- Sally made no approval, locked-rate, guarantee, final-pricing, or lender-name claims.
- Reviewers understood the demo is controlled internal use only.
- Render-backed pricing remained available during the demo.
- Any public-launch blocker is documented separately from nice-to-have feedback.

## Suggested Close

Close the feedback session with:

"For today, I am looking for blockers, confusing moments, and the highest-priority next improvement. This is still controlled internal review, not a public borrower launch."
