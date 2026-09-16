import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Play, GripVertical, X, Star } from 'lucide-react';
import { Card, Badge, Button, Tabs, EmptyState } from '../components/ui';
import { fetchSuites, fetchTestCases, fetchRequirements, fetchSuiteMemberships, addTestToSuite, removeTestFromSuite, updateRequirement, PROJECT_ID } from '../lib/api';
import type { TestSuite, TestCase, Requirement, SuiteMembership } from '../lib/types';

export default function SuitesPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [activeTab, setActiveTab] = React.useState('smoke');
  const [suites, setSuites] = React.useState<TestSuite[]>([]);
  const [allTests, setAllTests] = React.useState<TestCase[]>([]);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [memberships, setMemberships] = React.useState<SuiteMembership[]>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [sues, cases, reqs] = await Promise.all([fetchSuites(pid), fetchTestCases(pid), fetchRequirements(pid)]);
        setSuites(sues);
        setAllTests(cases);
        setRequirements(reqs);
      } catch (err) {
        console.error('Failed to load suites:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  React.useEffect(() => {
    (async () => {
      const suite = suites.find(s => s.suite_type === activeTab);
      if (!suite) return;
      try {
        const ms = await fetchSuiteMemberships(suite.id);
        setMemberships(ms);
      } catch (err) {
        console.error('Failed to load memberships:', err);
      }
    })();
  }, [activeTab, suites]);

  if (loading) return <div className="text-center py-20 text-ink-400">Loading suites...</div>;

  const suite = suites.find(s => s.suite_type === activeTab);
  const suiteTests = memberships.map(m => allTests.find(t => t.id === m.test_case_id)).filter(Boolean) as TestCase[];
  const availableTests = allTests.filter(tc => !memberships.some(m => m.test_case_id === tc.id));

  const handleAddTest = async (testCaseId: string) => {
    if (!suite) return;
    try {
      await addTestToSuite(suite.id, testCaseId, suiteTests.length + 1);
      const ms = await fetchSuiteMemberships(suite.id);
      setMemberships(ms);
    } catch (err) {
      console.error('Failed to add test to suite:', err);
    }
  };

  const handleRemoveTest = async (testCaseId: string) => {
    if (!suite) return;
    try {
      await removeTestFromSuite(suite.id, testCaseId);
      const ms = await fetchSuiteMemberships(suite.id);
      setMemberships(ms);
    } catch (err) {
      console.error('Failed to remove test from suite:', err);
    }
  };

  const toggleCritical = async (req: Requirement) => {
    try {
      await updateRequirement(req.id, { is_critical: !req.is_critical });
      setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_critical: !r.is_critical } : r));
    } catch (err) {
      console.error('Failed to toggle critical:', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Test Suites</h1>
          <p className="text-sm text-ink-500 mt-1">Auto-generated and manually managed test collections</p>
        </div>
        <Button variant="primary" size="sm" onClick={async () => {
          try {
            const validatedTests = allTests.filter(tc => tc.status === 'validated' || tc.status === 'approved');
            const smokeSuite = suites.find(s => s.suite_type === 'smoke');
            const regressionSuite = suites.find(s => s.suite_type === 'regression');
            if (smokeSuite) {
              const existing = await fetchSuiteMemberships(smokeSuite.id);
              const criticalTests = validatedTests.filter(tc => {
                const reqs = requirements.filter(r => tc.source_req_ids?.includes(r.id));
                return reqs.some(r => r.is_critical);
              });
              for (const t of criticalTests) {
                if (!existing.some(m => m.test_case_id === t.id)) {
                  await addTestToSuite(smokeSuite.id, t.id, existing.length + 1);
                }
              }
            }
            if (regressionSuite) {
              const existing = await fetchSuiteMemberships(regressionSuite.id);
              for (let i = 0; i < validatedTests.length; i++) {
                if (!existing.some(m => m.test_case_id === validatedTests[i].id)) {
                  await addTestToSuite(regressionSuite.id, validatedTests[i].id, existing.length + i + 1);
                }
              }
            }
            if (smokeSuite) {
              const ms = await fetchSuiteMemberships(smokeSuite.id);
              setMemberships(ms);
            }
          } catch (err) {
            console.error('Failed to re-generate suites:', err);
          }
        }}><span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Re-generate All Suites</span></Button>
      </div>

      <Tabs active={activeTab} onChange={setActiveTab} tabs={[
        { id: 'smoke', label: 'Smoke', icon: <Star className="w-3.5 h-3.5" /> },
        { id: 'sanity', label: 'Sanity' },
        { id: 'regression', label: 'Regression' },
      ]} />

      {suite && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Suite Name</p><p className="text-sm font-medium text-ink-800 mt-1">{suite.name}</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Test Count</p><p className="text-sm font-medium text-ink-800 mt-1">{suiteTests.length} tests</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Est. Duration</p><p className="text-sm font-medium text-ink-800 mt-1">~{suite.estimated_duration_min} min</p></Card>
            <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Last Run</p><div className="flex items-center gap-2 mt-1">{suite.last_run_status && <Badge variant={suite.last_run_status === 'passed' ? 'success' : suite.last_run_status === 'failed' ? 'danger' : 'neutral'} size="xs">{suite.last_run_status}</Badge>}{suite.last_run_pass_rate > 0 && <span className="text-sm text-ink-700">{suite.last_run_pass_rate}% pass</span>}</div></Card>
          </div>

          {activeTab === 'smoke' && (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-ink-800 mb-3">Critical Requirements (drive smoke suite selection)</h2>
              <div className="space-y-2">
                {requirements.map(req => (
                  <div key={req.id} className="flex items-center gap-3 p-2 border border-ink-100 rounded-lg">
                    <button onClick={() => toggleCritical(req)} className={`w-5 h-5 rounded border-2 flex items-center justify-center ${req.is_critical ? 'border-warn-500 bg-warn-500' : 'border-ink-300'}`}>
                      {req.is_critical && <Star className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-xs font-mono text-brand-600">{req.req_id}</span>
                    <span className="text-sm text-ink-700">{req.title}</span>
                    {req.is_critical && <Badge variant="warn" size="xs">Critical</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink-800">Tests in Suite ({suiteTests.length})</h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}><span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Tests</span></Button>
                <Button variant="primary" size="sm" onClick={() => navigate(`/project/${pid}/execution`)}><span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Run Suite</span></Button>
              </div>
            </div>
            {suiteTests.length === 0 ? (
              <EmptyState title="No tests in this suite" description="Add tests or re-generate the suite from validated test cases" />
            ) : (
              <div className="space-y-2">
                {suiteTests.map((tc, i) => (
                  <div key={tc.id} className="flex items-center gap-3 p-3 border border-ink-100 rounded-lg hover:bg-ink-50 group">
                    <GripVertical className="w-4 h-4 text-ink-300 cursor-grab" />
                    <span className="text-xs text-ink-400 w-6">{i + 1}</span>
                    <button onClick={() => navigate(`/project/${pid}/test-cases/${tc.id}`)} className="text-sm font-medium text-ink-800 hover:text-brand-600 text-left flex-1">{tc.title}</button>
                    <Badge variant={tc.test_type === 'ui' ? 'brand' : 'success'} size="xs">{tc.test_type.toUpperCase()}</Badge>
                    <Badge variant={tc.category === 'happy_path' ? 'success' : 'danger'} size="xs">{tc.category.replace('_', ' ')}</Badge>
                    {tc.last_run_status && <Badge variant={tc.last_run_status === 'pass' ? 'success' : 'danger'} size="xs">{tc.last_run_status}</Badge>}
                    <button onClick={() => handleRemoveTest(tc.id)} className="text-ink-300 hover:text-danger-500 opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200">
                  <h2 className="text-lg font-semibold text-ink-800">Add Tests to {suite.name}</h2>
                  <button onClick={() => setShowAddModal(false)} className="text-ink-400 hover:text-ink-700 text-xl">&times;</button>
                </div>
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                  {availableTests.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-8">All test cases are already in this suite</p>
                  ) : (
                    <div className="space-y-2">
                      {availableTests.map(tc => (
                        <div key={tc.id} className="flex items-center gap-3 p-2 border border-ink-100 rounded-lg hover:bg-ink-50">
                          <span className="text-sm text-ink-700 flex-1">{tc.title}</span>
                          <Badge variant={tc.test_type === 'ui' ? 'brand' : 'success'} size="xs">{tc.test_type.toUpperCase()}</Badge>
                          <Button size="sm" variant="secondary" onClick={() => handleAddTest(tc.id)}>Add</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end px-5 py-3 border-t border-ink-200">
                  <Button variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>Done</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
