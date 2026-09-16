export interface Project {
  id: string;
  name: string;
  description: string;
  test_type: 'ui' | 'api' | 'mobile';
  created_at: string;
}

export interface Environment {
  id: string;
  project_id: string;
  name: 'dev' | 'staging' | 'prod';
  url: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  req_id: string;
  title: string;
  description: string;
  source: 'jira' | 'document' | 'url' | 'api_spec' | 'mobile' | 'manual';
  source_ref: string;
  is_critical: boolean;
  has_coverage: boolean;
  created_at: string;
}

export interface ValidationCheck {
  check_number: number;
  check_name: string;
  tier: 1 | 2 | 3;
  result: 'pass' | 'fail' | 'warn';
  summary: string;
  details?: string;
  ai_analysis?: string;
  score?: number;
}

export interface TestCase {
  id: string;
  project_id: string;
  title: string;
  gherkin: string;
  test_type: 'ui' | 'api' | 'mobile';
  category: 'happy_path' | 'negative' | 'boundary';
  source_req_ids: string[];
  status: 'draft' | 'validated' | 'approved' | 'rejected';
  validation_score: number;
  steps: { step_number: number; keyword: string; action: string; expected_result?: string }[];
  last_run_status?: 'pass' | 'fail' | 'skip' | null;
  last_run_duration_ms?: number | null;
  flaky_score: number;
  recent_runs: string[];
  is_quarantined: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestCaseVersion {
  id: string;
  test_case_id: string;
  version: number;
  changed_by: 'AI Auto-Heal' | 'Manual Edit' | 'Initial Generation';
  reason: string;
  gherkin: string;
  created_at: string;
}

export interface TestSuite {
  id: string;
  project_id: string;
  name: string;
  suite_type: 'smoke' | 'sanity' | 'regression';
  auto_generated: boolean;
  estimated_duration_min: number;
  last_run_status: 'passed' | 'failed' | 'pending' | null;
  last_run_pass_rate: number;
  created_at: string;
}

export interface SuiteMembership {
  id: string;
  suite_id: string;
  test_case_id: string;
  sort_order: number;
}

export interface TestRun {
  id: string;
  project_id: string;
  suite_id: string;
  suite_name: string;
  suite_type: 'smoke' | 'sanity' | 'regression';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  environment: 'dev' | 'staging' | 'prod';
  started_at: string;
  completed_at: string | null;
  total_cases: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_sec: number;
}

export interface TestRunResult {
  id: string;
  run_id: string;
  test_case_id: string;
  test_case_title: string;
  browser: string;
  status: 'pass' | 'fail' | 'skip' | 'pending' | 'running';
  duration_ms: number;
  error_log: string;
  screenshot_url: string;
}

export interface Defect {
  id: string;
  project_id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  test_case_title: string;
  run_id: string;
  error_log: string;
  created_at: string;
}

export interface PlanItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  suite: 'smoke' | 'sanity' | 'regression';
  category: 'happy_path' | 'negative' | 'boundary';
  description: string;
}

export interface TestPlan {
  id: string;
  project_id: string;
  name: string;
  summary: string;
  status: 'draft' | 'approved' | 'archived';
  items: PlanItem[];
  created_at: string;
  updated_at: string;
}

export interface CICDConfig {
  id: string;
  project_id: string;
  github_owner: string;
  github_repo: string;
  github_token: string;
  is_connected: boolean;
  trigger_rules: { event: string; branch: string; suite: string }[];
}

export interface CICDRun {
  id: string;
  project_id: string;
  commit_sha: string;
  commit_message: string;
  triggered_suite: string;
  run_status: 'pending' | 'running' | 'completed' | 'failed';
  pass_rate: number;
  github_status: 'pending' | 'passed' | 'failed';
  timestamp: string;
}

export const validationCheckDefs = [
  { check_number: 1, check_name: 'Structural Lint', tier: 1 as const, description: 'Are all terms in the test real? Pure vocabulary lookup against requirements.' },
  { check_number: 2, check_name: 'Citation / Entailment', tier: 1 as const, description: 'Does a requirement support each Gherkin line? AI judges entailment.' },
  { check_number: 3, check_name: 'Multi-Pass Consistency', tier: 1 as const, description: 'Generate 3 times, check line stability across runs.' },
  { check_number: 4, check_name: 'Answer-Key Regression', tier: 1 as const, description: 'Do Then-clauses match BA expected results?' },
  { check_number: 5, check_name: 'Semantic Equivalence', tier: 2 as const, description: 'Reconstruct business rule from test, compare to requirement.' },
  { check_number: 6, check_name: 'Coverage Gap Detector', tier: 2 as const, description: 'Which requirements have zero test coverage?' },
  { check_number: 7, check_name: 'Edge Case Challenger', tier: 2 as const, description: 'What boundary conditions are untested?' },
  { check_number: 8, check_name: 'Contradiction Detector', tier: 3 as const, description: 'Do any two tests contradict each other?' },
  { check_number: 9, check_name: 'Ambiguity Scorer', tier: 3 as const, description: 'Score each step 0-10 for implementation clarity.' },
  { check_number: 10, check_name: 'Executable Oracle', tier: 3 as const, description: 'Would this test pass on a broken system? Bug injection simulation.' },
];
