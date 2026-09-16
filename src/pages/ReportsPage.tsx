import React from 'react';
import { useParams } from 'react-router-dom';
import { Download, Mail, BarChart3, TrendingUp, Bug, ShieldCheck, Flame, ExternalLink } from 'lucide-react';
import { Card, Badge, Button, Tabs, ProgressBar, MiniBars } from '../components/ui';
import { fetchTestRuns, fetchDefects, fetchTestCases, fetchRequirements, PROJECT_ID } from '../lib/api';
import type { TestRun, Defect, TestCase, Requirement } from '../lib/types';

export default function ReportsPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [activeTab, setActiveTab] = React.useState('execution');
  const [runs, setRuns] = React.useState<TestRun[]>([]);
  const [defects, setDefects] = React.useState<Defect[]>([]);
  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [rns, defs, cases, reqs] = await Promise.all([
          fetchTestRuns(pid), fetchDefects(pid), fetchTestCases(pid), fetchRequirements(pid),
        ]);
        setRuns(rns); setDefects(defs); setTestCases(cases); setRequirements(reqs);
      } catch (err) {
        console.error('Failed to load reports:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  if (loading) return <div className="text-center py-20 text-ink-400">Loading reports...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Reports & Dashboards</h1>
          <p className="text-sm text-ink-500 mt-1">Execution trends, coverage, flakiness, and defects</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => {
            const subject = encodeURIComponent(`TestPhi Report — ${new Date().toLocaleDateString()}`);
            const body = encodeURIComponent(`Pass Rate: ${runs.length > 0 ? Math.round(runs.reduce((a, r) => a + (r.passed / r.total_cases) * 100, 0) / runs.length) : 0}%\nTotal Tests: ${runs.reduce((a, r) => a + r.total_cases, 0)}\nDefects: ${defects.length} open\n\nView full report in TestPhi.`);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
          }}><span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Report</span></Button>
          <Button variant="secondary" size="sm" onClick={() => {
            const csv = ['Date,Suite,Environment,Passed,Failed,Total,PassRate,Duration_sec'];
            runs.forEach(r => {
              csv.push(`${new Date(r.started_at).toISOString()},${r.suite_name},${r.environment},${r.passed},${r.failed},${r.total_cases},${r.total_cases > 0 ? Math.round((r.passed / r.total_cases) * 100) : 0}%,${r.duration_sec}`);
            });
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `testphi-report-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}><span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export CSV</span></Button>
          <Button variant="primary" size="sm" onClick={() => window.open('https://grafana.com/docs/grafana/latest/datasources/postgres/', '_blank')}><span className="flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Open in Grafana</span></Button>
        </div>
      </div>

      <Tabs active={activeTab} onChange={setActiveTab} tabs={[
        { id: 'execution', label: 'Execution', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { id: 'coverage', label: 'Coverage', icon: <BarChart3 className="w-3.5 h-3.5" /> },
        { id: 'flaky', label: 'Flaky', icon: <Flame className="w-3.5 h-3.5" /> },
        { id: 'defects', label: 'Defects', icon: <Bug className="w-3.5 h-3.5" /> },
        { id: 'validation', label: 'Validation', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
      ]} />

      {activeTab === 'execution' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-xs text-ink-400 uppercase font-medium mb-2">Pass Rate Trend</p>
              <MiniBars values={runs.map(r => r.total_cases > 0 ? Math.round((r.passed / r.total_cases) * 100) : 0)} variant="success" />
              <p className="text-sm text-ink-700 mt-2">{runs.length > 0 ? Math.round(runs.reduce((a, r) => a + (r.passed / r.total_cases) * 100, 0) / runs.length) : 0}% average</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-ink-400 uppercase font-medium mb-2">Avg Duration</p>
              <p className="text-2xl font-bold text-ink-800">{runs.length > 0 ? Math.round(runs.reduce((a, r) => a + r.duration_sec, 0) / runs.length / 60) : 0} min</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs text-ink-400 uppercase font-medium mb-2">Total Tests Executed</p>
              <p className="text-2xl font-bold text-ink-800">{runs.reduce((a, r) => a + r.total_cases, 0)}</p>
            </Card>
          </div>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Run History</h2>
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200">
                <tr>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Date</th>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Suite</th>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Env</th>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Results</th>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Pass Rate</th>
                  <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} className="border-b border-ink-100">
                    <td className="py-2.5 text-ink-600">{new Date(run.started_at).toLocaleString()}</td>
                    <td className="py-2.5"><Badge variant={run.suite_type === 'smoke' ? 'brand' : run.suite_type === 'sanity' ? 'success' : 'neutral'} size="xs">{run.suite_type}</Badge></td>
                    <td className="py-2.5 text-ink-600">{run.environment}</td>
                    <td className="py-2.5 text-xs"><span className="text-success-600">{run.passed} pass</span> / <span className="text-danger-600">{run.failed} fail</span></td>
                    <td className="py-2.5"><div className="flex items-center gap-2"><div className="w-16"><ProgressBar value={run.total_cases > 0 ? Math.round((run.passed / run.total_cases) * 100) : 0} variant={run.passed / run.total_cases >= 0.9 ? 'success' : 'warn'} height="h-1.5" /></div><span className="text-xs text-ink-600">{run.total_cases > 0 ? Math.round((run.passed / run.total_cases) * 100) : 0}%</span></div></td>
                    <td className="py-2.5 text-ink-600">{Math.floor(run.duration_sec / 60)}m {run.duration_sec % 60}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === 'coverage' && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-800 mb-4">Requirements → Test Coverage Matrix</h2>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200">
              <tr>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Req ID</th>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Title</th>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Source</th>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Critical</th>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Test Cases</th>
                <th className="text-left py-2 text-xs font-medium text-ink-400 uppercase">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(req => {
                const linkedTests = testCases.filter(tc => tc.source_req_ids?.includes(req.id));
                return (
                  <tr key={req.id} className="border-b border-ink-100">
                    <td className="py-2.5 font-mono text-xs text-brand-600">{req.req_id}</td>
                    <td className="py-2.5 text-ink-700">{req.title}</td>
                    <td className="py-2.5"><Badge variant="neutral" size="xs">{req.source}</Badge></td>
                    <td className="py-2.5">{req.is_critical ? <Badge variant="warn" size="xs">Critical</Badge> : '—'}</td>
                    <td className="py-2.5 text-ink-600">{linkedTests.length} tests</td>
                    <td className="py-2.5">{req.has_coverage ? <Badge variant="success" size="xs">Covered</Badge> : <Badge variant="danger" size="xs">No Coverage</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'flaky' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Flaky Test Count Trend</h2>
            <MiniBars values={[4, 3, 5, 4, 6, 5, 3, 2]} variant="danger" />
            <p className="text-xs text-ink-400 mt-2">Last 8 weeks — trending down</p>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Top Flaky Tests</h2>
            {testCases.filter(tc => tc.flaky_score > 10).map(tc => (
              <div key={tc.id} className="flex items-center gap-4 py-2 border-b border-ink-100 last:border-0">
                <span className="text-sm text-ink-700 flex-1">{tc.title}</span>
                <span className="text-xs text-ink-400">{(tc.recent_runs as string[]).filter(r => r === 'pass').length}/{tc.recent_runs.length} passed</span>
                <div className="w-20"><ProgressBar value={tc.flaky_score} variant="danger" height="h-1.5" /></div>
                <span className="text-sm font-medium text-danger-600">{tc.flaky_score}%</span>
              </div>
            ))}
            {testCases.filter(tc => tc.flaky_score > 10).length === 0 && <p className="text-sm text-ink-400 text-center py-4">No flaky tests</p>}
          </Card>
        </div>
      )}

      {activeTab === 'defects' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Open</p><p className="text-2xl font-bold text-danger-600 mt-1">{defects.filter(d => d.status === 'open').length}</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">In Progress</p><p className="text-2xl font-bold text-warn-600 mt-1">{defects.filter(d => d.status === 'in_progress').length}</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Resolved</p><p className="text-2xl font-bold text-success-600 mt-1">{defects.filter(d => d.status === 'resolved').length}</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Critical</p><p className="text-2xl font-bold text-danger-600 mt-1">{defects.filter(d => d.severity === 'critical').length}</p></Card>
          </div>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Defects by Severity</h2>
            <div className="space-y-2">
              {['critical', 'high', 'medium', 'low'].map(sev => {
                const count = defects.filter(d => d.severity === sev).length;
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <span className="text-sm text-ink-600 capitalize w-20">{sev}</span>
                    <div className="flex-1"><ProgressBar value={count} max={Math.max(defects.length, 1)} variant={sev === 'critical' ? 'danger' : sev === 'high' ? 'warn' : 'brand'} /></div>
                    <span className="text-sm text-ink-700">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'validation' && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-800 mb-4">Tests with Lowest Validation Scores</h2>
          {testCases.filter(tc => tc.validation_score > 0).sort((a, b) => a.validation_score - b.validation_score).slice(0, 5).map(tc => (
            <div key={tc.id} className="flex items-center gap-3 py-2 border-b border-ink-100 last:border-0">
              <span className="text-sm text-ink-700 flex-1">{tc.title}</span>
              <span className={`text-sm font-medium ${tc.validation_score >= 8 ? 'text-success-600' : tc.validation_score >= 6 ? 'text-warn-600' : 'text-danger-600'}`}>{tc.validation_score}/10</span>
            </div>
          ))}
          {testCases.filter(tc => tc.validation_score > 0).length === 0 && <p className="text-sm text-ink-400 text-center py-4">No validated tests yet</p>}
        </Card>
      )}

      <Card className="p-5 bg-gradient-to-r from-brand-50 to-success-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-600 flex items-center justify-center"><BarChart3 className="w-6 h-6 text-white" /></div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink-800">Grafana Integration Available</h3>
            <p className="text-xs text-ink-500 mt-1">Connect Grafana to your Supabase database for real-time dashboards.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => window.open('https://supabase.com/docs/guides/database/grafana', '_blank')}><span className="flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Setup Guide</span></Button>
        </div>
      </Card>
    </div>
  );
}
