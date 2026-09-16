/*
# TestPhi — Complete Database Schema

## Overview
Creates the full schema for TestPhi, an AI-powered test generation and validation platform.
This is a single-tenant app (no sign-in screen), so all policies use `TO anon, authenticated`.

## New Tables

1. `projects` — Test projects (UI/API/mobile), each containing requirements, test cases, suites, runs
2. `requirements` — Requirements extracted from Jira, documents, URLs, API specs, or manual entry
3. `test_cases` — Gherkin test cases generated from requirements, with validation scores
4. `test_case_versions` — Version history for each test case (tracks AI auto-heal and manual edits)
5. `validation_results` — 10-check validation results per test case
6. `test_suites` — Smoke/sanity/regression suite definitions
7. `suite_memberships` — Which test cases belong to which suites
8. `test_runs` — Execution runs of suites against environments
9. `test_run_results` — Per-test results within a run (pass/fail/skip, duration, errors)
10. `defects` — Bugs discovered during test execution
11. `cicd_configs` — GitHub integration configuration per project
12. `cicd_runs` — CI/CD-triggered run records linked to GitHub commits
13. `environments` — Target environment URLs (dev/staging/prod) per project

## Security
- RLS enabled on all tables
- All policies use `TO anon, authenticated` (single-tenant, no auth)
- Full CRUD access for all tables
*/

-- ============================================================
-- 1. PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  test_type text NOT NULL DEFAULT 'ui' CHECK (test_type IN ('ui', 'api', 'mobile')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 2. ENVIRONMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name IN ('dev', 'staging', 'prod')),
  url text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_environments" ON environments;
CREATE POLICY "anon_select_environments" ON environments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_environments" ON environments;
CREATE POLICY "anon_insert_environments" ON environments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_environments" ON environments;
CREATE POLICY "anon_update_environments" ON environments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_environments" ON environments;
CREATE POLICY "anon_delete_environments" ON environments FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 3. REQUIREMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  req_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('jira', 'document', 'url', 'api_spec', 'mobile', 'manual')),
  source_ref text DEFAULT '',
  is_critical boolean DEFAULT false,
  has_coverage boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_requirements" ON requirements;
CREATE POLICY "anon_select_requirements" ON requirements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_requirements" ON requirements;
CREATE POLICY "anon_insert_requirements" ON requirements FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_requirements" ON requirements;
CREATE POLICY "anon_update_requirements" ON requirements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_requirements" ON requirements;
CREATE POLICY "anon_delete_requirements" ON requirements FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 4. TEST CASES
-- ============================================================
CREATE TABLE IF NOT EXISTS test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  gherkin text NOT NULL DEFAULT '',
  test_type text NOT NULL DEFAULT 'ui' CHECK (test_type IN ('ui', 'api', 'mobile')),
  category text NOT NULL DEFAULT 'happy_path' CHECK (category IN ('happy_path', 'negative', 'boundary')),
  source_req_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'approved', 'rejected')),
  validation_score integer DEFAULT 0,
  steps jsonb DEFAULT '[]'::jsonb,
  last_run_status text CHECK (last_run_status IS NULL OR last_run_status IN ('pass', 'fail', 'skip')),
  last_run_duration_ms integer,
  flaky_score integer DEFAULT 0,
  recent_runs jsonb DEFAULT '[]'::jsonb,
  is_quarantined boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_test_cases" ON test_cases;
CREATE POLICY "anon_select_test_cases" ON test_cases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_test_cases" ON test_cases;
CREATE POLICY "anon_insert_test_cases" ON test_cases FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_test_cases" ON test_cases;
CREATE POLICY "anon_update_test_cases" ON test_cases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_test_cases" ON test_cases;
CREATE POLICY "anon_delete_test_cases" ON test_cases FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 5. TEST CASE VERSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS test_case_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id uuid NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  changed_by text NOT NULL DEFAULT 'Initial Generation' CHECK (changed_by IN ('AI Auto-Heal', 'Manual Edit', 'Initial Generation')),
  reason text NOT NULL DEFAULT '',
  gherkin text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE test_case_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tcv" ON test_case_versions;
CREATE POLICY "anon_select_tcv" ON test_case_versions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tcv" ON test_case_versions;
CREATE POLICY "anon_insert_tcv" ON test_case_versions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tcv" ON test_case_versions;
CREATE POLICY "anon_delete_tcv" ON test_case_versions FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 6. VALIDATION RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id uuid NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  check_number integer NOT NULL CHECK (check_number BETWEEN 1 AND 10),
  check_name text NOT NULL,
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 3),
  result text NOT NULL CHECK (result IN ('pass', 'fail', 'warn')),
  summary text DEFAULT '',
  ai_analysis text DEFAULT '',
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vr" ON validation_results;
CREATE POLICY "anon_select_vr" ON validation_results FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_vr" ON validation_results;
CREATE POLICY "anon_insert_vr" ON validation_results FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_vr" ON validation_results;
CREATE POLICY "anon_delete_vr" ON validation_results FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 7. TEST SUITES
-- ============================================================
CREATE TABLE IF NOT EXISTS test_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  suite_type text NOT NULL CHECK (suite_type IN ('smoke', 'sanity', 'regression')),
  auto_generated boolean DEFAULT true,
  estimated_duration_min integer DEFAULT 5,
  last_run_status text CHECK (last_run_status IS NULL OR last_run_status IN ('passed', 'failed', 'pending')),
  last_run_pass_rate integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE test_suites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_suites" ON test_suites;
