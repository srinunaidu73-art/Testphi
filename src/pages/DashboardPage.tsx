import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FlaskConical, ShieldCheck, TrendingUp, AlertTriangle, FileText, Play } from 'lucide-react';
import { Card, StatCard, Badge, ProgressBar, Button } from '../components/ui';
import { fetchProject, fetchTestCases, fetchSuites, fetchTestRuns, fetchRequirements, PROJECT_ID } from '../lib/api';
import type { Project, TestCase, TestSuite, TestRun, Requirement } from '../lib/types';

export default function DashboardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [project, setProject] = React.useState<Project | null>(null);
  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [suites, setSuites] = React.useState<TestSuite[]>([]);
  const [runs, setRuns] = React.useState<TestRun[]>([]);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [proj, cases, sues, rns, reqs] = await Promise.all([
          fetchProject(pid),
          fetchTestCases(pid),
          fetchSuites(pid),
          fetchTestRuns(pid),
          fetchRequirements(pid),
        ]);
        setProject(proj);
        setTestCases(cases);
        setSuites(sues);
        setRuns(rns);
        setRequirements(reqs);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  if (loading) return <div className="text-center py-20 text-ink-400">Loading dashboard...</div>;

  const totalTests = testCases.length;
  const validatedTests = testCases.filter(t => t.status === 'validated' || t.status === 'approved').length;
  const scoredTests = testCases.filter(t => t.validation_score > 0);
  const avgScore = scoredTests.length > 0 ? Math.round(scoredTests.reduce((a, t) => a + t.validation_score, 0) / scoredTests.length) : 0;
  const smokeSuite = suites.find(s => s.suite_type === 'smoke');
  const smokePassRate = smokeSuite?.last_run_pass_rate ?? 0;
  const coveredReqs = requirements.filter(r => r.has_coverage).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Project Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">{project?.name} — {project?.test_type.toUpperCase()} testing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/project/${pid}/requirements`)}>
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Import Requirements</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate(`/project/${pid}/execution`)}>
            <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Run Suite</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Test Cases" value={totalTests} sublabel={`${testCases.filter(t => t.test_type === 'ui').length} UI, ${testCases.filter(t => t.test_type === 'api').length} API`} icon={<FlaskConical className="w-6 h-6" />} variant="brand" />
        <StatCard label="Validated Tests" value={validatedTests} sublabel={`${totalTests > 0 ? Math.round((validatedTests / totalTests) * 100) : 0}% of total`} icon={<ShieldCheck className="w-6 h-6" />} variant="success" />
        <StatCard label="Avg Validation Score" value={`${avgScore}/10`} sublabel="Across validated tests" icon={<TrendingUp className="w-6 h-6" />} variant="brand" />
        <StatCard label="Smoke Pass Rate" value={`${smokePassRate}%`} sublabel={smokeSuite?.last_run_status === 'failed' ? 'Last run: failed' : 'Last run: passed'} icon={<AlertTriangle className="w-6 h-6" />} variant={smokePassRate >= 90 ? 'success' : 'danger'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Recent Test Runs</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${pid}/reports`)}>View all</Button>
          </div>
          <div className="space-y-3">
            {runs.slice(0, 5).map(run => {
              const passPct = run.total_cases > 0 ? Math.round((run.passed / run.total_cases) * 100) : 0;
              return (
                <div key={run.id} className="flex items-center gap-4 py-2 border-b border-ink-100 last:border-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={run.suite_type === 'smoke' ? 'brand' : run.suite_type === 'sanity' ? 'success' : 'neutral'}>{run.suite_type}</Badge>
                      <span className="text-sm font-medium text-ink-700">{run.suite_name}</span>
                    </div>
                    <p className="text-xs text-ink-400">{new Date(run.started_at).toLocaleString()} — {run.environment}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5 text-xs">
                      <span className="text-success-600 font-medium">{run.passed} pass</span>
                      <span className="text-danger-600 font-medium">{run.failed} fail</span>
                      {run.skipped > 0 && <span className="text-ink-400 font-medium">{run.skipped} skip</span>}
                    </div>
                    <div className="w-20">
                      <ProgressBar value={passPct} variant={passPct >= 90 ? 'success' : passPct >= 70 ? 'warn' : 'danger'} height="h-1.5" />
                    </div>
                  </div>
                </div>
              );
            })}
            {runs.length === 0 && <p className="text-sm text-ink-400 text-center py-4">No runs yet</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-800 mb-4">Validation Health</h2>
          <div className="space-y-2.5">
            {[
              { name: 'Structural Lint', pass: 8, fail: 0, warn: 0 },
              { name: 'Citation', pass: 7, fail: 1, warn: 0 },
              { name: 'Consistency', pass: 8, fail: 0, warn: 0 },
              { name: 'Answer-Key', pass: 6, fail: 0, warn: 2 },
              { name: 'Semantic Eq.', pass: 8, fail: 0, warn: 0 },
              { name: 'Coverage Gap', pass: 5, fail: 3, warn: 0 },
              { name: 'Edge Case', pass: 4, fail: 0, warn: 4 },
              { name: 'Contradiction', pass: 8, fail: 0, warn: 0 },
              { name: 'Ambiguity', pass: 6, fail: 0, warn: 2 },
              { name: 'Exec. Oracle', pass: 8, fail: 0, warn: 0 },
            ].map(check => (
              <div key={check.name} className="flex items-center gap-2 text-xs">
                <span className="text-ink-600 w-24 truncate">{check.name}</span>
                <div className="flex-1 flex gap-0.5 h-2 rounded-full overflow-hidden bg-ink-100">
                  <div className="bg-success-500" style={{ width: `${(check.pass / 8) * 100}%` }} />
                  {check.fail > 0 && <div className="bg-danger-500" style={{ width: `${(check.fail / 8) * 100}%` }} />}
                  {check.warn > 0 && <div className="bg-warn-500" style={{ width: `${(check.warn / 8) * 100}%` }} />}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-ink-100 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success-500"></span> Pass</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger-500"></span> Fail</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warn-500"></span> Warn</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-ink-800 mb-4">Suite Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suites.map(suite => {
              const statusColor = suite.last_run_status === 'passed' ? 'success' : suite.last_run_status === 'failed' ? 'danger' : 'neutral';
              return (
                <div key={suite.id} className="border border-ink-200 rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate(`/project/${pid}/suites`)}>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={suite.suite_type === 'smoke' ? 'brand' : suite.suite_type === 'sanity' ? 'success' : 'neutral'}>{suite.suite_type}</Badge>
                    {suite.last_run_status && <Badge variant={statusColor as 'success' | 'danger' | 'neutral'} size="xs">{suite.last_run_status}</Badge>}
                  </div>
                  <p className="text-sm font-medium text-ink-700 mb-1">{suite.name}</p>
                  <p className="text-xs text-ink-400">~{suite.estimated_duration_min} min</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-800 mb-4">Requirements Coverage</h2>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#f2f2f0" strokeWidth="10" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="10"
                  strokeDasharray={`${requirements.length > 0 ? (coveredReqs / requirements.length) * 251.2 : 0} 251.2`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-ink-800">{requirements.length > 0 ? Math.round((coveredReqs / requirements.length) * 100) : 0}%</span>
                <span className="text-xs text-ink-400">covered</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-center text-ink-500">{coveredReqs} of {requirements.length} requirements have test coverage</p>
          {requirements.filter(r => !r.has_coverage).length > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-100">
              <p className="text-xs text-ink-400 mb-2">Uncovered:</p>
              {requirements.filter(r => !r.has_coverage).map(r => (
                <div key={r.id} className="text-xs text-danger-600 mb-1">{r.req_id} — {r.title}</div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
