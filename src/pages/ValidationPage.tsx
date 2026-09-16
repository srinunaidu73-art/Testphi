import React from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lightbulb, Loader2 } from 'lucide-react';
import { Card, Badge, Button, ResultIcon } from '../components/ui';
import { fetchTestCases, fetchRequirements, fetchValidationResults, PROJECT_ID } from '../lib/api';
import { validationCheckDefs } from '../lib/types';
import type { TestCase, Requirement, ValidationCheck } from '../lib/types';

export default function ValidationPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [allChecks, setAllChecks] = React.useState<ValidationCheck[]>([]);
  const [expandedCheck, setExpandedCheck] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState<'all' | 'fail' | 'warn'>('all');
  const [loading, setLoading] = React.useState(true);
  const [fixingCheck, setFixingCheck] = React.useState<number | null>(null);
  const [fixStatus, setFixStatus] = React.useState('');
  const [rerunning, setRerunning] = React.useState(false);
  const [allRunResults, setAllRunResults] = React.useState<Record<string, ValidationCheck[]>>({});

  React.useEffect(() => {
    (async () => {
      try {
        const [cases, reqs] = await Promise.all([fetchTestCases(pid), fetchRequirements(pid)]);
        setTestCases(cases);
        setRequirements(reqs);
        const validatedCases = cases.filter(c => c.status === 'validated' || c.status === 'approved');
        const checksPerCase = await Promise.all(validatedCases.map(c => fetchValidationResults(c.id)));
        const flat = checksPerCase.flat();
        setAllChecks(flat);
        const byCase: Record<string, ValidationCheck[]> = {};
        validatedCases.forEach((c, i) => { byCase[c.id] = checksPerCase[i]; });
        setAllRunResults(byCase);
      } catch (err) {
        console.error('Failed to load validation:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  if (loading) return <div className="text-center py-20 text-ink-400">Loading validation results...</div>;

  // Aggregate checks across all test cases — pick worst result per check number
  const aggregatedChecks: { check_number: number; check_name: string; tier: number; description: string; result: 'pass' | 'fail' | 'warn'; summary: string; ai_analysis?: string }[] = validationCheckDefs.map(def => {
    const matching = allChecks.filter(c => c.check_number === def.check_number);
    if (matching.length === 0) return { check_number: def.check_number, check_name: def.check_name, tier: def.tier, description: def.description, result: 'pass' as const, summary: 'No validation data yet' };
    const hasFail = matching.some(c => c.result === 'fail');
    const hasWarn = matching.some(c => c.result === 'warn');
    const result: 'pass' | 'fail' | 'warn' = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';
    const summary = hasFail ? `${matching.filter(c => c.result === 'fail').length} test(s) failed this check` : hasWarn ? `${matching.filter(c => c.result === 'warn').length} test(s) have warnings` : 'All tests passed';
    const aiAnalysis = matching.find(c => c.ai_analysis)?.ai_analysis;
    return { check_number: def.check_number, check_name: def.check_name, tier: def.tier, description: def.description, result, summary, ai_analysis: aiAnalysis };
  });

  const passCount = aggregatedChecks.filter(c => c.result === 'pass').length;
  const failCount = aggregatedChecks.filter(c => c.result === 'fail').length;
  const warnCount = aggregatedChecks.filter(c => c.result === 'warn').length;

  const checks = aggregatedChecks.filter(c => {
    if (filter === 'fail') return c.result === 'fail';
    if (filter === 'warn') return c.result === 'warn';
    return true;
  });

  const validatedTests = testCases.filter(tc => tc.status === 'validated' || tc.status === 'approved');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Validation Results</h1>
        <p className="text-sm text-ink-500 mt-1">10-check validation across 3 tiers of AI analysis</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#f2f2f0" strokeWidth="8" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#22c55e" strokeWidth="8" strokeDasharray={`${(passCount / 10) * 251.2} 251.2`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-bold text-ink-800">{passCount}/10</span></div>
          </div>
          <div>
            <p className="text-xs text-ink-400 uppercase font-medium">Overall Score</p>
            <p className="text-sm text-ink-700 mt-1">{passCount} passed, {failCount} failed, {warnCount} warnings</p>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-ink-400 uppercase font-medium">Tier 1 — Basic</p>
          <p className="text-sm text-ink-700 mt-2">Checks 1-4</p>
          <div className="flex gap-1.5 mt-2">
            <Badge variant="success" size="xs">{aggregatedChecks.slice(0, 4).filter(c => c.result === 'pass').length} pass</Badge>
            {failCount > 0 && <Badge variant="danger" size="xs">{aggregatedChecks.slice(0, 4).filter(c => c.result === 'fail').length} fail</Badge>}
            <Badge variant="warn" size="xs">{aggregatedChecks.slice(0, 4).filter(c => c.result === 'warn').length} warn</Badge>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-ink-400 uppercase font-medium">Tier 2 — AI Semantic</p>
          <p className="text-sm text-ink-700 mt-2">Checks 5-7</p>
          <div className="flex gap-1.5 mt-2">
            <Badge variant="success" size="xs">{aggregatedChecks.slice(4, 7).filter(c => c.result === 'pass').length} pass</Badge>
            {failCount > 0 && <Badge variant="danger" size="xs">{aggregatedChecks.slice(4, 7).filter(c => c.result === 'fail').length} fail</Badge>}
            <Badge variant="warn" size="xs">{aggregatedChecks.slice(4, 7).filter(c => c.result === 'warn').length} warn</Badge>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-ink-400 uppercase font-medium">Tier 3 — Deep AI</p>
          <p className="text-sm text-ink-700 mt-2">Checks 8-10</p>
          <div className="flex gap-1.5 mt-2">
            <Badge variant="success" size="xs">{aggregatedChecks.slice(7, 10).filter(c => c.result === 'pass').length} pass</Badge>
            <Badge variant="warn" size="xs">{aggregatedChecks.slice(7, 10).filter(c => c.result === 'warn').length} warn</Badge>
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>All ({aggregatedChecks.length})</Button>
        <Button size="sm" variant={filter === 'fail' ? 'danger' : 'secondary'} onClick={() => setFilter('fail')}>Failed ({failCount})</Button>
        <Button size="sm" variant={filter === 'warn' ? 'secondary' : 'secondary'} onClick={() => setFilter('warn')}>Warnings ({warnCount})</Button>
      </div>

      <div className="space-y-2">
        {checks.map(check => {
          const def = validationCheckDefs.find(d => d.check_number === check.check_number);
          const isExpanded = expandedCheck === check.check_number;
          return (
            <Card key={check.check_number}>
              <button onClick={() => setExpandedCheck(isExpanded ? null : check.check_number)} className="flex items-start gap-3 p-4 w-full text-left hover:bg-ink-50">
                <div className="flex-shrink-0 mt-0.5"><ResultIcon result={check.result} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-400">#{check.check_number}</span>
                    <span className="text-sm font-semibold text-ink-800">{check.check_name}</span>
                    <Badge variant={check.tier === 1 ? 'neutral' : check.tier === 2 ? 'brand' : 'purple'} size="xs">Tier {check.tier}</Badge>
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{check.summary}</p>
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-ink-400 mt-1" /> : <ChevronRight className="w-4 h-4 text-ink-400 mt-1" />}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-ink-100 pt-3">
                  {def && <p className="text-xs text-ink-400 mb-3">{def.description}</p>}
                  {check.ai_analysis && (
                    <div className="p-3 bg-brand-50 rounded-lg mb-3">
                      <p className="text-xs text-ink-600"><span className="font-medium text-brand-700">AI Analysis: </span>{check.ai_analysis}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={fixingCheck === check.check_number} onClick={async () => {
                      setFixingCheck(check.check_number);
                      setFixStatus('');
                      try {
                        const failedTests = testCases.filter(tc => {
                          const tcChecks = allRunResults[tc.id] || [];
                          const tcCheck = tcChecks.find(c => c.check_number === check.check_number);
                          return tcCheck && (tcCheck.result === 'fail' || tcCheck.result === 'warn');
                        });
                        for (const tc of failedTests) {
                          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-tests`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
                            body: JSON.stringify({ test_case_id: tc.id }),
                          });
                        }
                        setFixStatus(`Re-validated ${failedTests.length} test(s)`);
                        const refreshedChecks = await Promise.all(testCases.filter(c => c.status === 'validated' || c.status === 'approved').map(c => fetchValidationResults(c.id)));
                        setAllChecks(refreshedChecks.flat());
                        const byCase2: Record<string, ValidationCheck[]> = {};
                        testCases.filter(c => c.status === 'validated' || c.status === 'approved').forEach((c, i) => { byCase2[c.id] = refreshedChecks[i]; });
                        setAllRunResults(byCase2);
                      } catch (err) {
                        setFixStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
                      } finally {
                        setFixingCheck(null);
                        setTimeout(() => setFixStatus(''), 4000);
                      }
                    }}><span className="flex items-center gap-1.5">{fixingCheck === check.check_number ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />} Apply AI Fix</span></Button>
                    <Button size="sm" variant="secondary" disabled={rerunning} onClick={async () => {
                      setRerunning(true);
                      try {
                        for (const tc of testCases.filter(c => c.status === 'validated' || c.status === 'approved')) {
                          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-tests`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
                            body: JSON.stringify({ test_case_id: tc.id }),
                          });
                        }
                        const refreshedChecks = await Promise.all(testCases.filter(c => c.status === 'validated' || c.status === 'approved').map(c => fetchValidationResults(c.id)));
                        setAllChecks(refreshedChecks.flat());
                        const byCase2: Record<string, ValidationCheck[]> = {};
                        testCases.filter(c => c.status === 'validated' || c.status === 'approved').forEach((c, i) => { byCase2[c.id] = refreshedChecks[i]; });
                        setAllRunResults(byCase2);
                      } catch (err) {
                        console.error('Re-run failed:', err);
                      } finally {
                        setRerunning(false);
                      }
                    }}>{rerunning ? 'Re-running...' : 'Re-run Check'}</Button>
                  </div>
                  {fixStatus && fixingCheck === check.check_number && <p className="text-xs text-ink-500 mt-2">{fixStatus}</p>}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-5 overflow-x-auto">
        <h2 className="text-base font-semibold text-ink-800 mb-4">Per-Test Validation Matrix</h2>
        <table className="w-full text-xs">
          <thead className="border-b border-ink-200">
            <tr>
              <th className="text-left py-2 pr-3 font-medium text-ink-400">Test Case</th>
              {validationCheckDefs.map(d => <th key={d.check_number} className="text-center py-2 px-1 font-medium text-ink-400" title={d.check_name}>#{d.check_number}</th>)}
              <th className="text-center py-2 pl-3 font-medium text-ink-400">Score</th>
            </tr>
          </thead>
          <tbody>
            {validatedTests.map(tc => (
              <tr key={tc.id} className="border-b border-ink-100">
                <td className="py-2 pr-3 text-sm text-ink-700 max-w-[200px] truncate">{tc.title}</td>
                {validationCheckDefs.map(def => {
                  const tcChecks = allRunResults[tc.id] || [];
                  const tcCheck = tcChecks.find(c => c.check_number === def.check_number);
                  if (!tcCheck) return <td key={def.check_number} className="text-center py-2 px-1"><span className="text-ink-300">—</span></td>;
                  const color = tcCheck.result === 'pass' ? 'text-success-600' : tcCheck.result === 'fail' ? 'text-danger-600' : 'text-warn-600';
                  const symbol = tcCheck.result === 'pass' ? '\u2713' : tcCheck.result === 'fail' ? '\u2717' : '!';
                  return <td key={def.check_number} className={`text-center py-2 px-1 ${color}`} title={tcCheck.summary}><span className="font-medium">{symbol}</span></td>;
                })}
                <td className="text-center py-2 pl-3"><span className={`font-medium ${tc.validation_score >= 8 ? 'text-success-600' : tc.validation_score >= 6 ? 'text-warn-600' : 'text-danger-600'}`}>{tc.validation_score}/10</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
