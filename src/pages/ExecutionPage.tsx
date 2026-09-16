import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Square, CheckCircle, XCircle, CircleSlash, Download, Bug, Monitor, Server, Zap, Globe, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button, ProgressBar, StatusDot } from '../components/ui';
import { fetchSuites, fetchTestCases, fetchTestRuns, createTestRun, updateTestRun, createDefect, fetchEnvironments, fetchSuiteMemberships, PROJECT_ID } from '../lib/api';
import type { TestSuite, TestCase, TestRun, Environment } from '../lib/types';

type RunState = 'config' | 'running' | 'results';

interface RunResult {
  key: string;
  id: string;
  title: string;
  browser: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  screenshot?: string;
}

interface RunTask {
  key: string;
  testId: string;
  title: string;
  browser: string;
}

const BROWSER_OPTIONS = [
  { id: 'chromium', label: 'Chrome', available: true },
  { id: 'edge', label: 'Edge', available: true },
  { id: 'firefox', label: 'Firefox', available: false },
  { id: 'webkit', label: 'Safari', available: false },
];

const browserLabel = (id: string): string => {
  const found = BROWSER_OPTIONS.find(b => b.id === id);
  return found ? found.label : id;
};

export default function ExecutionPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [state, setState] = React.useState<RunState>('config');
  const [suites, setSuites] = React.useState<TestSuite[]>([]);
  const [allTests, setAllTests] = React.useState<TestCase[]>([]);
  const [environments, setEnvironments] = React.useState<Environment[]>([]);
  const [runs, setRuns] = React.useState<TestRun[]>([]);
  const [selectedSuiteType, setSelectedSuiteType] = React.useState('smoke');
  const [environment, setEnvironment] = React.useState('staging');
  const [selectedBrowsers, setSelectedBrowsers] = React.useState<string[]>(['chromium']);
  const [parallelCount, setParallelCount] = React.useState(2);
  const [showBrowser, setShowBrowser] = React.useState(true);
  const [progress, setProgress] = React.useState(0);
  const [results, setResults] = React.useState<RunResult[]>([]);
  const [tasks, setTasks] = React.useState<RunTask[]>([]);
  const [runningKeys, setRunningKeys] = React.useState<Set<string>>(new Set());
  const [currentRunId, setCurrentRunId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [screenshotUrl, setScreenshotUrl] = React.useState('');
  const [exportStatus, setExportStatus] = React.useState('');
  const [runError, setRunError] = React.useState('');
  const abortRef = React.useRef(false);

  React.useEffect(() => {
    (async () => {
      try {
        const [sues, cases, rns, envs] = await Promise.all([fetchSuites(pid), fetchTestCases(pid), fetchTestRuns(pid), fetchEnvironments(pid)]);
        setSuites(sues);
        setAllTests(cases);
        setRuns(rns);
        setEnvironments(envs);
      } catch (err) {
        console.error('Failed to load execution data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const suite = suites.find(s => s.suite_type === selectedSuiteType);
  const [suiteTests, setSuiteTests] = React.useState<TestCase[]>([]);

  React.useEffect(() => {
    (async () => {
      if (!suite) { setSuiteTests([]); return; }
      try {
        const memberships = await fetchSuiteMemberships(suite.id);
        const byId = new Map(allTests.map(t => [t.id, t]));
        const members = memberships.map(m => byId.get(m.test_case_id)).filter((t): t is TestCase => !!t);
        setSuiteTests(members.length > 0 ? members : allTests);
      } catch (err) {
        console.error('Failed to load suite members:', err);
        setSuiteTests(allTests);
      }
    })();
  }, [suite?.id, allTests]);

  const getEnvUrl = (envName: string): string => {
    const env = environments.find(e => e.name === envName);
    return env?.url || '';
  };
  const toggleBrowser = (id: string) => {
    setSelectedBrowsers(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const executeRun = async (runId: string, taskList: RunTask[], envUrl: string) => {
    const total = taskList.length;
    const acc: (RunResult | null)[] = new Array(total).fill(null);
    let completedCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let cursor = 0;

    const runTask = async (task: RunTask, index: number) => {
      if (abortRef.current) return;
      setRunningKeys(prev => new Set(prev).add(task.key));
      let result: RunResult;
      try {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-tests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            run_id: runId,
            test_case_id: task.testId,
            environment_url: envUrl,
            browser: task.browser,
            capture_screenshot: showBrowser,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          result = { key: task.key, id: task.testId, title: task.title, browser: task.browser, status: 'fail', duration: 0, error: data.error || 'Test could not be run' };
        } else {
          const status = data.status === 'pass' ? 'pass' : data.status === 'skip' ? 'skip' : 'fail';
          result = {
            key: task.key,
            id: task.testId,
            title: task.title,
            browser: task.browser,
            status,
            duration: data.duration_ms || 0,
            error: data.error || undefined,
            screenshot: data.screenshot || undefined,
          };
        }
      } catch (err) {
        result = { key: task.key, id: task.testId, title: task.title, browser: task.browser, status: 'fail', duration: 0, error: err instanceof Error ? err.message : 'Unknown error' };
      }
      acc[index] = result;
      if (result.status === 'pass') passedCount++;
      else if (result.status === 'skip') skippedCount++;
      else failedCount++;
      completedCount++;
      setResults(acc.filter((x): x is RunResult => x !== null));
      setProgress(Math.round((completedCount / total) * 100));
      if (showBrowser && result.screenshot) setScreenshotUrl(result.screenshot);
      setRunningKeys(prev => {
        const next = new Set(prev);
        next.delete(task.key);
        return next;
      });
    };

    const workerCount = Math.max(1, Math.min(parallelCount, total));
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (abortRef.current) break;
        const index = cursor;
        if (index >= total) break;
        cursor++;
        await runTask(taskList[index], index);
      }
    });
    await Promise.all(workers);

    setProgress(100);
    const aborted = abortRef.current;
    await updateTestRun(runId, {
      status: aborted ? 'aborted' : 'completed',
      completed_at: new Date().toISOString(),
      total_cases: taskList.length,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      duration_sec: Math.round(acc.reduce((a, r) => a + (r ? r.duration : 0), 0) / 1000),
    }).catch(console.error);

    setState('results');
    fetchTestRuns(pid).then(setRuns).catch(console.error);
  };

  const startRun = async () => {
    setRunError('');
    if (suites.length === 0) {
      setRunError('No test suites found for this project. Generate test cases first — suites are created automatically.');
      return;
    }
    if (!suite) {
      setRunError(`No ${selectedSuiteType} suite found. Select a different suite type.`);
      return;
    }
    if (selectedBrowsers.length === 0) {
      setRunError('Select at least one browser to run tests.');
      return;
    }
    if (suiteTests.length === 0) {
      setRunError('The selected suite has no test cases. Add test cases to this suite, or generate tests first.');
      return;
    }
    const envUrl = getEnvUrl(environment);
    if (!envUrl || !/^https?:\/\//i.test(envUrl)) {
      setRunError(`No website URL configured for "${environment}". Go to Settings and set the Environment URL for this project, then run again.`);
      return;
    }
    abortRef.current = false;
    try {
      const run = await createTestRun({
        project_id: pid,
        suite_id: suite.id,
        suite_name: suite.name,
        suite_type: suite.suite_type as 'smoke' | 'sanity' | 'regression',
        status: 'running',
        environment: environment as 'dev' | 'staging' | 'prod',
        total_cases: suiteTests.length * selectedBrowsers.length,
      });
      setCurrentRunId(run.id);
      setState('running');
      setProgress(0);
      setResults([]);
      setScreenshotUrl('');
      setRunningKeys(new Set());

      const taskList: RunTask[] = suiteTests.flatMap(tc =>
        selectedBrowsers.map(b => ({ key: `${tc.id}:${b}`, testId: tc.id, title: tc.title, browser: b }))
      );
      setTasks(taskList);

      executeRun(run.id, taskList, envUrl);
    } catch (err) {
      console.error('Failed to start run:', err);
      setRunError(err instanceof Error ? err.message : 'Failed to start run');
      setState('config');
    }
  };

  const handleAbort = async () => {
    abortRef.current = true;
    if (currentRunId) {
      try {
        await updateTestRun(currentRunId, { status: 'aborted' });
      } catch (err) {
        console.error('Failed to abort:', err);
      }
    }
  };

  const handleCreateDefect = async (result: RunResult) => {
    try {
      await createDefect({
        project_id: pid,
        title: `Test failure: ${result.title} (${browserLabel(result.browser)})`,
        severity: 'high',
        status: 'open',
        test_case_title: result.title,
        run_id: currentRunId || '',
        error_log: result.error || '',
      });
      alert('Defect created');
    } catch (err) {
      console.error('Failed to create defect:', err);
    }
  };

  const handleExport = () => {
    const csv = ['Test,Browser,Status,Duration,Error'];
    results.forEach(r => {
      csv.push(`"${r.title}",${browserLabel(r.browser)},${r.status},${(r.duration / 1000).toFixed(1)}s,${r.error || ''}`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-run-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus('Exported');
    setTimeout(() => setExportStatus(''), 2000);
  };

  if (loading) return <div className="text-center py-20 text-ink-400">Loading...</div>;

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  const pendingCount = tasks.length - results.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Test Execution</h1>
        <p className="text-sm text-ink-500 mt-1">Run tests live across multiple browsers in parallel</p>
      </div>

      {state === 'config' && (
        <>
          {suites.length === 0 && (
            <Card className="p-5 border-warn-200 bg-warn-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warn-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-ink-800">No test suites yet</h2>
                  <p className="text-xs text-ink-500 mt-1">This project has no test suites. Generate test cases from the Requirements page and suites will be created automatically, or go to Test Suites to create one manually.</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate(`/project/${pid}/requirements`)}>Go to Requirements</Button>
                </div>
              </div>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Configure Run</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-2">Select Suite</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {suites.map(s => (
                    <button key={s.id} onClick={() => setSelectedSuiteType(s.suite_type)}
                      className={`p-4 border-2 rounded-lg text-left ${selectedSuiteType === s.suite_type ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={s.suite_type === 'smoke' ? 'brand' : s.suite_type === 'sanity' ? 'success' : 'neutral'} size="xs">{s.suite_type}</Badge>
                        <span className="text-xs text-ink-400">~{s.estimated_duration_min} min</span>
                      </div>
                      <p className="text-sm font-medium text-ink-700">{s.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink-700 block mb-2">Environment</label>
                <div className="grid grid-cols-3 gap-3">
                  {['dev', 'staging', 'prod'].map(env => {
                    const url = getEnvUrl(env);
                    return (
                      <button key={env} onClick={() => setEnvironment(env)}
                        className={`p-3 border-2 rounded-lg text-center ${environment === env ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'}`}>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          {env === 'prod' ? <Server className="w-4 h-4 text-ink-400" /> : <Monitor className="w-4 h-4 text-ink-400" />}
                          <span className="text-sm font-medium capitalize">{env}</span>
                        </div>
                        {url ? (
                          <p className="text-[10px] text-ink-400 truncate">{url}</p>
                        ) : (
                          <p className="text-[10px] text-warn-600">URL not set</p>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-400 mt-2">Set each environment's website URL in Settings. Tests can only run against an environment with a real URL.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-ink-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-ink-800">Browsers</h3>
                  </div>
                  <p className="text-xs text-ink-400 mb-3">Every test runs on each selected browser in parallel</p>
                  <div className="grid grid-cols-2 gap-2">
                    {BROWSER_OPTIONS.map(b => (
                      <label key={b.id}
                        className={`flex items-center gap-2 p-2.5 border rounded-lg ${!b.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${selectedBrowsers.includes(b.id) ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-ink-300'}`}>
                        <input type="checkbox" checked={selectedBrowsers.includes(b.id)} disabled={!b.available} onChange={() => toggleBrowser(b.id)} className="w-4 h-4 rounded" />
                        <span className="text-sm text-ink-700">{b.label}</span>
                        {!b.available && <span className="ml-auto text-[10px] text-ink-400">Plan</span>}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-ink-400 mt-2">Firefox and Safari need a higher Browserless plan.</p>
                </div>

                <div className="p-4 border border-ink-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-ink-800">Parallel Execution</h3>
                  </div>
                  <p className="text-xs text-ink-400 mb-3">Run multiple test/browser combinations at once</p>
                  <div className="flex items-center gap-3 mb-3">
                    <label className="text-sm text-ink-600">Concurrent tests:</label>
                    <select value={parallelCount} onChange={e => setParallelCount(Number(e.target.value))} className="px-3 py-1.5 text-sm border border-ink-200 rounded-lg">
                      <option value={1}>1 (Sequential)</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={8}>8</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showBrowser} onChange={e => setShowBrowser(e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm text-ink-700">Capture screenshots (live view)</span>
                  </label>
                </div>
              </div>

              {runError && <p className="text-sm text-danger-600">{runError}</p>}
              <Button variant="primary" onClick={startRun}><span className="flex items-center gap-2"><Play className="w-4 h-4" /> Start Run</span></Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Recent Runs</h2>
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id} className="flex items-center gap-4 p-3 border border-ink-100 rounded-lg hover:bg-ink-50">
                  <Badge variant={run.suite_type === 'smoke' ? 'brand' : run.suite_type === 'sanity' ? 'success' : 'neutral'} size="xs">{run.suite_type}</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-700">{run.suite_name}</p>
                    <p className="text-xs text-ink-400">{new Date(run.started_at).toLocaleString()} — {run.environment}</p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-success-600">{run.passed} pass</span>
                    <span className="text-danger-600">{run.failed} fail</span>
                    {run.skipped > 0 && <span className="text-ink-400">{run.skipped} skip</span>}
                  </div>
                  <span className="text-xs text-ink-400">{Math.floor(run.duration_sec / 60)}m {run.duration_sec % 60}s</span>
                </div>
              ))}
              {runs.length === 0 && <p className="text-sm text-ink-400 text-center py-4">No runs yet</p>}
            </div>
          </Card>
        </>
      )}

      {state === 'running' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-ink-800">Running: {suite?.name}</h2>
                <p className="text-xs text-ink-400 mt-1">
                  Environment: {environment} — Browsers: {selectedBrowsers.map(browserLabel).join(', ')} — {results.length} of {tasks.length} done
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={handleAbort}><span className="flex items-center gap-1.5"><Square className="w-3.5 h-3.5" /> Abort</span></Button>
            </div>
            <ProgressBar value={progress} variant="brand" height="h-3" />
            <div className="flex gap-4 mt-4 text-sm">
              <span className="text-success-600 font-medium">{passed} passed</span>
              <span className="text-danger-600 font-medium">{failed} failed</span>
              <span className="text-ink-400 font-medium">{pendingCount} pending</span>
            </div>
            <div className="mt-4 space-y-1 max-h-96 overflow-y-auto">
              {tasks.map(task => {
                const r = results.find(x => x.key === task.key);
                const running = runningKeys.has(task.key);
                const status = r ? r.status : running ? 'running' : 'pending';
                return (
                  <div key={task.key} className="flex items-center gap-3 py-1.5 text-sm">
                    <StatusDot status={status} />
                    <Badge variant="neutral" size="xs">{browserLabel(task.browser)}</Badge>
                    <span className={r ? 'text-ink-700' : running ? 'text-brand-600 font-medium' : 'text-ink-400'}>{task.title}</span>
                    {r && <span className="text-xs text-ink-400 ml-auto">{(r.duration / 1000).toFixed(1)}s</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          {showBrowser && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-ink-800">Live Browser View</h2>
              </div>
              {screenshotUrl ? (
                <div className="rounded-lg overflow-hidden border border-ink-200">
                  <img src={screenshotUrl} alt="Browser screenshot" className="w-full" />
                  <div className="p-2 bg-ink-50 text-xs text-ink-500">
                    {results[results.length - 1]?.title || 'Waiting...'}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 bg-ink-50 rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              )}
              <p className="text-xs text-ink-400 mt-2">Screenshots update as each test finishes.</p>
            </Card>
          )}
        </div>
      )}

      {state === 'results' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink-800">Run Complete</h2>
              <p className="text-xs text-ink-400 mt-1">{suite?.name} — {environment} — {selectedBrowsers.map(browserLabel).join(', ')}</p>
            </div>
            <div className="flex gap-2">
              {exportStatus && <span className="text-xs text-success-600 self-center">{exportStatus}</span>}
              <Button variant="secondary" size="sm" onClick={handleExport}><span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export</span></Button>
              <Button variant="primary" size="sm" onClick={() => setState('config')}><span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> New Run</span></Button>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-ink-50 rounded-lg mb-4">
            <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-success-500" /><span className="text-sm font-medium text-success-700">{passed} passed</span></div>
            <div className="flex items-center gap-2"><XCircle className="w-5 h-5 text-danger-500" /><span className="text-sm font-medium text-danger-700">{failed} failed</span></div>
            <div className="flex items-center gap-2"><CircleSlash className="w-5 h-5 text-ink-300" /><span className="text-sm font-medium text-ink-500">{skipped} skipped</span></div>
            <div className="ml-auto text-sm text-ink-500">Total: {results.length} results</div>
          </div>

          {failed > 0 && (
            <div className="flex items-center gap-3 p-3 bg-warn-50 border border-warn-200 rounded-lg mb-4">
              <Sparkles className="w-4 h-4 text-warn-600" />
              <p className="text-sm text-warn-700 flex-1">{failed} result(s) failed. Send them to the Flaky Test Monitor for AI diagnosis and auto-healing.</p>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/project/${pid}/flaky`)}>
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Review & Fix</span>
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {results.map(r => (
              <div key={r.key} className="border border-ink-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 hover:bg-ink-50">
                  <StatusDot status={r.status} />
                  <Badge variant="neutral" size="xs">{browserLabel(r.browser)}</Badge>
                  <span className="text-sm font-medium text-ink-700 flex-1">{r.title}</span>
                  <span className="text-xs text-ink-400">{(r.duration / 1000).toFixed(1)}s</span>
                  {r.status === 'fail' && (
                    <>
                      <Button size="sm" variant="danger" onClick={() => handleCreateDefect(r)}><span className="flex items-center gap-1"><Bug className="w-3 h-3" /> Defect</span></Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/project/${pid}/flaky`)}><span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Fix</span></Button>
                    </>
                  )}
                </div>
                {r.error && <div className="px-3 pb-3"><pre className={`text-xs font-mono p-2 rounded whitespace-pre-wrap ${r.status === 'skip' ? 'text-warn-700 bg-warn-50' : 'text-danger-600 bg-danger-50'}`}>{r.error}</pre></div>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
