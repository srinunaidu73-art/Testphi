import { supabase } from './supabase';
import type {
  Project, Environment, Requirement, TestCase, TestCaseVersion,
  TestSuite, SuiteMembership, TestRun, TestRunResult, Defect,
  CICDConfig, CICDRun, ValidationCheck, TestPlan,
} from './types';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';

// ===== Projects =====
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProject(name: string, description: string, test_type: string): Promise<Project> {
  const { data, error } = await supabase.from('projects').insert({ name, description, test_type }).select().single();
  if (error) throw error;
  const envRows = ['dev', 'staging', 'prod'].map(n => ({ project_id: data.id, name: n, url: '' }));
  await supabase.from('environments').insert(envRows);
  await createDefaultSuites(data.id);
  return data;
}

async function createDefaultSuites(projectId: string): Promise<void> {
  const suites = [
    { project_id: projectId, name: 'Smoke Suite', suite_type: 'smoke', auto_generated: true, estimated_duration_min: 5 },
    { project_id: projectId, name: 'Sanity Suite', suite_type: 'sanity', auto_generated: true, estimated_duration_min: 15 },
    { project_id: projectId, name: 'Regression Suite', suite_type: 'regression', auto_generated: true, estimated_duration_min: 45 },
  ];
  await supabase.from('test_suites').insert(suites);
}

// ===== Environments =====
export async function fetchEnvironments(projectId: string): Promise<Environment[]> {
  const { data, error } = await supabase.from('environments').select('*').eq('project_id', projectId);
  if (error) throw error;
  return data || [];
}

export async function updateEnvironment(id: string, url: string): Promise<void> {
  const { error } = await supabase.from('environments').update({ url }).eq('id', id);
  if (error) throw error;
}

// ===== Requirements =====
export async function fetchRequirements(projectId: string): Promise<Requirement[]> {
  const { data, error } = await supabase.from('requirements').select('*').eq('project_id', projectId).order('created_at');
  if (error) throw error;
  return data || [];
}

export async function createRequirement(req: Partial<Requirement> & { project_id: string }): Promise<Requirement> {
  const { data, error } = await supabase.from('requirements').insert(req).select().single();
  if (error) throw error;
  return data;
}

