# Choose My Rate Pricing Engine Repo Prep Plan

Purpose: plan the safe preparation of a dedicated backend repository for the Choose My Rate pricing engine so Render can deploy it cleanly. This is planning only; no files have been moved, copied, deployed, or pushed.

## Recommendation Summary

Create a dedicated GitHub repository for the pricing engine before Render deployment:

```text
choose-my-rate-pricing-engine
```

This avoids deploying from the root frontend repo's broken gitlink/submodule-style `Choose-My-Rate` folder and gives the backend its own clean deploy, secrets, database, and rollback lifecycle.

## Why A Dedicated Backend Repo Is Recommended

- The root frontend repo sees `Choose-My-Rate` as a gitlink/submodule-style folder, but there is no `.gitmodules` file.
- Render deployment from the root repo path `Choose-My-Rate/pricing-engine` is therefore risky because a fresh Render clone may not include usable backend source.
- The pricing engine is a separate Node backend with its own package, build, start, migrations, PRMG refresh, database, and secrets.
- A dedicated repo removes Render root-path ambiguity.
- Backend environment variables such as `DATABASE_URL`, `ADMIN_API_KEY`, and PRMG refresh settings can be managed separately from the borrower-facing frontend.
- Backend rollback, refresh scheduling, and database operations can be handled without touching the frontend app.

## Current Source Path

Current local source:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
```

Relative path from the root workspace:

```text
Choose-My-Rate/pricing-engine
```

## Proposed New Repo Name

```text
choose-my-rate-pricing-engine
```

Suggested local destination, if approved later:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate-pricing-engine
```

## Files To Include

Include the backend source and deployment-supporting files needed to build, run, migrate, refresh, and document the pricing engine:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/`
- `scripts/`
- `migrations/`
- `.env.example`
- `README.md`
- `Procfile`, if still useful for the selected host
- `deploy/` docs or role templates, if they are intentionally retained as deployment reference

## Files Never To Include

Never copy or commit:

- `.env`
- `node_modules/`
- `dist/`
- logs such as `*.log` and `pricing-engine.out.log`
- local database files, dumps, or backups
- secrets, credentials, API keys, admin keys, tokens, certificates, or private keys
- machine-specific cache folders

## Required Repo Files

The dedicated repo should contain at least:

```text
package.json
package-lock.json
tsconfig.json
src/
scripts/
migrations/
.env.example
README.md
```

Keep `.env.example` safe: document key names and example placeholders only, never real credentials.

## Safe Copy Steps

These steps should be performed only after approval:

1. Choose a clean destination outside the root frontend app, such as:

```powershell
C:\Users\Owner\OneDrive\Desktop\choose-my-rate-pricing-engine
```

2. Copy only the approved backend files from:

```powershell
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate\pricing-engine
```

3. Exclude `.env`, `node_modules`, `dist`, logs, local database artifacts, and caches.
4. Confirm the destination contains no secrets:

```powershell
git status --short
```

and manually inspect copied env/docs before committing.

5. Confirm the copied package can install and build before creating the first GitHub deployment integration.

## Git Init And First Commit Steps

Run these only in the new dedicated backend folder after the copy is approved and verified:

```powershell
cd C:\Users\Owner\OneDrive\Desktop\choose-my-rate-pricing-engine
git init
git add .
git status --short
git commit -m "Initial pricing engine backend"
```

Before committing, verify again that `.env`, `node_modules`, `dist`, logs, database dumps, and secrets are not staged.

## GitHub Repo Creation Steps

1. Create a new private GitHub repo named:

```text
choose-my-rate-pricing-engine
```

2. Add the GitHub remote to the new local backend repo:

```powershell
git remote add origin https://github.com/<org-or-owner>/choose-my-rate-pricing-engine.git
```

3. Push the first backend commit:

```powershell
git branch -M main
git push -u origin main
```

4. Confirm GitHub contains the backend files and does not contain `.env`, secrets, `node_modules`, `dist`, logs, or local database files.

## Render Deployment Settings After Repo Exists

Render Web Service source:

```text
choose-my-rate-pricing-engine
```

Root directory:

```text
.
```

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Health check endpoint:

```text
/health
```

Required environment variables:

```env
NODE_ENV=production
DATABASE_URL=<Render Postgres database URL>
ADMIN_API_KEY=<strong secret>
PRMG_RATE_SHEET_URL=http://www.eprmg.net/campaigner/WHLS-1000.xls
ENABLE_DEV_PRMG_FALLBACK=false
ENABLE_SCHEDULER=true
REFRESH_CRON=*/15 * * * *
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=<provider-specific value>
RUN_MIGRATIONS_ON_START=false
RUN_REFRESH_ON_START=false
```

Use manual first migration and first PRMG refresh unless the team explicitly approves automatic startup migration or refresh behavior.

## Local Verification After Copy

Run from the new dedicated backend folder:

```powershell
npm install
npm run build
```

Only if approved and pointed at the intended local database:

```powershell
npm run migrate
npm run refresh:prmg
```

Then start locally:

```powershell
npm run dev
```

Expected local backend checks:

```text
GET http://localhost:4100/health
POST http://localhost:4100/pricing/quote
```

DB-backed success signals:

- `currentLivePricingVersion` is not null.
- `lastRefresh.status` is `published`.
- `pricingVersionId` is a DB UUID, not `dev-prmg-xls`.
- No `devPrmgFallback` section appears.

## Risks

- Losing backend history if files are copied into a new repo instead of preserving Git history.
- Accidentally copying `.env` or other secrets.
- Diverging from the nested repo if backend changes continue in two places.
- Render root-path confusion if deployment points at the old nested path instead of the dedicated repo.
- Scheduler and migration behavior causing unexpected database changes if startup controls are enabled too early.
- CORS misconfiguration blocking the hosted frontend from calling the hosted backend.

## Mitigations

- Treat the dedicated repo as the source of truth after it is created.
- Freeze backend edits in the nested repo once the dedicated repo is approved.
- Keep `.env` ignored and never committed.
- Run `git status --short` before every commit.
- Verify Render deploy source is the dedicated repo root, not the root frontend repo.
- Keep `ENABLE_DEV_PRMG_FALLBACK=false` for DB-backed verification.
- Use manual migrations and manual first PRMG refresh for the first cloud deployment.

## Final Recommendation

Use the dedicated `choose-my-rate-pricing-engine` repo for backend deployment before Render setup.

For a controlled demo, this is safer than deploying from the current nested path because it removes the broken gitlink/submodule risk, separates backend secrets from frontend deployment, and gives Render a clean Node service root.
