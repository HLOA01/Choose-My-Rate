# Choose My Rate Controlled Demo Checkpoint

Checkpoint created: `2026-06-28 22:09:52 -04:00`

Purpose: freeze the approved internal-demo baseline so Cesar knows exactly which frontend commit, backend commit, Render backend URL, and demo environment were verified.

This is a controlled internal demo checkpoint only. It is not a public borrower launch approval.

## Approved Demo Baseline

- Frontend repo: `C:\Users\Owner\OneDrive\Desktop\choose-my-rate`
- Frontend branch: `main`
- Frontend commit: `10c1cf6fcc7de4f952cced63667a13cf57d25294`
- Backend repo: `C:\Users\Owner\OneDrive\Desktop\choose-my-rate-pricing-engine`
- Backend branch: `main`
- Backend commit: `4d9665592011e42a7c01655e99bfb4e4828f1879`
- Backend `origin/main`: `4d9665592011e42a7c01655e99bfb4e4828f1879`
- Render backend URL: `https://choose-my-rate-pricing-engine.onrender.com`
- Local demo env: root frontend `.env` points `VITE_PRICING_ENGINE_API_URL` to the Render backend URL.
- `.env` remains local-only and must not be committed.

## Render Pricing Verification

Verified against `https://choose-my-rate-pricing-engine.onrender.com`.

- `/health`: `status` is `ok`.
- `/health.currentLivePricingVersion.id`: `8884e282-8c51-40e4-a18d-d1d60ed642b6`
- `/health.currentLivePricingVersion.lenderCode`: `PRMG`
- `/health.currentLivePricingVersion.publishedAt`: `2026-06-26T15:15:31.000Z`
- `/health.scheduler.enabled`: `true`
- `/health.scheduler.started`: `true`
- `/health.lastRefresh.status`: `skipped`
- `/health.lastRefresh.message`: `No change detected in PRMG source file hash.`

The skipped refresh status is acceptable for this checkpoint because a non-null live pricing version exists and quote verification returns live pricing.

Verified `/pricing/quote` with a safe conventional purchase scenario:

- Quote `status`: `live`
- Quote `pricingVersionId`: `8884e282-8c51-40e4-a18d-d1d60ed642b6`
- Pricing version is a DB UUID, not `dev-prmg-xls`.
- Pricing options returned: `13`
- `displayLender`: `false` on returned options.
- Borrower-facing lender names remain hidden.
- `leadCaptureEnabled`: `false`
- `callbackEnabled`: `false`

## QA, Build, And Audit Results

- `npm.cmd run qa:scenarios`: passed, `60/60`.
- `npm.cmd run qa:sally`: passed, `10/10`.
- `npm.cmd run qa:browser`: passed, `14/14`.
- `npm.cmd run build`: passed.
- `npm.cmd audit --omit=dev`: passed, `0 vulnerabilities`.

Notes:

- The first sandboxed `qa:browser` attempt hit `EPERM` while Playwright tried to update `test-results/.last-run.json`; rerunning the same command with appropriate filesystem permission passed.
- The first sandboxed `npm.cmd run build` attempt hit a Vite/Rolldown `spawn EPERM`; rerunning the same command with appropriate process permission passed.
- Two initial `curl.exe` quote attempts failed because Windows shell quoting did not serialize the JSON body correctly. The verified quote used PowerShell JSON serialization against the same Render endpoint.

## Approved Demo Audience

Approved for a controlled internal demo with:

- Cesar.
- Eduardo.
- Trusted HLOA internal team members.

Not approved for:

- Public borrowers.
- Paid acquisition traffic.
- Unsupervised borrower self-service.
- Public launch demos without compliance review.

## Demo Restrictions

- Present this as a controlled internal demo only.
- Use the Render backend URL above for configured pricing-engine verification.
- Confirm the UI shows configured pricing engine mode before showing pricing.
- Do not present rates as locked.
- Do not present pricing as guaranteed or final.
- Do not present the app as a loan approval or underwriting decision.
- Do not expose lender names in borrower-facing pricing.
- Do not commit `.env` or secrets.
- Do not use mock pricing as live pricing.

## Known Blockers Before Public Launch

- Compliance approval for borrower-facing wording.
- Final lender/licensing disclosure placement.
- Hosted frontend production domain/subdomain decision.
- Hosted frontend production environment configuration.
- Render Postgres plan, expiration, backup, restore, and upgrade-path review.
- Final borrower application or handoff flow.
- Backend `xlsx` parser mitigation plan before public production scale.
- Production monitoring, alerting, and rollback ownership.

## Rollback Notes

- Frontend rollback anchor: `10c1cf6fcc7de4f952cced63667a13cf57d25294`.
- Backend rollback anchor: `4d9665592011e42a7c01655e99bfb4e4828f1879`.
- If Render pricing becomes slow or unavailable, do not present live pricing as working.
- If mock pricing appears, clearly state that it is demo fallback only and do not use those numbers as live pricing.
- If needed for a controlled fallback, use the previously verified local DB-backed backend only after starting and re-verifying it according to the internal demo checklist.
- Keep this checkpoint, `CONTROLLED_DEMO_LAUNCH_PACKAGE.md`, and `INTERNAL_DEMO_SCRIPT.md` together as the demo handoff set.
