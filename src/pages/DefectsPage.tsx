import React from 'react';
import { useParams } from 'react-router-dom';
import { Bug, Filter, ExternalLink } from 'lucide-react';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { fetchDefects, updateDefect, PROJECT_ID } from '../lib/api';
import type { Defect } from '../lib/types';

export default function DefectsPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [defects, setDefects] = React.useState<Defect[]>([]);
  const [filterSeverity, setFilterSeverity] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const defs = await fetchDefects(pid);
        setDefects(defs);
      } catch (err) {
        console.error('Failed to load defects:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const filtered = defects.filter(d => {
    if (filterSeverity !== 'all' && d.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    return true;
  });

  const severityVariant: Record<string, 'danger' | 'warn' | 'brand' | 'neutral'> = {
    critical: 'danger', high: 'danger', medium: 'warn', low: 'neutral',
  };
  const statusVariant: Record<string, 'danger' | 'warn' | 'success' | 'neutral'> = {
    open: 'danger', in_progress: 'warn', resolved: 'success', closed: 'neutral',
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateDefect(id, { status: status as Defect['status'] });
      setDefects(prev => prev.map(d => d.id === id ? { ...d, status: status as Defect['status'] } : d));
    } catch (err) {
      console.error('Failed to update defect:', err);
    }
  };

  if (loading) return <div className="text-center py-20 text-ink-400">Loading defects...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Defects</h1>
        <p className="text-sm text-ink-500 mt-1">Bugs discovered during test execution</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Total Defects</p><p className="text-2xl font-bold text-ink-800 mt-1">{defects.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Open</p><p className="text-2xl font-bold text-danger-600 mt-1">{defects.filter(d => d.status === 'open').length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Critical</p><p className="text-2xl font-bold text-danger-600 mt-1">{defects.filter(d => d.severity === 'critical').length}</p></Card>
        <Card className="p-4"><p className="text-xs text-ink-400 uppercase font-medium">Resolved</p><p className="text-2xl font-bold text-success-600 mt-1">{defects.filter(d => d.status === 'resolved').length}</p></Card>
      </div>

      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-ink-400" />
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="px-3 py-2 text-sm border border-ink-200 rounded-lg">
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-ink-200 rounded-lg">
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <Card className="p-5">
        {filtered.length === 0 ? (
          <EmptyState icon={<Bug className="w-12 h-12" />} title="No defects found" description="No bugs match your current filters" />
        ) : (
          <div className="space-y-3">
            {filtered.map(defect => (
              <div key={defect.id} className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg hover:bg-ink-50">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${defect.severity === 'critical' || defect.severity === 'high' ? 'bg-danger-100' : defect.severity === 'medium' ? 'bg-warn-100' : 'bg-ink-100'}`}>
                    <Bug className={`w-4 h-4 ${defect.severity === 'critical' || defect.severity === 'high' ? 'text-danger-600' : defect.severity === 'medium' ? 'text-warn-600' : 'text-ink-400'}`} />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink-800">{defect.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={severityVariant[defect.severity]} size="xs">{defect.severity}</Badge>
                    <select value={defect.status} onChange={e => handleStatusChange(defect.id, e.target.value)} className="text-xs border border-ink-200 rounded px-1.5 py-0.5">
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                    <span className="text-xs text-ink-400">Found in: {defect.test_case_title}</span>
                    <span className="text-xs text-ink-400">{new Date(defect.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => {
                  const subject = encodeURIComponent(`Defect: ${defect.title}`);
                  const body = encodeURIComponent(`Severity: ${defect.severity}\nStatus: ${defect.status}\nTest: ${defect.test_case_title}\n\n${defect.error_log || ''}`);
                  window.location.href = `mailto:?subject=${subject}&body=${body}`;
                }}><span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Sync to Jira</span></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
