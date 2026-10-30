# Optional monthly principal and interest comparison

Based on Claude's authored proposal against CMR faf8a4847676a45b484e09fe3c9bc8dfcdbf1939, reviewed and integrated by Codex. The approved SimplifiedBorrowerFunnel remains the entrypoint. Legacy refinance/debt utilities are not activated.

An optional borrower-entered current monthly principal and interest amount is compared with the current selected refinance option's supplied paymentPI. Signed difference is quoted P&I minus current P&I. Copy labels higher, lower or the same; taxes, homeowners insurance and mortgage insurance are excluded on both sides. Loan amount, term and other costs may differ. This is not overall savings, a recommendation, eligibility or approval. Cash-out goals can compare P&I but this does not compare delivered cash or debt relief.

## Monetary contract

Actual HLOA 22e13a32655147f770ee1fa232bf8d140306f3d8 producer services/pricing-engine/src/domain/engine/rankBestExecution.ts:22-44 applies Math.round(value * 100) / 100 to paymentPI before responseShaping.ts passes the number through. No consumer-side re-rounding of amortization or raw financial amounts is added here.

The comparison independently requires a finite nonnegative numeric paymentPI whose canonical decimal spelling has at most two fractional digits and fits safe integer cents. Unexpected sub-cent values (including legacy values) make this optional comparison unavailable; they are not rounded into a new amount and do not alter the underlying quote/pricing contract. Selecting such an option unmounts the comparison and discards prior typed input. There is no PITI, monthlyPayment, nested detail, fee or cash-to-close fallback. Partial/unavailable fees do not invalidate otherwise valid supplied P&I.

Borrower input is raw text: ASCII ungrouped decimal dollars, at most two fractional digits. Examples 1850, 1850.25 and explicit 0 are accepted. Whitespace-only means empty; surrounding whitespace, trailing newline, currency/grouping/percent signs, exponents, hexadecimal, Unicode lookalike digits, negative or partial values are rejected without silent stripping. Both valid operands are converted directly from their decimal spelling to integer cents, then subtracted exactly. Only output is formatted. Zero direction never renders a negative zero. The safe-integer bound is a technical exactness limit, not a loan or qualification policy.

## Lifetime and privacy

The input lives exclusively in the comparison component's useState. It never enters scenario, pricing, Sally, identity, events, storage, analytics or application handoff. Editing and recomputation cause no network call. It is never restored or saved, even if guest property remembering is enabled.

The component is mounted only inside current scenario-bound results, behind the existing quote-validity predicate and its own monetary validation. resetPricingView replaces that subtree on scenario/Sally edits, saved-input acceptance, Start over, Edit details, new submission, expiry and navigation. Rate reselection among valid options preserves typed input and recomputes against the new selected paymentPI. Existing server deadlines apply; no new TTL or idle revocation promise is introduced.

## Review corrections and verification

Codex replaced the proposal's half-up quote rounding with strict supplied-cent validation, guarded the parent mount for unsupported precision so hidden state cannot reappear on reselection, and enforced full-string borrower parsing (JavaScript regex dollar anchor alone allows a terminal newline). Render-time quote validity remains intact and passes lint. Added actual-Funnel tests for Start over, explicit saved-input acceptance, genuine zero supplied P&I, and unsupported sub-cent option selection. The proposal's Unicode digit lookalike rejection cases were correct and retained.

Pure contract cases cover signed differences, cent precision, zeros versus missing, malformed/nonfinite/overflow values and deterministic arithmetic. Active Playwright cases exercise the real Funnel with synthetic mocked backends: fee statuses, supplied P&I versus deliberately different PITI, reselection, no service activity from typing, payload/storage exclusion, reset/restore/expiry/navigation/reload, and accessibility/mobile layout. Existing suites remain active. These tests do not establish live lender accuracy, approval authority or production readiness.
