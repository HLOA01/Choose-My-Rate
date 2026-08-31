# Choose My Rate Render Deployment Checklist

Purpose: step-by-step planning checklist for deploying the pricing-engine backend and managed Postgres on Render later. This is preparation only; no Render deployment has been performed.

## Render Account Prerequisites

- Confirm who owns the Render account used for the controlled demo.
- Confirm account access for the operator who will create services, manage environment variables, view logs, and roll back deployments.
- Confirm GitHub repo access for the source that contains the pricing-engine backend.
- Review Render billing, free tier limits, service sleep behavior, Postgres limits, backup availability, and whether the selected plan is appropriate for a controlled demo.
- Confirm who controls DNS for the later frontend and pricing-engine domains or subdomains.

## Required Services

- Render Web Service for the pricing-engine backend.
- Render Postgres database for live PRMG pricing tables and refresh metadata.
- Decide whether PRMG refresh should run inside the backend web service scheduler or as a separate Render worker/cron service.

## Backend Service Settings

Recommended source repo after preparation:

```text
choose-my-rate-pricing-engine
```

Use `PRICING_ENGINE_REPO_PREP_PLAN.md` before creating this repo. The dedicated repo is recommended because the current root frontend repo records `Choose-My-Rate/` as a gitlink/submodule-style folder without `.gitmodules`.

Backend root directory/path:

```text
Choose-My-Rate/pricing-engine
```

Use this nested path only if the team explicitly chooses the temporary nested-repo deployment path. If the backend is moved to the recommended dedicated repo, set Render's root directory to the repo root:

```text
.
```

Recommended service settings:

- Runtime: Node.
- Build command:

```bash
npm install && npm run build
```

- Start command:

```bash
npm run start
```

- Health check endpoint:

```text
/health
```

- Port behavior: the backend should bind to the port provided by Render through `PORT`. Do not hard-code port `4100` for production hosting.
- CORS: allow only approved frontend origins for the controlled demo or production environment. Do not use broad public CORS rules for admin routes.

## Required Backend Environment Variables

Configure these in Render's environment settings. Do not commit `.env` files.

```env
NODE_ENV=production
DATABASE_URL=<Render Postgres internal or external database URL>
ADMIN_API_KEY=<strong secret>
PRMG_RATE_SHEET_URL=http://www.eprmg.net/campaigner/WHLS-1000.xls
ENABLE_DEV_PRMG_FALLBACK=false
ENABLE_SCHEDULER=true
REFRESH_CRON=*/15 * * * *
```

Deployment decision variables:

```env
RUN_MIGRATIONS_ON_START=false
RUN_REFRESH_ON_START=false
```

Use `false` until the team explicitly approves automatic startup migration or refresh behavior. Prefer manual first migration and first refresh for the initial controlled deployment.

Database SSL settings:

```env
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=<provider-specific value>
```

Use the value required by Render's Postgres connection guidance. Do not guess SSL behavior during production rollout; verify it in logs and `/health`.

## Database Setup Checklist

1. Create a Render managed Postgres database.
2. Copy the Render `DATABASE_URL` into the backend web service environment.
3. Confirm SSL settings match Render's database connection requirements.
4. Deploy the backend service.
5. Run migrations safely through an approved one-time Render shell/job path:

```bash
npm run migrate
```

6. Run the first PRMG refresh through one approved path:

```bash
npm run refresh:prmg
```

or:

```text
POST /admin/refresh/prmg
x-admin-api-key: <ADMIN_API_KEY>
```

7. Verify `currentLivePricingVersion` exists before connecting the borrower-facing frontend.

## Verification Checklist

Backend health:

```text
GET https://<render-pricing-backend>/health
```

Pricing quote:

```text
POST https://<render-pricing-backend>/pricing/quote
```

Expected success signals:

- `/health.status` is `ok`.
- `/health.currentLivePricingVersion` is not null.
- `/health.lastRefresh.status` is `published`.
- `/pricing/quote.pricingVersionId` is a DB UUID.
- `/pricing/quote.pricingVersionId` is not `dev-prmg-xls`.
- No `devPrmgFallback` section is shown.
- Borrower-facing pricing responses keep `displayLender` false.

Verified Render backend:

- URL: `https://choose-my-rate-pricing-engine.onrender.com`.
- `/health` is healthy with a non-null `currentLivePricingVersion`.
- `/health.lastRefresh.status` is `published`.
- `/pricing/quote.status` is `live`.
- Safe purchase quote test returned 13 pricing options.
- Borrower-facing options keep `displayLender: false` and do not expose lender names.

## Frontend Deployment Connection

Set the frontend deployment environment variable:

```env
VITE_PRICING_ENGINE_API_URL=https://<render-pricing-backend>
```

For the verified Render backend:

```env
VITE_PRICING_ENGINE_API_URL=https://choose-my-rate-pricing-engine.onrender.com
```

Then rebuild and redeploy the frontend.

Frontend verification:

- Pricing panel shows `CONFIGURED PRICING ENGINE`.
- `Demo pricing mode` is not showing.
- Pricing results populate from the Render backend.
- Borrower-facing disclosures remain visible.
- Lender names remain hidden from borrower-facing pricing options.

## Security Notes

- Never expose `ADMIN_API_KEY` in frontend code, browser logs, screenshots, or public docs.
- Do not commit `.env` files.
- Restrict CORS to approved frontend origins.
- Keep lender names hidden in borrower-facing pricing UI.
- Keep borrower disclosures visible: pricing is subject to change, rates are not locked, and pricing is not a loan approval.
- Review Render logs to ensure secrets, database URLs, admin keys, and lender-internal details are not printed.
- Rotate `ADMIN_API_KEY` if it is copied into an insecure channel.

## Rollback

- Disable the scheduler if refresh behavior is suspect.
- Pause pricing through platform controls if supported and approved.
- Revert the frontend `VITE_PRICING_ENGINE_API_URL` to the prior known-good backend URL if needed.
- Redeploy the prior frontend build if borrower-facing pricing or disclosures regress.
- Redeploy the prior backend build if `/health`, `/pricing/quote`, or refresh behavior regresses.
- Keep the prior known-good commit hashes and Render deploy IDs recorded before promotion.

## Open Questions

- What exact GitHub repo structure will Render use?
- Will the backend remain inside the nested `Choose-My-Rate/pricing-engine` path or move to a dedicated backend repo?
- Who owns the Render account?
- What final domain or subdomain will point to the pricing backend?
- Who controls DNS?
- When will compliance approve borrower-facing pricing, savings, cash-out, debt-consolidation, and disclosure language?
- Should PRMG refresh run inside the web service scheduler or as a separate Render worker/cron service?
- Who owns `ADMIN_API_KEY` rotation and incident response?
