# Choose My Rate Post-Demo Decision Framework

Purpose: help Cesar turn Eduardo/internal demo feedback into a clear next decision without mixing blockers, polish, and roadmap ideas.

This framework is for internal planning only. It is not a public borrower launch approval.

## Classify Feedback After The Demo

Use one classification per feedback item.

### Blocker

Use when the issue must be solved before public borrower exposure.

Examples:

- Pricing accuracy concern that needs validation.
- Compliance or disclosure concern.
- Any wording that implies approval, locked rate, guaranteed pricing, final pricing, or final lender disclosure.
- Lender/licensing disclosure gap.
- Render, database, backup, monitoring, or rollback risk that would make public use unsafe.

### Must-Fix Before Wider Demo

Use when the issue should be fixed before showing a larger internal group or a partner audience.

Examples:

- Demo flow is confusing.
- Key screen needs clearer labels or talking points.
- Sally response is safe but confusing, repetitive, or not helpful.
- Internal reviewers cannot explain what the pricing panel means.
- Setup path is fragile enough to distract from the demo.

### Demo Polish

Use when the controlled demo works but could feel cleaner.

Examples:

- Better sample scenario.
- Small wording improvement.
- More polished handoff note.
- Minor UI clarity issue that does not change product behavior.
- Cleaner explanation of rate, points, credit, payment, or cash-to-close tradeoffs.

### Future Roadmap

Use when the idea is valuable but not needed for the current demo decision.

Examples:

- Borrower application handoff.
- Deeper refinance analysis.
- Multi-lender pricing.
- Admin dashboard.
- CRM or LOS integration.
- OpenAI-powered voice transcription.

## Decision Paths

Choose one primary path after reviewing all feedback.

### Proceed To Wider Internal Demo

Use this path when:

- No blocker was raised.
- No must-fix issue would undermine internal confidence.
- Pricing, UI, Sally, and disclosures are clear enough for a controlled internal audience.
- Render-backed pricing stayed available during the demo.

Next actions:

- Schedule the wider internal demo.
- Use `CONTROLLED_DEMO_LAUNCH_PACKAGE.md`.
- Use `INTERNAL_DEMO_FEEDBACK.md` to capture structured feedback.
- Keep public-launch blockers separate from demo polish.

### Pause And Fix Issues

Use this path when:

- A must-fix issue would confuse the next demo audience.
- Sally is safe but not clear enough.
- The demo script needs adjustment.
- A UI or wording issue creates avoidable misunderstanding.

Next actions:

- Convert each must-fix item into a scoped pass.
- Keep fixes narrow.
- Re-run QA/build/audit before the next demo.
- Update the demo documents only when the talking track changes.

### Prepare Compliance Review

Use this path when:

- Reviewers raise wording, disclosure, approval, locked-rate, final-pricing, lender-name, licensing, or borrower-facing risk.
- The team wants to move from internal demo toward borrower-facing review.

Next actions:

- Collect exact screenshots or wording.
- List every borrower-facing disclosure location.
- Separate required compliance fixes from product wishlist items.
- Do not proceed to public borrower exposure until compliance signs off.

### Prepare Production Launch Plan

Use this path when:

- Internal feedback is positive.
- Compliance review is ready or already underway.
- Hosted frontend, production domain, Render/Postgres plan, monitoring, rollback, and support ownership are ready to be planned as one launch package.

Next actions:

- Create or update the public-launch checklist.
- Confirm frontend hosting and environment variables.
- Confirm Render Postgres backups, plan, expiration, and upgrade path.
- Confirm monitoring, alerting, and rollback ownership.
- Confirm final lender/licensing disclosure placement.

### Return To Feature Development

Use this path when:

- Demo feedback identifies a feature gap more important than launch preparation.
- The team chooses product depth over broader demo rollout.

Next actions:

- Pick one feature category.
- Define a narrow pass.
- Preserve current controlled-demo stability.
- Re-run full QA/build/audit after implementation.

## Recommended Next Feature Categories

### Compliance Polish