export async function updateRequirement(id: string, updates: Partial<Requirement>): Promise<void> {
  const { error } = await supabase.from('requirements').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteRequirement(id: string): Promise<void> {
  const { error } = await supabase.from('requirements').delete().eq('id', id);
  if (error) throw error;
}

// ===== Test Cases =====
export async function fetchTestCases(projectId: string): Promise<TestCase[]> {
  const { data, error } = await supabase.from('test_cases').select('*').eq('project_id', projectId).order('created_at');
  if (error) throw error;
  return data || [];
}

export async function fetchTestCase(id: string): Promise<TestCase | null> {
  const { data, error } = await supabase.from('test_cases').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTestCase(tc: Partial<TestCase> & { project_id: string }): Promise<TestCase> {
  const { data, error } = await supabase.from('test_cases').insert(tc).select().single();
  if (error) throw error;
  return data;
}

export async function updateTestCase(id: string, updates: Partial<TestCase>): Promise<void> {
  const { error } = await supabase.from('test_cases').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteTestCase(id: string): Promise<void> {
  const { error } = await supabase.from('test_cases').delete().eq('id', id);
  if (error) throw error;
}

// ===== Test Case Versions =====
export async function fetchTestCaseVersions(testCaseId: string): Promise<TestCaseVersion[]> {
  const { data, error } = await supabase.from('test_case_versions').select('*').eq('test_case_id', testCaseId).order('version', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTestCaseVersion(version: Partial<TestCaseVersion> & { test_case_id: string }): Promise<void> {
  const { error } = await supabase.from('test_case_versions').insert(version);
  if (error) throw error;
}

// ===== Validation Results =====
export async function fetchValidationResults(testCaseId: string): Promise<ValidationCheck[]> {
  const { data, error } = await supabase.from('validation_results').select('*').eq('test_case_id', testCaseId).order('check_number');
  if (error) throw error;
  return (data || []).map(r => ({
    check_number: r.check_number,
    check_name: r.check_name,
    tier: r.tier,
    result: r.result,
    summary: r.summary,
    ai_analysis: r.ai_analysis,
    score: r.score,
  }));
}

export async function createValidationResults(results: { test_case_id: string; check_number: number; check_name: string; tier: number; result: string; summary: string; ai_analysis?: string; score?: number }[]): Promise<void> {
  const { error } = await supabase.from('validation_results').insert(results);
  if (error) throw error;
}

// ===== Test Suites =====
export async function fetchSuites(projectId: string): Promise<TestSuite[]> {
  const { data, error } = await supabase.from('test_suites').select('*').eq('project_id', projectId).order('suite_type');
  if (error) throw error;
  return data || [];
}

export async function fetchSuiteMemberships(suiteId: string): Promise<SuiteMembership[]> {
  const { data, error } = await supabase.from('suite_memberships').select('*').eq('suite_id', suiteId).order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function addTestToSuite(suiteId: string, testCaseId: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('suite_memberships').insert({ suite_id: suiteId, test_case_id: testCaseId, sort_order: sortOrder });
  if (error) throw error;
}

export async function removeTestFromSuite(suiteId: string, testCaseId: string): Promise<void> {
  const { error } = await supabase.from('suite_memberships').delete().eq('suite_id', suiteId).eq('test_case_id', testCaseId);
  if (error) throw error;
}

// ===== Test Runs =====
export async function fetchTestRuns(projectId: string): Promise<TestRun[]> {
  const { data, error } = await supabase.from('test_runs').select('*').eq('project_id', projectId).order('started_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTestRun(run: Partial<TestRun> & { project_id: string }): Promise<TestRun> {
  const { data, error } = await supabase.from('test_runs').insert(run).select().single();
  if (error) throw error;
  return data;
}

export async function updateTestRun(id: string, updates: Partial<TestRun>): Promise<void> {
  const { error } = await supabase.from('test_runs').update(updates).eq('id', id);
  if (error) throw error;
}

export async function fetchRunResults(runId: string): Promise<TestRunResult[]> {
  const { data, error } = await supabase.from('test_run_results').select('*').eq('run_id', runId);
  if (error) throw error;
  return data || [];
}

export async function createRunResult(result: Partial<TestRunResult> & { run_id: string }): Promise<void> {
  const { error } = await supabase.from('test_run_results').insert(result);
  if (error) throw error;
}

export async function updateRunResult(id: string, updates: Partial<TestRunResult>): Promise<void> {
  const { error } = await supabase.from('test_run_results').update(updates).eq('id', id);
  if (error) throw error;
}

// ===== Defects =====
export async function fetchDefects(projectId: string): Promise<Defect[]> {
  const { data, error } = await supabase.from('defects').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createDefect(defect: Partial<Defect> & { project_id: string }): Promise<Defect> {
  const { data, error } = await supabase.from('defects').insert(defect).select().single();
  if (error) throw error;
  return data;
}

export async function updateDefect(id: string, updates: Partial<Defect>): Promise<void> {
  const { error } = await supabase.from('defects').update(updates).eq('id', id);
  if (error) throw error;
}

// ===== Test Plans =====
export async function fetchTestPlans(projectId: string): Promise<TestPlan[]> {
  const { data, error } = await supabase.from('test_plans').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateTestPlan(id: string, updates: Partial<TestPlan>): Promise<void> {
  const { error } = await supabase.from('test_plans').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteTestPlan(id: string): Promise<void> {
  const { error } = await supabase.from('test_plans').delete().eq('id', id);
  if (error) throw error;
}

// ===== CICD =====
export async function fetchCICDConfig(projectId: string): Promise<CICDConfig | null> {
  const { data, error } = await supabase.from('cicd_configs').select('*').eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCICDConfig(config: Partial<CICDConfig> & { project_id: string }): Promise<CICDConfig> {
  const { data, error } = await supabase.from('cicd_configs').upsert(config).select().single();
  if (error) throw error;
  return data;
}

export async function fetchCICDRuns(projectId: string): Promise<CICDRun[]> {
  const { data, error } = await supabase.from('cicd_runs').select('*').eq('project_id', projectId).order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
}

export { PROJECT_ID };
