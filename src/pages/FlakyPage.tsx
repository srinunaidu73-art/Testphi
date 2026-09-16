import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Lightbulb, Ban, History, Loader2 } from 'lucide-react';
import { Card, Badge, Button, RunDots } from '../components/ui';
import { fetchTestCases, fetchTestCaseVersions, updateTestCase, createTestCaseVersion, PROJECT_ID } from '../lib/api';
import type { TestCase, TestCaseVersion } from '../lib/types';

interface HealProposal {
  diagnosis: string;
  explanation: string;
  confidence: number;
  new_gherkin: string;
  reason: string;
  method: string;
}

export default function FlakyPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [versions, setVersions] = React.useState<TestCaseVersion[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showVersions, setShowVersions] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [healing, setHealing] = React.useState<string | null>(null);
  const [analyzing, setAnalyzing] = React.useState<string | null>(null);
  const [proposals, setProposals] = React.useState<Record<string, HealProposal>>({});
  const [analyzeError, setAnalyzeError] = React.useState('');

  const analyze = async (tc: TestCase) => {
    setAnalyzing(tc.id);
    setAnalyzeError('');
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/heal-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ test_case_id: tc.id }),
      });
      if (!response.ok) throw new Error(`Heal analysis failed (${response.status})`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProposals(prev => ({ ...prev, [tc.id]: data }));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleExpand = async (tc: TestCase) => {
    if (expandedId === tc.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(tc.id);
    if (!proposals[tc.id]) await analyze(tc);
  };

  const handleApproveHeal = async (tc: TestCase) => {
    const proposal = proposals[tc.id];
    if (!proposal) return;
    setHealing(tc.id);
    try {
      const newGherkin = proposal.new_gherkin;
      const vers = await fetchTestCaseVersions(tc.id);
      const maxVersion = vers.length > 0 ? Math.max(...vers.map(v => v.version)) : 0;
      await createTestCaseVersion({
        test_case_id: tc.id,
        version: maxVersion + 1,
        changed_by: 'AI Auto-Heal',
        reason: proposal.reason || `Auto-heal: ${proposal.diagnosis}`,
        gherkin: newGherkin,
      });
      await updateTestCase(tc.id, { gherkin: newGherkin, flaky_score: 0 });
      const cases = await fetchTestCases(pid);
      setTestCases(cases);
      setProposals(prev => {
        const next = { ...prev };
        delete next[tc.id];
        return next;
      });
      setExpandedId(null);
    } catch (err) {
      console.error('Failed to approve heal:', err);
    } finally {
      setHealing(null);
    }
  };

  const handleReject = (tc: TestCase) => {
    setProposals(prev => {
      const next = { ...prev };
      delete next[tc.id];
      return next;
    });
    setExpandedId(null);
  };

  const handleQuarantine = async (tc: TestCase) => {
    try {
      await updateTestCase(tc.id, { is_quarantined: true });
      const cases = await fetchTestCases(pid);
      setTestCases(cases);
    } catch (err) {
      console.error('Failed to quarantine:', err);
    }
  };

  React.useEffect(() => {
    (async () => {
      try {
        const cases = await fetchTestCases(pid);
        setTestCases(cases);
        if (cases.length > 0) {
          const vers = await fetchTestCaseVersions(cases[0].id);
          setVersions(vers);
        }
      } catch (err) {
        console.error('Failed to load flaky tests:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  if (loading) return <div className="text-center py-20 text-ink-400">Loading flaky tests...</div>;

  const flakyTests = testCases.filter(tc => tc.flaky_score > 20);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Flaky Test Monitor</h1>
        <p className="text-sm text-ink-500 mt-1">AI-powered detection and auto-healing for unreliable tests</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Flaky Tests</p><p className="text-2xl font-bold text-danger-600 mt-1">{flakyTests.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Auto-Heal Proposed</p><p className="text-2xl font-bold text-warn-600 mt-1">{flakyTests.filter(t => t.flaky_score < 50).length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Quarantined</p><p className="text-2xl font-bold text-ink-600 mt-1">{testCases.filter(t => t.is_quarantined).length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Avg Flaky Score</p><p className="text-2xl font-bold text-warn-600 mt-1">{flakyTests.length > 0 ? Math.round(flakyTests.reduce((a, t) => a + t.flaky_score, 0) / flakyTests.length) : 0}%</p></Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink-800 mb-4">Flaky Tests Leaderboard</h2>
        {flakyTests.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-8">No flaky tests detected. All tests are stable.</p>
        ) : (
          <div className="space-y-3">
            {flakyTests.map(tc => {
              const isExpanded = expandedId === tc.id;
              const proposal = proposals[tc.id];
              const isAnalyzing = analyzing === tc.id;
              return (
                <div key={tc.id} className="border border-ink-200 rounded-lg overflow-hidden">
                  <button onClick={() => handleExpand(tc)} className="flex items-center gap-4 p-4 w-full text-left hover:bg-ink-50">
                    <div className="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-danger-600">{tc.flaky_score}%</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">{tc.title}</p>
                      <p className="text-xs text-ink-400 mt-0.5">Pass/fail ratio: {(tc.recent_runs as string[]).filter(r => r === 'pass').length}/{tc.recent_runs.length} runs passed</p>
                    </div>
                    {tc.recent_runs.length > 0 && <RunDots runs={tc.recent_runs as ('pass'|'fail'|'skip')[]} />}
                    <Badge variant="danger" size="xs">Flaky</Badge>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-ink-100 pt-4">
                      {isAnalyzing && (
                        <div className="flex items-center gap-2 text-sm text-brand-600 py-4">
                          <Loader2 className="w-4 h-4 animate-spin" /> Analyzing failure history and proposing a fix...
                        </div>
                      )}
                      {!isAnalyzing && analyzeError && !proposal && (
                        <div className="p-3 bg-danger-50 rounded-lg mb-3 text-sm text-danger-700">
                          Could not analyze this test: {analyzeError}
                        </div>
                      )}
                      {!isAnalyzing && proposal && (
                        <>
                          <div className="p-3 bg-brand-50 rounded-lg mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Lightbulb className="w-4 h-4 text-brand-600" />
                              <span className="text-sm font-medium text-brand-700">AI Diagnosis</span>
                              <Badge variant="purple" size="xs">{proposal.diagnosis}</Badge>
                              <Badge variant="neutral" size="xs">Confidence: {proposal.confidence}%</Badge>
                              <Badge variant="neutral" size="xs">{proposal.method === 'ai' ? 'AI' : 'Heuristic'}</Badge>
                            </div>
                            <p className="text-xs text-ink-600">{proposal.explanation}</p>
                          </div>
                          <div className="mb-3">
                            <p className="text-sm font-medium text-ink-700 mb-2">Proposed Update (AI Auto-Heal):</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-ink-400 mb-1">Current Gherkin:</p>
                                <pre className="text-xs font-mono bg-danger-50 p-2 rounded text-ink-700 whitespace-pre-wrap">{tc.gherkin}</pre>
                              </div>
                              <div>
                                <p className="text-xs text-ink-400 mb-1">Healed Gherkin:</p>
                                <pre className="text-xs font-mono bg-success-50 p-2 rounded text-ink-700 whitespace-pre-wrap">{proposal.new_gherkin}</pre>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="success" disabled={healing === tc.id} onClick={() => handleApproveHeal(tc)}>
                              <span className="flex items-center gap-1.5">{healing === tc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {healing === tc.id ? 'Saving...' : 'Approve Update'}</span>
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => handleReject(tc)}><span className="flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Reject</span></Button>
                          </div>
                        </>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="secondary" onClick={() => handleQuarantine(tc)}><span className="flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> Quarantine</span></Button>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/project/${pid}/test-cases/${tc.id}`)}>View Test Case</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink-800 mb-2">Quarantined Tests</h2>
        <p className="text-sm text-ink-400">No tests are currently quarantined. Flaky tests can be quarantined to exclude them from suite runs until fixed.</p>
      </Card>

      <Card className="p-5">
        <button onClick={() => setShowVersions(!showVersions)} className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-ink-400" />
          <h2 className="text-base font-semibold text-ink-800">Test Version History</h2>
        </button>
        {showVersions && (
          <div className="space-y-3">
            {versions.map((v, i) => (
              <div key={v.id || i} className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold">v{v.version}</div>
                  {i < versions.length - 1 && <div className="w-px h-8 bg-ink-200 mt-1" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-ink-700">{new Date(v.created_at).toLocaleDateString()}</span>
                    <Badge variant={v.changed_by === 'AI Auto-Heal' ? 'purple' : 'neutral'} size="xs">{v.changed_by}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">{v.reason}</p>
                </div>
              </div>
            ))}
            {versions.length === 0 && <p className="text-xs text-ink-400">No version history available</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
