import React from 'react';
import { useParams } from 'react-router-dom';
import { Upload, MessageSquare, Smartphone, ArrowRight, Check, X, Edit, Plus, Trash2, Loader2, Globe } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { fetchRequirements, createRequirement, updateRequirement, deleteRequirement, PROJECT_ID } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Requirement } from '../lib/types';
import { useNavigate } from 'react-router-dom';

const sources = [
  { id: 'jira', label: 'Jira', icon: '📋', description: 'Pull stories and issues from Jira' },
  { id: 'document', label: 'Document', icon: '📄', description: 'Upload PDF, Word, or Markdown' },
  { id: 'url', label: 'Website URL', icon: '🌐', description: 'Crawl and map a live website' },
  { id: 'api_spec', label: 'API Spec', icon: '🔌', description: 'OpenAPI/Swagger or Postman' },
  { id: 'mobile', label: 'Mobile App', icon: '📱', description: 'Upload APK or IPA file' },
  { id: 'manual', label: 'Natural Language', icon: '💬', description: 'Type what to test in plain English' },
];

export default function RequirementsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = projectId || PROJECT_ID;

  const [activeSource, setActiveSource] = React.useState<string | null>(null);
  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');
  const [editCritical, setEditCritical] = React.useState(false);
  const [naturalLangText, setNaturalLangText] = React.useState('');
  const [newReqTitle, setNewReqTitle] = React.useState('');
  const [newReqDesc, setNewReqDesc] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [genStatus, setGenStatus] = React.useState('');
  const [crawlUrl, setCrawlUrl] = React.useState('');
  const [crawling, setCrawling] = React.useState(false);
  const [crawlStatus, setCrawlStatus] = React.useState('');
  const [crawlResults, setCrawlResults] = React.useState<{ url: string; title: string; category: string; status: number }[] | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [parseStatus, setParseStatus] = React.useState('');

  const handleCrawl = async () => {
    if (!crawlUrl.trim()) return;
    setCrawling(true);
    setCrawlStatus('Crawling website — this may take a few seconds...');
    setCrawlResults(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crawl-website`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ url: crawlUrl, project_id: pid, max_pages: 15 }),
      });
      if (!response.ok) throw new Error(`Crawl failed (${response.status})`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setCrawlStatus(`Crawled ${data.pages_crawled} pages, generated ${data.requirements_generated} requirements`);
      setCrawlResults(data.pages || []);
      // Refresh requirements list
      const reqs = await fetchRequirements(pid);
      setRequirements(reqs);
    } catch (err) {
      setCrawlStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCrawling(false);
    }
  };

  const handleGenerateTests = async () => {
    setGenerating(true);
    setGenStatus('Generating test cases from requirements...');
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          project_id: pid,
          requirement_ids: requirements.map(r => r.id),
        }),
      });
      if (!response.ok) throw new Error(`Generation failed (${response.status})`);
      const data = await response.json();
      setGenStatus(`Generated ${data.generated} test cases!`);
      // Refresh requirements to show updated coverage
      const reqs = await fetchRequirements(pid);
      setRequirements(reqs);
      setTimeout(() => { setGenStatus(''); navigate(`/project/${pid}/test-cases`); }, 1500);
    } catch (err) {
      setGenStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  };

  React.useEffect(() => {
    (async () => {
      try {
        const reqs = await fetchRequirements(pid);
        setRequirements(reqs);
      } catch (err) {
        console.error('Failed to load requirements:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const handleAdd = async () => {
    if (!newReqTitle.trim()) return;
    try {
      const req = await createRequirement({
        project_id: pid,
        req_id: `REQ-${String(requirements.length + 1).padStart(2, '0')}`,
        title: newReqTitle,
        description: newReqDesc,
        source: 'manual',
        is_critical: false,
        has_coverage: false,
      });
      setRequirements(prev => [...prev, req]);
      setNewReqTitle('');
      setNewReqDesc('');
    } catch (err) {
      console.error('Failed to add requirement:', err);
    }
  };

  const startEdit = (req: Requirement) => {
    setEditing(req.id);
    setEditTitle(req.title);
    setEditDesc(req.description);
    setEditCritical(req.is_critical);
  };

  const saveEdit = async (id: string) => {
    try {
      await updateRequirement(id, { title: editTitle, description: editDesc, is_critical: editCritical });
      setRequirements(prev => prev.map(r => r.id === id ? { ...r, title: editTitle, description: editDesc, is_critical: editCritical } : r));
      setEditing(null);
    } catch (err) {
      console.error('Failed to update requirement:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRequirement(id);
      setRequirements(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete requirement:', err);
    }
  };

  const toggleCritical = async (req: Requirement) => {
    try {
      await updateRequirement(req.id, { is_critical: !req.is_critical });
      setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, is_critical: !r.is_critical } : r));
    } catch (err) {
      console.error('Failed to update requirement:', err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Requirements Import</h1>
        <p className="text-sm text-ink-500 mt-1">Choose how to bring requirements into this project</p>
      </div>

      {!activeSource && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {sources.map(src => (
            <Card key={src.id} className="p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSource(src.id)}>
              <div className="text-3xl mb-3">{src.icon}</div>
              <h3 className="text-sm font-semibold text-ink-800 mb-1">{src.label}</h3>
              <p className="text-xs text-ink-500">{src.description}</p>
            </Card>
          ))}
        </div>
      )}

      {activeSource === 'jira' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Connect to Jira</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-ink-700 block mb-1.5">Jira Base URL</label>
              <input type="text" placeholder="https://myteam.atlassian.net" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700 block mb-1.5">Project Key</label>
              <input type="text" placeholder="SHOP" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700 block mb-1.5">API Token</label>
              <input type="password" placeholder="••••••••••••" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700 block mb-1.5">Email</label>
              <input type="email" placeholder="you@company.com" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <Button variant="primary" onClick={() => alert('Jira integration requires a Jira API token. Configure it in Settings > Jira Integration first.')}>Connect & Pull Issues</Button>
        </Card>
      )}

      {activeSource === 'document' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Upload Requirements Document</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <div className="border-2 border-dashed border-ink-300 rounded-xl p-12 text-center hover:border-brand-400 hover:bg-brand-50 transition-colors cursor-pointer">
            <Upload className="w-10 h-10 text-ink-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-ink-600">Drop your file here or click to browse</p>
            <p className="text-xs text-ink-400 mt-1">Supports PDF, Word (.docx), TXT, Markdown</p>
          </div>
        </Card>
      )}

      {activeSource === 'url' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Explore Website</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <div className="flex gap-2 mb-4">
            <input
              type="url"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              placeholder="https://demo.opencart.com"
              className="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              onKeyDown={e => { if (e.key === 'Enter' && !crawling) handleCrawl(); }}
            />
            <Button variant="primary" disabled={crawling || !crawlUrl.trim()} onClick={handleCrawl}>
              <span className="flex items-center gap-1.5">
                {crawling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                {crawling ? 'Crawling...' : 'Crawl Site'}
              </span>
            </Button>
          </div>
          <div className="text-xs text-ink-400 mb-4">TestPhi will map the site structure and identify pages, forms, and navigation flows. Requirements are auto-generated from crawled pages.</div>

          {crawlStatus && (
            <div className={`p-3 rounded-lg text-sm mb-4 ${crawlStatus.startsWith('Error') ? 'bg-danger-50 text-danger-700' : crawlStatus.startsWith('Crawled') ? 'bg-success-50 text-success-700' : 'bg-brand-50 text-brand-700'}`}>
              {crawling && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />}
              {crawlStatus}
            </div>
          )}

          {crawlResults && crawlResults.length > 0 && (
            <div className="border border-ink-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-ink-50 border-b border-ink-200 text-xs font-medium text-ink-500 uppercase">Crawled Pages ({crawlResults.length})</div>
              <div className="max-h-64 overflow-y-auto">
                {crawlResults.map((page, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-ink-100 last:border-0 text-xs">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      page.category === 'Authentication' ? 'bg-brand-100 text-brand-700' :
                      page.category === 'Shopping Cart' || page.category === 'Checkout' ? 'bg-success-100 text-success-700' :
                      page.category === 'Error' ? 'bg-danger-100 text-danger-700' :
                      'bg-ink-100 text-ink-600'
                    }`}>{page.category}</span>
                    <span className="text-ink-700 truncate flex-1">{page.title}</span>
                    <span className="text-ink-400 truncate max-w-[200px]">{page.url}</span>
                    <span className={`font-medium ${page.status === 200 ? 'text-success-600' : 'text-danger-600'}`}>{page.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeSource === 'api_spec' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Import API Specification</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <div className="border-2 border-dashed border-ink-300 rounded-xl p-8 text-center hover:border-brand-400 hover:bg-brand-50 transition-colors cursor-pointer mb-3">
            <Upload className="w-8 h-8 text-ink-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-ink-600">Upload OpenAPI/Swagger JSON or YAML</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <span>Or paste a Postman collection URL</span>
            <input type="url" placeholder="https://api.postman.com/..." className="flex-1 px-3 py-1.5 text-xs border border-ink-200 rounded-lg" />
          </div>
        </Card>
      )}

      {activeSource === 'mobile' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Upload Mobile App</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <div className="border-2 border-dashed border-ink-300 rounded-xl p-12 text-center hover:border-brand-400 hover:bg-brand-50 transition-colors cursor-pointer">
            <Smartphone className="w-10 h-10 text-ink-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-ink-600">Upload APK (Android) or IPA (iOS)</p>
          </div>
        </Card>
      )}

      {activeSource === 'manual' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-800">Describe What to Test</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveSource(null)}>Back</Button>
          </div>
          <textarea
            value={naturalLangText}
            onChange={e => setNaturalLangText(e.target.value)}
            placeholder="Example: Test the login flow for my e-commerce app. Users should be able to log in with email and password. After 5 failed attempts, lock the account for 15 minutes."
            rows={6}
            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
          />
          <Button variant="primary" disabled={parsing || !naturalLangText.trim()} onClick={async () => {
            setParsing(true);
            setParseStatus('Parsing with AI...');
            try {
              const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-requirements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ text: naturalLangText, project_id: pid }),
              });
              if (!response.ok) throw new Error(`Parse failed (${response.status})`);
              const data = await response.json();
              if (data.error) throw new Error(data.error);
              setParseStatus(`Parsed ${data.parsed} requirements from your description`);
              setNaturalLangText('');
              const reqs = await fetchRequirements(pid);
              setRequirements(reqs);
              setTimeout(() => setParseStatus(''), 3000);
            } catch (err) {
              setParseStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            } finally {
              setParsing(false);
            }
          }}>
            <span className="flex items-center gap-2">{parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} {parsing ? 'Parsing...' : 'Parse Requirements'}</span>
          </Button>
          {parseStatus && <p className={`text-xs mt-2 ${parseStatus.startsWith('Error') ? 'text-danger-600' : 'text-success-600'}`}>{parseStatus}</p>}
        </Card>
      )}

      {/* Add new requirement */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink-800 mb-3">Add Requirement Manually</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input type="text" value={newReqTitle} onChange={e => setNewReqTitle(e.target.value)} placeholder="Requirement title..." className="px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          <input type="text" value={newReqDesc} onChange={e => setNewReqDesc(e.target.value)} placeholder="Description..." className="px-3 py-2 text-sm border border-ink-200 rounded-lg" />
        </div>
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Requirement</span>
        </Button>
      </Card>

      {/* Requirements list */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink-800">Requirements ({requirements.length})</h2>
          <div className="flex items-center gap-3">
            {genStatus && <span className={`text-xs ${genStatus.startsWith('Error') ? 'text-danger-600' : genStatus.startsWith('Generated') ? 'text-success-600' : 'text-ink-500'}`}>{genStatus}</span>}
            <Button variant="primary" size="sm" disabled={generating || requirements.length === 0} onClick={handleGenerateTests}>
              <span className="flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5" /> {generating ? 'Generating...' : 'Generate Tests'}</span>
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-ink-400 text-center py-4">Loading...</p>
        ) : (
          <div className="space-y-2">
            {requirements.map(req => (
              <div key={req.id} className="flex items-start gap-3 p-3 border border-ink-200 rounded-lg hover:bg-ink-50">
                <div className="flex items-center gap-2 flex-shrink-0 w-20">
                  <span className="text-xs font-mono font-medium text-brand-600">{req.req_id}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {editing === req.id ? (
                    <div className="space-y-2">
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full px-2 py-1 text-sm border border-ink-200 rounded" />
                      <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="w-full px-2 py-1 text-sm border border-ink-200 rounded" />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={editCritical} onChange={e => setEditCritical(e.target.checked)} />
                        Critical
                      </label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => saveEdit(req.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-ink-800">{req.title}</span>
                        <button onClick={() => toggleCritical(req)} className={`w-4 h-4 rounded border flex items-center justify-center ${req.is_critical ? 'border-warn-500 bg-warn-500' : 'border-ink-300'}`}>
                          {req.is_critical && <span className="text-white text-[8px]">★</span>}
                        </button>
                        {req.is_critical && <Badge variant="warn" size="xs">Critical</Badge>}
                        {req.has_coverage ? (
                          <Badge variant="success" size="xs"><Check className="w-2.5 h-2.5 inline" /> Covered</Badge>
                        ) : (
                          <Badge variant="warn" size="xs"><X className="w-2.5 h-2.5 inline" /> No coverage</Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-500 line-clamp-2">{req.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="neutral" size="xs">{req.source}</Badge>
                        {req.source_ref && <span className="text-xs text-ink-400">{req.source_ref}</span>}
                        <div className="ml-auto flex gap-1">
                          <button onClick={() => startEdit(req)} className="text-xs text-brand-600 hover:underline"><Edit className="w-3 h-3 inline" /> Edit</button>
                          <button onClick={() => handleDelete(req.id)} className="text-xs text-danger-600 hover:underline ml-2"><Trash2 className="w-3 h-3 inline" /> Delete</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
