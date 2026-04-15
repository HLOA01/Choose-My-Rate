CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE pricing_version_status AS ENUM ('staging', 'live', 'failed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE platform_pricing_status AS ENUM ('live', 'warning', 'paused');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS pricing_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_code text NOT NULL,
  source_url text NOT NULL,
  source_hash text NOT NULL,
  source_timestamp timestamptz,
  refresh_started_at timestamptz NOT NULL,
  refresh_completed_at timestamptz,
  effective_date date,
  status pricing_version_status NOT NULL,
  published_at timestamptz,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_versions_lender_status
  ON pricing_versions (lender_code, status, published_at DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_versions_live_one_per_lender
  ON pricing_versions (lender_code)
  WHERE status = 'live';

CREATE TABLE IF NOT EXISTS pricing_rows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pricing_version_id uuid NOT NULL REFERENCES pricing_versions(id) ON DELETE CASCADE,
  lender_code text NOT NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  loan_type text NOT NULL,
  term_months integer NOT NULL,
  amortization_type text NOT NULL,
  rate numeric(6,3) NOT NULL,
  price numeric(8,3) NOT NULL,
  lock_days integer NOT NULL,
  points_or_credit_type text NOT NULL,
  channel text NOT NULL,
  raw_row_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rows_version
  ON pricing_rows (pricing_version_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rows_search
  ON pricing_rows (pricing_version_id, loan_type, term_months, rate, price);

CREATE TABLE IF NOT EXISTS refresh_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lender_code text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL,
  message text NOT NULL,
  error_details jsonb,
  pricing_version_id uuid REFERENCES pricing_versions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_logs_lender_started
  ON refresh_logs (lender_code, started_at DESC);

CREATE TABLE IF NOT EXISTS platform_controls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pricing_status platform_pricing_status NOT NULL DEFAULT 'live',
  banner_message text,
  pause_message text,
  callback_enabled boolean NOT NULL DEFAULT false,
  lead_capture_enabled boolean NOT NULL DEFAULT false,
  use_last_published_pricing boolean NOT NULL DEFAULT true,
  activated_by text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_controls (
  pricing_status,
  banner_message,
  pause_message,
  callback_enabled,
  lead_capture_enabled,
  use_last_published_pricing,
  activated_by
)
SELECT
  'live',
  NULL,
  'Due to current market conditions, online pricing is temporarily unavailable. Please leave your information and one of our mortgage advisors will contact you.',
  false,
  false,
  true,
  'migration'
WHERE NOT EXISTS (SELECT 1 FROM platform_controls);
