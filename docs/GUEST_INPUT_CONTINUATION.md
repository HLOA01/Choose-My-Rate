Guest input continuation preserves the approved SimplifiedBorrowerFunnel. It is
based on Claude's reviewed V2 proposal, with integration corrections by Codex.
The legacy App, scenarioStorage helper and their storage keys are unchanged.

Saving is optional and off in each new tab or reload. A shared browser record is
data, not permission to write and not authenticated ownership. The current tab
must deliberately opt in. Accepting an offered snapshot does not enable saving.
The disclosure appears before the opt-in control and explains the shared-profile
access and existing seven-day rolling input-retention window.

Only these borrower-entered property/loan inputs can be stored: borrowerPath,
homePrice, downPaymentAmount, downPaymentPercent, downPaymentInputMode,
propertyValue, currentMortgageBalance, refinanceGoal, requestedCashOut,
propertyType, occupancy and zipCode. The stored record never includes income,
exact/banded credit, current interest rate, first-time status, contact data,
address/GPS, identity/session/server IDs, attribution, quotes, selected rates,
approvals, disclosures or application handoffs. Those excluded form fields remain
as currently typed when a saved property-input set is accepted.

Every mutation uses one IndexedDB readwrite transaction over the shared record.
The comparison and write happen together; success is returned after commit.
There is no web-storage fallback. The BroadcastChannel message is only a hint;
missing messages cannot authorize a stale write. Existing seven-day retention
expires financial inputs into a data-free off marker. Reset markers do not
expire into an absent baseline: the epoch/revision history remains until browser
data is cleared. This does not provide isolation from another user of the same
browser profile or from unrelated scripts, browser eviction or manual data edits.

Start over immediately disables this tab's saving, invalidates asynchronous work,
clears the form/quote/comparison/selection/handoff and requests a durable off
marker. Renewed explicit opt-in is required before another save. Stop remembering
also disables local saves before waiting for the deletion transaction. Failures
are visible and retryable; they never claim that data was deleted.

If the browser refuses the deletion write, no durable deletion intent can be
guaranteed in that unavailable storage. The mounted tab suppresses restoration
while showing the failure. After reload an undeleted snapshot may be offered
again, with a visible warning about earlier failed deletion and shared use.
Nothing is automatically applied or saved. The user must explicitly choose to
use it or retry deletion. No alternate persistence is used to hide this limit.

Unknown/newer/oversized/future-dated data stays untouched until explicit clearing.
Clearing leaves a data-free off marker. The 2,048-character parse bound is an
engineering bound, with a worst-case-record test; it is not a lender threshold.
The 250ms debounce only coalesces edits. Invalid typed values pause saving visibly
rather than silently changing what is stored.

Accepting a snapshot revalidates it and installs all 12 input fields together.
It invalidates prior requests at the click and refuses to apply a delayed read
after newer form edits. It performs no pricing, Sally, identity, event or outbox
request. A fresh quote requires the existing explicit submission. Ordinary
controls stay below the main form/results actions; an offer or problem is shown
prominently. No old application entrypoint or parser behavior is restored.

Test entrypoints remain npm run qa:quote-contract and npm run qa:browser. The
new browser suite exercises the actual Funnel with mocked service calls and real
browser IndexedDB. Claude's separate stand-in/stress results are not repository
verification and are not substituted for these checks. Production/lender access,
merges and deployments are outside this change.