- Final borrower-facing disclosure wording.
- Lender/licensing disclosure placement.
- Safer explanation wording for pricing, comparison, refinance, and Sally responses.
- Public-launch legal/compliance review package.

### Pricing Accuracy Validation

- Review pricing outputs with lender-side expectations.
- Validate selected sample scenarios.
- Confirm tax, insurance, mortgage insurance, points/credits, and cash-to-close assumptions.
- Document what the pricing engine does and does not calculate.

### More Lender Support

- Add additional lender connectors only after PRMG flow remains stable.
- Define lender-name hiding rules.
- Confirm ranking behavior across multiple lenders.
- Keep borrower-facing disclosures safe.

### Borrower Handoff / Application Flow

- Lead capture.
- Callback request.
- Advisor handoff.
- Application start or secure next-step flow.
- Consent and disclosure placement.

### Sally Intelligence Expansion

- Stronger refinance guided collection.
- Better explanation of points/credits and payment tradeoffs.
- Safer contextual answers.
- OpenAI transcription for voice input.
- Guardrail tests for new capabilities.

### Admin Controls

- Pricing availability status.
- Banner controls.
- Lead/callback toggles.
- Manual refresh controls.
- Internal audit trail.

### Monitoring / Alerts

- Render uptime monitoring.
- Pricing refresh monitoring.
- Quote API error alerts.
- Database backup checks.
- Frontend availability checks.
- Incident and rollback playbook.

## Demo Scoring Template

Score each area from 1 to 5.

```text
Reviewer:
Demo date:

Pricing confidence:
Score:
Notes:

UI clarity:
Score:
Notes:

Sally usefulness:
Score:
Notes:

Compliance comfort:
Score:
Notes:

Technical confidence:
Score:
Notes:

Wow factor:
Score:
Notes:

Highest-priority fix:
Highest-priority opportunity:
Recommended decision path:
```

Suggested interpretation:

- `5`: strong enough for the next audience.
- `4`: good, with minor polish.
- `3`: usable, but needs follow-up.
- `2`: not ready for the next audience.
- `1`: blocker-level concern.

## Go / No-Go Checklists

### Eduardo Demo

Go when:

- Render-backed pricing is working.
- `CONFIGURED PRICING ENGINE` is visible.
- Demo script is rehearsed.
- `.env` points to the Render backend and remains uncommitted.
- No known demo-breaking issue is present.

No-go when:

- Render pricing is unavailable.
- Demo pricing mode appears unexpectedly.
- Sally or UI wording makes approval, locked-rate, guarantee, final-pricing, or lender-name claims.

### Wider HLOA Internal Demo

Go when:

- Eduardo/internal feedback has no blocker.
- Must-fix items are resolved or intentionally accepted.
- Demo talking points are clear.
- Public-launch blockers are documented separately.
- QA/build/audit are passing.

No-go when:

- Reviewers cannot explain the pricing display.
- Compliance wording concerns are unresolved.
- Setup is too fragile for a group demo.

### Realtor / Lender Partner Demo

Go when:

- Internal demo feedback is positive.
- Partner-safe talking points are prepared.
- Compliance-sensitive language is reviewed.
- Lender-name hiding and disclosure posture are understood.
- Demo restrictions are explicit.

No-go when:

- Pricing accuracy validation is unresolved.
- Compliance/disclosure concerns remain open.
- The demo could be mistaken for public borrower availability.

### Public Borrower Launch

Go only when:

- Compliance approval is complete.
- Final lender/licensing disclosures are approved and placed.
- Production frontend domain and environment are configured.
- Render/Postgres plan, backups, monitoring, alerts, and rollback are ready.
- Pricing accuracy validation is complete.
- Borrower handoff or application flow is approved.
- Public support/ownership is assigned.

No-go when:

- Any blocker remains open.
- Pricing confidence is below launch threshold.
- Compliance comfort is below launch threshold.
- Monitoring, rollback, or disclosure ownership is unclear.

## Recommended Post-Demo Meeting Close

Close the discussion with:

"We are choosing one next path: wider internal demo, fix issues first, compliance review, production launch planning, or feature development. Everything else goes into the backlog with a severity."
