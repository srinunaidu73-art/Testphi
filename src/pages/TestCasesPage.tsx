import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Plus, FlaskConical, Loader2 } from 'lucide-react';
import { Card, Badge, Button, RunDots, EmptyState } from '../components/ui';
import { fetchTestCases, fetchRequirements, fetchSuites, addTestToSuite, updateTestCase, fetchSuiteMemberships, PROJECT_ID } from '../lib/api';
import type { TestCase, Requirement, TestSuite } from '../lib/types';

export default function TestCasesPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [search, setSearch] = React.useState('');
  const [filterType, setFilterType] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterCategory, setFilterCategory] = React.useState('all');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [testCases, setTestCases] = React.useState<TestCase[]>([]);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [suites, setSuites] = React.useState<TestSuite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [bulkAction, setBulkAction] = React.useState('');
  const [bulkStatus, setBulkStatus] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const [cases, reqs, sues] = await Promise.all([fetchTestCases(pid), fetchRequirements(pid), fetchSuites(pid)]);
        setTestCases(cases);
        setRequirements(reqs);
        setSuites(sues);
      } catch (err) {
        console.error('Failed to load test cases:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const reqMap = React.useMemo(() => {
    const m: Record<string, Requirement> = {};
    requirements.forEach(r => { m[r.id] = r; });
    return m;
  }, [requirements]);

  const filtered = testCases.filter(tc => {
    if (search && !tc.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && tc.test_type !== filterType) return false;
    if (filterStatus !== 'all' && tc.status !== filterStatus) return false;
    if (filterCategory !== 'all' && tc.category !== filterCategory) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleGenerate = () => {
    navigate(`/project/${pid}/requirements`);
  };

  const handleBulkValidate = async () => {
    setBulkAction('validating');
    setBulkStatus(`Validating ${selected.length} test cases...`);
    try {
      for (const id of selected) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-tests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ test_case_id: id }),
        });
      }
      const cases = await fetchTestCases(pid);
      setTestCases(cases);
      setBulkStatus(`Validated ${selected.length} test cases`);
      setSelected([]);
      setTimeout(() => setBulkStatus(''), 3000);
    } catch (err) {
      setBulkStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setBulkAction('');
    }
  };

  const handleBulkApprove = async () => {
    setBulkAction('approving');
    setBulkStatus(`Approving ${selected.length} test cases...`);
    try {
      for (const id of selected) {
        await updateTestCase(id, { status: 'approved' });
      }
      const cases = await fetchTestCases(pid);
      setTestCases(cases);
      setBulkStatus(`Approved ${selected.length} test cases`);
      setSelected([]);
      setTimeout(() => setBulkStatus(''), 3000);
    } catch (err) {
      setBulkStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setBulkAction('');
    }
  };

  const handleAddToSuite = async (suiteId: string) => {
    setBulkAction('adding');
    setBulkStatus(`Adding ${selected.length} tests to suite...`);
    try {
      const ms = await fetchSuiteMemberships(suiteId);
      const nextOrder = ms.length;
      for (let i = 0; i < selected.length; i++) {
        await addTestToSuite(suiteId, selected[i], nextOrder + i + 1);
      }
      setBulkStatus(`Added ${selected.length} tests to suite`);
      setSelected([]);
      setTimeout(() => setBulkStatus(''), 3000);
    } catch (err) {
      setBulkStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setBulkAction('');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Test Cases</h1>
          <p className="text-sm text-ink-500 mt-1">{testCases.length} test cases — {testCases.filter(t => t.status === 'validated' || t.status === 'approved').length} validated</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleGenerate}>
          <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Generate Tests</span>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input type="text" placeholder="Search test cases..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 text-sm border border-ink-200 rounded-lg">
            <option value="all">All Types</option>
            <option value="ui">UI</option>
            <option value="api">API</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 text-sm border border-ink-200 rounded-lg">
            <option value="all">All Categories</option>
            <option value="happy_path">Happy Path</option>
            <option value="negative">Negative</option>
            <option value="boundary">Boundary</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-ink-200 rounded-lg">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="validated">Validated</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-100">
            <span className="text-xs text-ink-500">{selected.length} selected</span>
            {bulkStatus && <span className={`text-xs ${bulkStatus.startsWith('Error') ? 'text-danger-600' : 'text-success-600'}`}>{bulkStatus}</span>}
            <Button size="sm" variant="secondary" disabled={!!bulkAction} onClick={handleBulkValidate}>
              <span className="flex items-center gap-1">{bulkAction === 'validating' && <Loader2 className="w-3 h-3 animate-spin" />} Validate</span>
            </Button>
            <Button size="sm" variant="success" disabled={!!bulkAction} onClick={handleBulkApprove}>
              <span className="flex items-center gap-1">{bulkAction === 'approving' && <Loader2 className="w-3 h-3 animate-spin" />} Approve</span>
            </Button>
            <select
              value=""
              onChange={e => { if (e.target.value) handleAddToSuite(e.target.value); }}
              disabled={!!bulkAction}
              className="px-3 py-1.5 text-xs border border-ink-200 rounded-lg"
            >
              <option value="">Add to Suite...</option>
              {suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <p className="text-sm text-ink-400 text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FlaskConical className="w-12 h-12" />} title="No test cases found" description="Try adjusting your filters or generate new test cases from requirements" />
        ) : (
          <table className="w-full">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase w-8">
                  <input type="checkbox" className="rounded" onChange={e => setSelected(e.target.checked ? filtered.map(t => t.id) : [])} />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Test Case</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Score</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 uppercase">Recent Runs</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map(tc => (
                <tr key={tc.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(tc.id)} onChange={() => toggleSelect(tc.id)} className="rounded" /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/project/${pid}/test-cases/${tc.id}`)} className="text-sm font-medium text-ink-800 hover:text-brand-600 text-left">{tc.title}</button>
                    <div className="text-xs text-ink-400 mt-0.5">
                      {tc.source_req_ids.map(id => reqMap[id]?.req_id || id.slice(0, 8)).join(', ')}
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge variant={tc.test_type === 'ui' ? 'brand' : 'success'} size="xs">{tc.test_type.toUpperCase()}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={tc.category === 'happy_path' ? 'success' : tc.category === 'negative' ? 'danger' : 'warn'} size="xs">{tc.category.replace('_', ' ')}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={tc.status === 'approved' ? 'success' : tc.status === 'validated' ? 'brand' : tc.status === 'rejected' ? 'danger' : 'neutral'} size="xs">{tc.status}</Badge></td>
                  <td className="px-4 py-3">
                    {tc.validation_score > 0 ? (
                      <span className={`text-sm font-medium ${tc.validation_score >= 8 ? 'text-success-600' : tc.validation_score >= 6 ? 'text-warn-600' : 'text-danger-600'}`}>{tc.validation_score}/10</span>
                    ) : <span className="text-xs text-ink-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {tc.recent_runs && tc.recent_runs.length > 0 ? <RunDots runs={tc.recent_runs as ('pass'|'fail'|'skip')[]} /> : <span className="text-xs text-ink-400">No runs</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate(`/project/${pid}/test-cases/${tc.id}`)} className="text-xs text-brand-600 hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
