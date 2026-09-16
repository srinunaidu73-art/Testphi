/*
# Add browser column to test_run_results

1. Modified Tables
- `test_run_results` — add `browser` (text, default 'chromium') to record which browser each result ran on.

2. Security
- No changes. Existing RLS policies already cover the new column.
*/

ALTER TABLE test_run_results ADD COLUMN IF NOT EXISTS browser text NOT NULL DEFAULT 'chromium';