CREATE POLICY "anon_select_suites" ON test_suites FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suites" ON test_suites;
CREATE POLICY "anon_insert_suites" ON test_suites FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suites" ON test_suites;
CREATE POLICY "anon_update_suites" ON test_suites FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suites" ON test_suites;
CREATE POLICY "anon_delete_suites" ON test_suites FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 8. SUITE MEMBERSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS suite_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id uuid NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  test_case_id uuid NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  UNIQUE (suite_id, test_case_id)
);

ALTER TABLE suite_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sm" ON suite_memberships;
CREATE POLICY "anon_select_sm" ON suite_memberships FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sm" ON suite_memberships;
CREATE POLICY "anon_insert_sm" ON suite_memberships FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sm" ON suite_memberships;
CREATE POLICY "anon_delete_sm" ON suite_memberships FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 9. TEST RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  suite_id uuid REFERENCES test_suites(id) ON DELETE SET NULL,
  suite_name text NOT NULL DEFAULT '',
  suite_type text NOT NULL DEFAULT 'smoke' CHECK (suite_type IN ('smoke', 'sanity', 'regression')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'aborted')),
  environment text NOT NULL DEFAULT 'staging' CHECK (environment IN ('dev', 'staging', 'prod')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  total_cases integer DEFAULT 0,
  passed integer DEFAULT 0,
  failed integer DEFAULT 0,
  skipped integer DEFAULT 0,
  duration_sec integer DEFAULT 0
);

ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_runs" ON test_runs;
CREATE POLICY "anon_select_runs" ON test_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_runs" ON test_runs;
CREATE POLICY "anon_insert_runs" ON test_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_runs" ON test_runs;
CREATE POLICY "anon_update_runs" ON test_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_runs" ON test_runs;
CREATE POLICY "anon_delete_runs" ON test_runs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 10. TEST RUN RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS test_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  test_case_id uuid REFERENCES test_cases(id) ON DELETE SET NULL,
  test_case_title text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'skip', 'pending', 'running')),
  duration_ms integer DEFAULT 0,
  error_log text DEFAULT '',
  screenshot_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE test_run_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_trr" ON test_run_results;
CREATE POLICY "anon_select_trr" ON test_run_results FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trr" ON test_run_results;
CREATE POLICY "anon_insert_trr" ON test_run_results FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_trr" ON test_run_results;
CREATE POLICY "anon_update_trr" ON test_run_results FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trr" ON test_run_results;
CREATE POLICY "anon_delete_trr" ON test_run_results FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 11. DEFECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  test_case_title text DEFAULT '',
  run_id uuid REFERENCES test_runs(id) ON DELETE SET NULL,
  error_log text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE defects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_defects" ON defects;
CREATE POLICY "anon_select_defects" ON defects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_defects" ON defects;
CREATE POLICY "anon_insert_defects" ON defects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_defects" ON defects;
CREATE POLICY "anon_update_defects" ON defects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_defects" ON defects;
CREATE POLICY "anon_delete_defects" ON defects FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 12. CICD CONFIGS
-- ============================================================
CREATE TABLE IF NOT EXISTS cicd_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_owner text DEFAULT '',
  github_repo text DEFAULT '',
  github_token text DEFAULT '',
  webhook_secret text DEFAULT '',
  is_connected boolean DEFAULT false,
  trigger_rules jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cicd_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cicd_cfg" ON cicd_configs;
CREATE POLICY "anon_select_cicd_cfg" ON cicd_configs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cicd_cfg" ON cicd_configs;
CREATE POLICY "anon_insert_cicd_cfg" ON cicd_configs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cicd_cfg" ON cicd_configs;
CREATE POLICY "anon_update_cicd_cfg" ON cicd_configs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cicd_cfg" ON cicd_configs;
CREATE POLICY "anon_delete_cicd_cfg" ON cicd_configs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 13. CICD RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS cicd_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha text NOT NULL DEFAULT '',
  commit_message text DEFAULT '',
  triggered_suite text DEFAULT '',
  run_status text DEFAULT 'pending' CHECK (run_status IN ('pending', 'running', 'completed', 'failed')),
  pass_rate integer DEFAULT 0,
  github_status text DEFAULT 'pending' CHECK (github_status IN ('pending', 'passed', 'failed')),
  run_id uuid REFERENCES test_runs(id) ON DELETE SET NULL,
  timestamp timestamptz DEFAULT now()
);

ALTER TABLE cicd_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cicd_runs" ON cicd_runs;
CREATE POLICY "anon_select_cicd_runs" ON cicd_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cicd_runs" ON cicd_runs;
CREATE POLICY "anon_insert_cicd_runs" ON cicd_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cicd_runs" ON cicd_runs;
CREATE POLICY "anon_update_cicd_runs" ON cicd_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cicd_runs" ON cicd_runs;
CREATE POLICY "anon_delete_cicd_runs" ON cicd_runs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_suites_project ON test_suites(project_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_defects_project ON defects(project_id);
CREATE INDEX IF NOT EXISTS idx_validation_tc ON validation_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_suite_members_suite ON suite_memberships(suite_id);
CREATE INDEX IF NOT EXISTS idx_run_results_run ON test_run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_tcv_tc ON test_case_versions(test_case_id);
