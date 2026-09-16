/*
# Create login credentials table

1. New Tables
- `credentials` — stores login details for a target website per environment, so the
  test runner can sign in before executing tests.
  - `id` (uuid, primary key)
  - `project_id` (uuid, references projects, cascades on delete)
  - `environment` (text: dev / staging / prod)
  - `login_url` (text, the sign-in page URL)
  - `username` (text)
  - `password` (text)
  - `username_selector` (text, optional CSS selector for the username field)
  - `password_selector` (text, optional CSS selector for the password field)
  - `submit_selector` (text, optional CSS selector for the login button)
  - `created_at`, `updated_at` (timestamps)
  - Unique on (project_id, environment): one set of credentials per environment.

2. Security
- RLS is ENABLED on `credentials` but NO policies are created. This mirrors the
  existing `app_settings` table: only the service role (used by edge functions)
  can read or write it. Passwords are therefore never exposed to the browser or
  to the anon/authenticated roles.
- The `manage-settings` edge function (service role) is the only read/write path,
  and it returns passwords masked.

3. Notes
- Credentials are optional. If none exist for the run's environment, the runner
  skips login and behaves as before.
*/

CREATE TABLE IF NOT EXISTS credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('dev', 'staging', 'prod')),
  login_url text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  username_selector text NOT NULL DEFAULT '',
  password_selector text NOT NULL DEFAULT '',
  submit_selector text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (project_id, environment)
);

ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credentials_project ON credentials(project_id);
