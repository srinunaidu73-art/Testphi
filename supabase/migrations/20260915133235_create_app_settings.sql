/*
# Create app_settings table for AI API configuration

1. New Tables
- `app_settings` — stores AI API key and base URL for edge functions
- `id` (uuid, primary key)
- `key` (text, setting name)
- `value` (text, setting value)
- `created_at` (timestamp)
- `updated_at` (timestamp)

2. Security
- RLS enabled on `app_settings`
- NO SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated roles
- Only the service role (used by edge functions) can access this table,
  because the service role bypasses RLS
- This prevents the API key from being exposed to the frontend
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies — anon and authenticated cannot read this table.
-- Edge functions use the service role key which bypasses RLS.
