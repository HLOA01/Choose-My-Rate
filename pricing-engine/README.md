# Choose My Rate Pricing Engine

Broker-side pricing engine service for Choose My Rate.

This service is intentionally separate from the borrower-facing React app. Choose My Rate calls this backend by API. It must not ingest lender files, parse workbooks, run pricing refreshes, or read staging data directly.

## Architecture

```text
Choose My Rate frontend
  -> POST /pricing/quote
  -> pricing engine API
  -> latest published live pricing version only
```

PRMG ingestion runs independently:

```text
Scheduler every 15 minutes
  -> download PRMG WHLS-1000 XLS
  -> hash file
  -> skip if unchanged
  -> parse workbook
  -> normalize rows
  -> create staging pricing version
  -> validate staging version
  -> atomically publish staging as live
```

The live version is never updated in place. If a refresh fails at any point, the prior live version remains active.

## Setup

```bash
cd pricing-engine
npm install
copy .env.example .env
npm run migrate
npm run dev
```

Optional local seed data:

```bash
npx tsx scripts/seedExamplePricing.ts
```

## Environment

```bash
PORT=4100
DATABASE_URL=postgres://postgres:postgres@localhost:5432/choose_my_rate_pricing
PRMG_RATE_SHEET_URL=http://www.eprmg.net/campaigner/WHLS-1000.xls
REFRESH_CRON=*/15 * * * *
ADMIN_API_KEY=change-me
ENABLE_SCHEDULER=true
```

## Database

The first migration creates:

- `pricing_versions`
- `pricing_rows`
- `refresh_logs`
- `platform_controls`

`pricing_versions.status` supports:

- `staging`
- `live`
- `failed`
- `archived`

Only one live version per lender is allowed.

## Zero-Downtime Publish Flow

1. Download and hash the source file.
2. If hash matches the last successful version, log `skipped`.
3. Parse and normalize into a staging version.
4. Validate staging data.
5. If validation fails, mark staging as `failed` and keep prior live pricing.
6. If validation passes, open a transaction:
   - archive prior live version
   - mark staging version as live
   - set `published_at`

The quote API only reads rows from the latest `live` version.

## PRMG Connector

Primary source:

```text
http://www.eprmg.net/campaigner/WHLS-1000.xls
```

The URL is static, but file contents are dynamic. The connector treats this as a data feed and computes a SHA-256 hash each refresh.

The parser is intentionally tolerant in v1:

- scans worksheets for a header-like row
- accepts common column names such as product/program, rate, price, lock
- ignores marketing/section rows
- emits only rows with numeric rate and price

This gives us a safe first version while we refine PRMG-specific worksheet assumptions.

## API

### GET `/health`

Returns service health, scheduler state, current live pricing version, and last refresh log.

### POST `/pricing/quote`

Input:

```json
{
  "purchasePrice": 400000,
  "loanAmount": 380000,
  "creditScore": 700,
  "occupancy": "primary",
  "loanPurpose": "purchase",
  "loanTypePreference": "conventional",
  "propertyType": "single_family",
  "zipCode": "30004",
  "downPayment": 20000,
  "ltv": null,
  "language": "en"
}
```

The response never exposes lender name.

### POST `/admin/platform-status`

Admin-only. Requires:

```text
x-admin-api-key: <ADMIN_API_KEY>
```

Body:

```json
{
  "pricingStatus": "warning",
  "bannerMessage": "Rates may be changing quickly due to current market conditions. Please confirm final pricing with a mortgage advisor.",
  "callbackEnabled": true,
  "leadCaptureEnabled": true,
  "activatedBy": "admin"
}
```

Modes:

- `live`: pricing returns normally
- `warning`: pricing returns with a banner
- `paused`: pricing options are hidden and a message is returned

### POST `/admin/refresh/prmg`

Admin-only. Forces an immediate PRMG refresh. Uses the same lock and staged publish flow as the scheduler.

## Emergency Controls

Emergency controls live in `platform_controls` and can be changed without deployment.

Paused mode returns:

```json
{
  "status": "paused",
  "banner": null,
  "message": "Due to current market conditions, online pricing is temporarily unavailable. Please leave your information and one of our mortgage advisors will contact you.",
  "options": [],
  "leadCaptureEnabled": true,
  "callbackEnabled": true
}
```

## Version 1 Limits

- PRMG is the first lender connector.
- Ranking is practical: lowest payment, lowest upfront cost, best blend.
- Parser is workbook-layout tolerant, not yet PRMG-section-perfect.
- Admin auth is API-key based and should be hardened before public admin use.
- Metrics and alerting are planned for Priority 2.
