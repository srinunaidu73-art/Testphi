import React from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Loader2, Check, Trash2, ClipboardList, ArrowRight } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { fetchRequirements, fetchTestPlans, updateTestPlan, deleteTestPlan, PROJECT_ID } from '../lib/api';
import type { Requirement, TestPlan } from '../lib/types';

const priorityVariant = (p: string) => (p === 'high' ? 'danger' : p === 'medium' ? 'warn' : 'neutral') as 'danger' | 'warn' | 'neutral';
const suiteVariant = (s: string) => (s === 'smoke' ? 'brand' : s === 'sanity' ? 'success' : 'neutral') as 'brand' | 'success' | 'neutral';
const categoryVariant = (c: string) => (c === 'happy_path' ? 'success' : c === 'negative' ? 'danger' : 'warn') as 'success' | 'danger' | 'warn';

export default function PlannerPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [plans, setPlans] = React.useState<TestPlan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = async () => {
    try {
      const [reqs, pl] = await Promise.all([fetchRequirements(pid), fetchTestPlans(pid)]);
      setRequirements(reqs);
      setPlans(pl);
    } catch (err) {
      console.error('Failed to load planner data:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, [pid]);

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus('Building a prioritized test plan from your requirements...');
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plan-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ project_id: pid }),
      });
      if (!response.ok) throw new Error(`Planning failed (${response.status})`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setStatus(`Plan created with ${data.item_count} scenarios (${data.method === 'ai' ? 'AI' : 'heuristic'}).`);
      await load();
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (plan: TestPlan) => {
    try {
      await updateTestPlan(plan.id, { status: 'approved' });
      await load();
    } catch (err) {
      console.error('Failed to approve plan:', err);
    }
  };

  const handleDelete = async (plan: TestPlan) => {
    try {
      await deleteTestPlan(plan.id);
      await load();
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  if (loading) return <div className="text-center py-20 text-ink-400">Loading planner...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Test Planner</h1>
          <p className="text-sm text-ink-500 mt-1">Turn requirements into a prioritized, suite-ready test plan</p>
        </div>
        <Button variant="primary" disabled={generating || requirements.length === 0} onClick={handleGenerate}>
          <span className="flex items-center gap-1.5">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Planning...' : 'Generate Plan'}
          </span>
        </Button>
      </div>

      {status && (
        <div className={`p-3 rounded-lg text-sm ${status.startsWith('Error') ? 'bg-danger-50 text-danger-700' : 'bg-brand-50 text-brand-700'}`}>
          {status}
        </div>
      )}

      {requirements.length === 0 && (
        <Card className="p-8 text-center">
          <ClipboardList className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <p className="text-sm text-ink-500">No requirements yet. Import or add requirements first, then generate a plan.</p>
        </Card>
      )}

      <div className="space-y-4">
        {plans.map(plan => {
          const expanded = expandedId === plan.id;
          return (
            <Card key={plan.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-ink-800">{plan.name}</h2>
                    <Badge variant={plan.status === 'approved' ? 'success' : 'neutral'} size="xs">{plan.status}</Badge>
                    <Badge variant="neutral" size="xs">{plan.items.length} scenarios</Badge>
                  </div>
                  {plan.summary && <p className="text-sm text-ink-500">{plan.summary}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : plan.id)}>
                    {expanded ? 'Hide' : 'View'} Scenarios
                  </Button>
                  {plan.status !== 'approved' && (
                    <Button size="sm" variant="success" onClick={() => handleApprove(plan)}>
                      <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Approve</span>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(plan)}>
                    <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="mt-4 border-t border-ink-100 pt-4 space-y-2">
                  {plan.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg hover:bg-ink-50">
                      <div className="flex flex-col gap-1 flex-shrink-0 w-28">
                        <Badge variant={priorityVariant(item.priority)} size="xs">{item.priority}</Badge>
                        <Badge variant={suiteVariant(item.suite)} size="xs">{item.suite}</Badge>
                        <Badge variant={categoryVariant(item.category)} size="xs">{item.category.replace('_', ' ')}</Badge>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink-800">{item.title}</p>
                        {item.description && <p className="text-xs text-ink-500 mt-0.5">{item.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {plans.length === 0 && requirements.length > 0 && (
        <Card className="p-8 text-center">
          <Sparkles className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <p className="text-sm text-ink-500 mb-3">Ready to turn {requirements.length} requirement(s) into a test plan.</p>
          <Button variant="primary" onClick={handleGenerate} disabled={generating}>
            <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Generate Plan</span>
          </Button>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight className="w-4 h-4 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">What happens next</h2>
        </div>
        <p className="text-sm text-ink-500">
          Approved plans guide test generation. Each scenario is turned into Gherkin test cases, assigned to a suite (smoke, sanity, or regression), and prioritized so the most critical paths run first.
        </p>
      </Card>
    </div>
  );
}
