# Choose My Rate - Project Status

## 1. Permanent Product Direction

Choose My Rate is the borrower-facing mortgage decision and rate-selection experience.

Core product direction:

- Branding: CHOOSE MY RATE - Powered by Home Lenders of America.
- Sally is the borrower-facing conversational mortgage guide.
- Sally should guide and explain; deterministic mortgage and pricing logic should control calculations and eligibility where appropriate.
- Borrower-facing language should use plain terms such as rates, rate options, monthly payment, closing costs, cash to close, and loan product.
- Do not expose wholesale lender names in the borrower shopping experience unless a later disclosure or workflow requires it.
- Never fabricate or interpolate lender rates that were not actually returned by the pricing source.
- Closest-to-par means the real returned option closest to no discount points and no lender credit.
- Discount points are an upfront borrower cost.
- Lender credit reduces borrower closing costs.
- Do not invent closing-cost estimates when an approved fee schedule is unavailable.
- Sally/chat should remain conversational rather than reverting to a form-heavy legacy experience.
- Text remains visible even when voice, dictation, or playback features are used.
- Mobile behavior is a first-class requirement.

## 2. Current Runtime

The active borrower-facing runtime as of this baseline is:

```text
src/main.jsx
-> src/SimplifiedBorrowerFunnel.jsx
-> SimplifiedBorrowerFunnel
```

`src/App.jsx` and `src/SimplifiedBorrowerApp.jsx` currently exist, but they are not the active borrower runtime. They should not be substituted for `SimplifiedBorrowerFunnel` without an intentional architecture decision.

## 3. Current Implemented Capabilities

The current implementation includes:

- Purchase and refinance conversation paths.
- Borrower and scenario collection.
- ZIP and pricing validation.
- Sally conversational composer.
- Microphone and dictation interaction.
- Listening and waveform feedback.
- Written Sally responses.
- Playback and speaker control.
- Internal conversation scrolling.
- Navigation across real returned rate options.
- Lowest-rate control.
- Closest-to-par control.
- Lender-credit control.
- Keyboard, touch, and mobile interaction.
- Principal and interest display.
- Points or lender credit display.
- Estimated closing-cost display.
- Optional closing-cost breakdown.
- Controlled closing-cost unavailable state.
- Pricing-engine integration boundary.
- Responsive borrower experience.

## 4. Current Git Baseline

Main:

```text
f70dd66c7e3503c0dcee42f6f11d20112612c5c6
```

Backup pre-integration main:

```text
215f1c26d11bcc25d2e0fff402145721a030b1e1
```

Preserved integration branch:

```text
integration/unify-borrower-pricing-sally-2026-08-31
```

Date: September 1, 2026

## 5. Validation Baseline

Post-integration validation baseline:

- Root lint passed.
- Root production build passed.
- Scenario QA 6/6 passed.
- Sally QA 5/5 passed.
- Browser QA 23 passed / 11 skipped.
- Pricing-engine tests 17/17 passed.
- Pricing-engine build passed.
- Git diff check passed.

## 6. Important Existing Technical Debt / Follow-Up

- `src/App.jsx` and `src/SimplifiedBorrowerApp.jsx` appear to be legacy or alternate borrower entrypoints.
- They are not currently production blockers.
- They should be reviewed in a dedicated cleanup or architecture pass, not casually deleted.
- Visual-review ZIPs and folders remain untracked and should not be committed unintentionally.

## 7. Next Development Phase

The repository is now at a clean post-integration baseline.

Do not invent the next product feature. The next feature or architecture phase will be defined after product review.
