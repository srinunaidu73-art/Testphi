import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Search, Globe, Code, FlaskConical } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { fetchProjects, createProject, fetchTestCases, fetchTestRuns } from '../lib/api';
import type { Project, TestCase, TestRun } from '../lib/types';

export default function LandingPage() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [showNew, setShowNew] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectMeta, setProjectMeta] = React.useState<Record<string, { testCount: number; lastRunStatus: string | null }>>({});
  const [loading, setLoading] = React.useState(true);
  const [newName, setNewName] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');
  const [newType, setNewType] = React.useState('ui');

  React.useEffect(() => {
    (async () => {
      try {
        const projs = await fetchProjects();
        setProjects(projs);
        const meta: Record<string, { testCount: number; lastRunStatus: string | null }> = {};
        for (const p of projs) {
          const [cases, runs] = await Promise.all([fetchTestCases(p.id), fetchTestRuns(p.id)]);
          const lastRun = runs[0];
          meta[p.id] = {
            testCount: cases.length,
            lastRunStatus: lastRun ? (lastRun.passed === lastRun.total_cases ? 'passed' : 'failed') : null,
          };
        }
        setProjectMeta(meta);
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async () => {
    try {
      const project = await createProject(newName || 'Untitled Project', newDesc, newType);
      setShowNew(false);
      navigate(`/project/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const typeIcon: Record<string, React.ReactNode> = {
    ui: <Globe className="w-5 h-5" />,
    api: <Code className="w-5 h-5" />,
    mobile: <FlaskConical className="w-5 h-5" />,
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="bg-ink-900 text-white px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">TestPhi</h1>
            <p className="text-xs text-ink-400">AI Test Generation & Validation Platform</p>
          </div>
        </div>
        <Button variant="primary" onClick={() => setShowNew(true)}>
          <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> New Project</span>
        </Button>
      </header>

      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-ink-800">Your Projects</h2>
          <p className="text-sm text-ink-500 mt-1">Select a project to view its dashboard, test cases, and execution results</p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-ink-400">Loading projects...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(project => {
              const meta = projectMeta[project.id];
              const status = meta?.lastRunStatus;
              const statusColor = status === 'passed' ? 'success' : status === 'failed' ? 'danger' : 'neutral';
              return (
                <Card key={project.id} className="p-5" onClick={() => navigate(`/project/${project.id}`)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
                        {typeIcon[project.test_type]}
                      </div>
                      <Badge variant={project.test_type === 'ui' ? 'brand' : 'success'}>{project.test_type.toUpperCase()}</Badge>
                    </div>
                    {status && (
                      <Badge variant={statusColor as 'success' | 'danger' | 'neutral'}>
                        {status === 'passed' ? 'Last run passed' : 'Last run failed'}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-ink-800 mb-1">{project.name}</h3>
                  <p className="text-sm text-ink-500 line-clamp-2 mb-4">{project.description}</p>
                  <div className="flex items-center justify-between text-xs text-ink-400">
                    <span>{meta?.testCount ?? 0} test cases</span>
                    <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                  </div>
                </Card>
              );
            })}

            <button
              onClick={() => setShowNew(true)}
              className="border-2 border-dashed border-ink-300 rounded-xl p-5 text-center hover:border-brand-400 hover:bg-brand-50 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-ink-100 group-hover:bg-brand-100 flex items-center justify-center mx-auto mb-3 transition-colors">
                <Plus className="w-6 h-6 text-ink-400 group-hover:text-brand-600" />
              </div>
              <p className="text-sm font-medium text-ink-600 group-hover:text-brand-600">Create New Project</p>
            </button>
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200">
              <h2 className="text-lg font-semibold text-ink-800">Create New Project</h2>
              <button onClick={() => setShowNew(false)} className="text-ink-400 hover:text-ink-700 text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-1.5">Project Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="My App Tests" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-1.5">Description</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this project test?" rows={3} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-1.5">Test Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setNewType('ui')} className={`border rounded-lg py-2.5 text-sm font-medium ${newType === 'ui' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'}`}>UI (Web)</button>
                  <button onClick={() => setNewType('api')} className={`border rounded-lg py-2.5 text-sm font-medium ${newType === 'api' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'}`}>API</button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleCreate}>Create</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
