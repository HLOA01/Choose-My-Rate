# Choose My Rate Cloud Deployment Plan

Purpose: plan the cloud deployment path for the Choose My Rate frontend, pricing engine backend, and Postgres database. This document is planning-only; no deployment has been performed in this pass.

## Current Local Architecture

Root frontend app:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

Pricing engine backend:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
```

Local database:

```text
PostgreSQL 16.14
Database: choose_my_rate_pricing
```

Local frontend env:

```env
VITE_PRICING_ENGINE_API_URL=http://localhost:4100
```

Local DB-backed pricing success signals:

- `/health.currentLivePricingVersion` is not null.
- `/health.lastRefresh.status` is `published`.
- `/pricing/quote.pricingVersionId` is a DB UUID, not `dev-prmg-xls`.
- `/health` does not show `devPrmgFallback`.
- Frontend pricing panel shows configured pricing engine, not `Demo pricing mode`.

## Target Cloud Architecture

- Hosted frontend serving the built React/Vite app.
- Hosted pricing engine backend exposing HTTPS API routes.
- Managed Postgres database for published PRMG pricing versions, pricing rows, refresh logs, and platform controls.
- Frontend production env points to the backend HTTPS URL:

```env
VITE_PRICING_ENGINE_API_URL=https://<pricing-backend-domain>
```

The borrower-facing frontend should never silently use mock/demo pricing in production borrower use.

## Deployment Options

### Render

Pros:

- Simple web service setup for Node apps.
- Managed Postgres available in the same platform.
- Environment variable management is straightforward.
- Good first choice for controlled demos.

Cons:

- Must confirm scheduler reliability and sleeping/instance behavior for the chosen plan.
- Production hardening and observability may need additional setup.

### Railway

Pros:

- Fast setup for Node services and Postgres.
- Simple environment variable workflow.
- Good for rapid internal demos.

Cons:

- Cost/usage behavior should be reviewed before production.
- Need to confirm long-running scheduler and restart behavior.

### AWS

Pros:

- Strong long-term production path.
- RDS Postgres, Elastic Beanstalk/ECS/App Runner, CloudWatch, IAM, and Route 53 are mature.
- Best fit if the team already operates AWS infrastructure.

Cons:

- More setup overhead.
- More moving pieces for a first controlled demo.
- Requires clearer ownership of networking, DNS, IAM, monitoring, and secrets.

## Recommended First Controlled-Demo Path

Use Render first for the controlled hosted demo.

Why:

- It is the simplest path to a public HTTPS backend and managed Postgres without building out full AWS operations.
- It keeps the pricing backend separate from the borrower-facing frontend.
- It lets the team validate cloud migrations, PRMG refresh, `/health`, `/pricing/quote`, and frontend env wiring before choosing a long-term production platform.

AWS remains the stronger candidate for a later production-grade deployment if the business wants deeper control over infrastructure, monitoring, security, and database operations.

Use `RENDER_DEPLOYMENT_CHECKLIST.md` as the step-by-step Render runbook before creating the Render web service, managed Postgres database, scheduler/worker choice, or frontend production environment connection.

Use `PRICING_ENGINE_REPO_PREP_PLAN.md` before creating the backend GitHub repo. A dedicated `choose-my-rate-pricing-engine` repo is recommended before Render deployment because the current root repo records `Choose-My-Rate/` as a gitlink/submodule-style folder without `.gitmodules`.

## Backend Deployment Requirements

Backend source:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
```

Recommended deployment repo:

```text
choose-my-rate-pricing-engine
```

Runtime:

- Node.js runtime compatible with the backend package.
- Install command:

```bash
npm install
```

- Build command:

```bash
npm run build
```

- Start command:

```bash
npm run start
```

Required environment variables:

```env
DATABASE_URL=<managed-postgres-url>
ADMIN_API_KEY=<strong-secret>
PRMG_RATE_SHEET_URL=http://www.eprmg.net/campaigner/WHLS-1000.xls
ENABLE_DEV_PRMG_FALLBACK=false
ENABLE_SCHEDULER=true
REFRESH_CRON=*/15 * * * *
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=<provider-specific>
```

Optional deployment controls:

```env
RUN_MIGRATIONS_ON_START=false
RUN_REFRESH_ON_START=false
```

Do not commit `.env` files. Configure secrets in the hosting provider dashboard.

## Database Setup

Use managed Postgres.

Required steps:

