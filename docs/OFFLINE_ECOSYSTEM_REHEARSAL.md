# Synthetic offline ecosystem rehearsal

`npm run qa:ecosystem-test -- --synthetic-only` is a separate TEST command. It
requires HLOA_REPO_PATH, HLOA_EXPECTED_SHA and CMR_EXPECTED_SHA explicitly. Both
package identities and exact commits are verified, and tracked edits cause a
preflight failure. Untracked original material is neither removed nor uploaded.
The command never clones private source or guesses a Desktop repository path.

The private HLOA repository supplies its TEST-only IPC bootstrap. It runs the
actual local Pricing/Fee/public-boundary handlers with in-memory databases,
loopback listeners, explicit test CORS and synthetic fixtures. CMR's actual Vite
UI calls that boundary over HTTP. The browser guard continues permitted local
requests and never fulfills pricing responses. Nonlocal destinations are refused.

Sally, voice, Lead Engine and application URLs are disabled. The prepared handoff
is local session data and does not claim application acceptance. Cases cover a
partial estimate, missing authority/role configuration, a test Fee Engine outage,
and pause/archive/authority removal after an earlier selection. After each case,
the runner awaits clean child exit and verifies all recorded listener ports refuse
connections. Failed or uncertain teardown fails the test.

Output is `test-results/offline-rehearsal/report.json` plus TEST-watermarked
screenshots. The report records exact repository SHAs, fixture hash/definition,
request/snapshot/fee IDs, actual audits, response hashes, fee completeness,
prepared handoff and teardown proof. A successful rehearsal leaves lender access
and production readiness UNVERIFIED. Fixtures are not approval or lender data;
source adapters, lender connectivity, managed identity and durable application
acceptance are not proved by this command.

The public CMR CI runs its normal regressions and generic preflight tests. It
cannot fetch private HLOA with its existing token and does not attempt to do so.
The full cross-repo job runs in private HLOA CI against a pinned public CMR commit;
its reports stay private. No private bootstrap source or generated report is
committed to this public repository. No new credential or permission grant is
required. Neither repository's production contract is changed for this rehearsal.

Local PowerShell example (supply the reviewed hashes yourself):

```powershell
$env:HLOA_REPO_PATH = '<reviewed local HLOA worktree>'
$env:HLOA_EXPECTED_SHA = '<exact 40-character HLOA commit>'
$env:CMR_EXPECTED_SHA = '<exact 40-character CMR commit>'
npm run qa:ecosystem-test -- --synthetic-only
```

The bootstrap child's environment is allow-listed: provider credentials, tokens,
NODE_OPTIONS and inherited DB destinations are not forwarded. No real lender,
borrower, CRM, external AI, production resource or existing database is touched.
