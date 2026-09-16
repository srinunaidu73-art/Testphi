/*
# Create test_plans table

1. New Tables
- `test_plans` — stores a prioritized test plan produced by the planner
- `id` (uuid, primary key)
- `project_id` (uuid, references projects, cascades on delete)
- `name` (text, plan name)
- `summary` (text, plain-English summary of the plan)
- `status` (text, draft/approved/archived)
- `items` (jsonb, array of plan items with title, priority, suite, category, description)
- `created_at`, `updated_at` (timestamps)

2. Security
- RLS enabled; anon + authenticated can read/write (single-tenant app, no sign-in)
*/

CREATE TABLE IF NOT EXISTS test_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE test_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_test_plans" ON test_plans;
CREATE POLICY "anon_select_test_plans" ON test_plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_test_plans" ON test_plans;
CREATE POLICY "anon_insert_test_plans" ON test_plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_test_plans" ON test_plans;
CREATE POLICY "anon_update_test_plans" ON test_plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_test_plans" ON test_plans;
CREATE POLICY "anon_delete_test_plans" ON test_plans FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_test_plans_project ON test_plans(project_id);