1. Create managed Postgres instance.
2. Set backend `DATABASE_URL` to the managed database URL.
3. Run backend migrations against the cloud database:

```bash
npm run migrate
```

4. Publish PRMG pricing into the cloud DB using one approved refresh path:

```bash
npm run refresh:prmg
```

or:

```text
POST /admin/refresh/prmg
x-admin-api-key: <ADMIN_API_KEY>
```

5. Verify live pricing version exists:

```text
GET /health
```

Success signal:

- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`.

## Frontend Deployment Requirements

Root frontend app:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

Build command:

```bash
npm run build
```

Production frontend env:

```env
VITE_PRICING_ENGINE_API_URL=https://<pricing-backend-domain>
```

Verified Render backend env for controlled demo:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

Production borrower use must not rely on blank `VITE_PRICING_ENGINE_API_URL`, mock pricing, or Demo pricing mode.

## Verification Checklist

Backend checks:

```text
GET https://<pricing-backend-domain>/health
POST https://<pricing-backend-domain>/pricing/quote
```

Expected backend signals:

- `/health.status` is `ok`.
- `/health.currentLivePricingVersion` is not null.
- `/health.lastRefresh.status` is `published`.
- `/health` does not show `devPrmgFallback`.
- `/pricing/quote.status` is `live`.
- `/pricing/quote.pricingVersionId` is a DB UUID, not `dev-prmg-xls`.
- Pricing options do not expose lender names.

Verified Render backend signals:

- Backend API: `https://choose-my-rate-pricing-engine.onrender.com`.
- `/health.status` is `ok`.
- `/health.currentLivePricingVersion` is not null.
- `/health.lastRefresh.status` is `published`.
- `/pricing/quote.status` is `live`.
- `/pricing/quote.pricingVersionId` is a DB UUID, not `dev-prmg-xls`.
- Safe purchase quote test returned 13 pricing options.
- Borrower-facing options have `displayLender: false` and do not expose lender names.

Frontend checks:

- Frontend pricing panel shows configured pricing engine.
- Frontend does not show `Demo pricing mode`.
- Estimated payment and rate stack populate from the hosted backend.
- Pricing disclosures remain visible.

Root QA commands:

```powershell
npm.cmd run qa:scenarios
npm.cmd run qa:sally
npm.cmd run qa:browser
npm.cmd run build
npm.cmd audit --omit=dev
```

Note: current `qa:browser` intentionally verifies the blank-API Demo pricing guardrail on its dedicated Playwright server. Add or run a separate hosted-backend browser smoke test before any public launch.

## Security And Compliance Considerations

- Never commit `.env` files.
- Protect `ADMIN_API_KEY`.
- Restrict admin endpoints to trusted operators.
- Configure CORS to allow only approved frontend origins.
- Keep lender names hidden from borrower-facing pricing UI.
- Keep disclosures clear: pricing is subject to change, rates are not locked, and pricing is not a loan approval.
- Lender disclosures should appear later in the official loan process according to compliance guidance.
- Cloud database credentials should be managed through the hosting provider secret store.
- Review logs to ensure secrets, admin keys, and lender-internal details are not printed.

## Rollback Plan

Frontend rollback:

- Revert to the prior known-good frontend build.
- Restore the prior frontend environment configuration if needed.

Backend rollback:

- Revert to the prior known-good backend deployment.
- Disable scheduler if refresh behavior is suspect.
- Use platform controls to pause pricing if needed.

Pricing pause option:

```text
POST /admin/platform-status
x-admin-api-key: <ADMIN_API_KEY>
```

Set `pricingStatus` to `paused` with a borrower-safe pause message if online pricing should be hidden temporarily.

Database rollback:

- Keep prior live pricing versions archived.
- The backend publish flow archives old live versions instead of updating them in place.
- Do not manually delete pricing rows during a live incident unless an explicit rollback plan is approved.

## Open Questions For Cesar/Eduardo

- Preferred cloud provider for the controlled demo: Render, Railway, AWS, or another provider?
- Preferred domain or subdomain for the pricing backend?
- Who controls DNS?
- Who controls database credentials and provider access?
- Who owns `ADMIN_API_KEY` rotation?
- When will compliance approve borrower-facing wording?
- What is the expected timing for lender/licensing disclosure placement approval?
- Who owns production monitoring and incident rollback?
- Should the scheduler run inside the web service or as a separate worker/cron service?
