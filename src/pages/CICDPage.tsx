import React from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, Copy, Webhook, Plus, Link2, ExternalLink, GitCommit } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { fetchCICDConfig, upsertCICDConfig, fetchCICDRuns, PROJECT_ID } from '../lib/api';
import type { CICDConfig, CICDRun } from '../lib/types';

export default function CICDPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [config, setConfig] = React.useState<CICDConfig | null>(null);
  const [runs, setRuns] = React.useState<CICDRun[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [webhookCopied, setWebhookCopied] = React.useState(false);
  const [owner, setOwner] = React.useState('');
  const [repo, setRepo] = React.useState('');
  const [token, setToken] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const [cfg, rns] = await Promise.all([fetchCICDConfig(pid), fetchCICDRuns(pid)]);
        setConfig(cfg);
        setConnected(cfg?.is_connected ?? false);
        if (cfg) { setOwner(cfg.github_owner || ''); setRepo(cfg.github_repo || ''); }
        setRuns(rns);
      } catch (err) {
        console.error('Failed to load CI/CD config:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const handleConnect = async () => {
    try {
      const cfg = await upsertCICDConfig({
        project_id: pid,
        github_owner: owner,
        github_repo: repo,
        github_token: token,
        is_connected: true,
        trigger_rules: [
          { event: 'Pull Request', branch: '*', suite: 'Smoke Suite' },
          { event: 'Push', branch: 'main', suite: 'Regression Suite' },
        ],
      });
      setConfig(cfg);
      setConnected(true);
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  const handleDisconnect = async () => {
    if (!config) return;
    try {
      const cfg = await upsertCICDConfig({ ...config, is_connected: false });
      setConfig(cfg);
      setConnected(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
  const workflowYaml = [
    'name: TestPhi CI',
    'on:',
    '  pull_request:',
    '    branches: [main, develop]',
    '  push:',
    '    branches: [main]',
    '',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Run TestPhi Smoke Suite',
    '        run: |',
    `          curl -X POST ${supabaseUrl}/functions/v1/generate-tests \\`,
    '            -H "Authorization: Bearer ${{ secrets.TESTPHI_API_KEY }}" \\',
    '            -H "Content-Type: application/json" \\',
    `            -d '{"suite":"smoke","environment":"staging"}'`,
  ].join('\n');

  const copyYaml = () => {
    navigator.clipboard?.writeText(workflowYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="text-center py-20 text-ink-400">Loading CI/CD config...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">CI/CD Integration</h1>
        <p className="text-sm text-ink-500 mt-1">Connect GitHub to automatically run test suites on commits and pull requests</p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink-800 mb-4">GitHub Connection</h2>
        {!connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-1.5">GitHub Owner / Repo</label>
                <input type="text" value={owner} onChange={e => setOwner(e.target.value)} placeholder="myteam/ecommerce-app" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700 block mb-1.5">Personal Access Token</label>
                <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_••••••••" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
              </div>
            </div>
            <Button variant="primary" onClick={handleConnect}><span className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Connect GitHub</span></Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-success-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-success-500 flex items-center justify-center"><Check className="w-4 h-4 text-white" /></div>
            <div>
              <p className="text-sm font-medium text-success-700">Connected to {owner}/{repo}</p>
              <p className="text-xs text-success-600">Webhook active — events will trigger suite runs automatically</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={handleDisconnect}>Disconnect</Button>
          </div>
        )}
      </Card>

      {connected && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink-800">Trigger Rules</h2>
              <Button variant="secondary" size="sm" onClick={() => {
                if (!config) return;
                const newRules = [...(config.trigger_rules || []), { event: 'Push', branch: 'develop', suite: 'Smoke Suite' }];
                upsertCICDConfig({ ...config, trigger_rules: newRules }).then(c => setConfig(c)).catch(console.error);
              }}><span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Rule</span></Button>
            </div>
            <div className="space-y-2">
              {(config?.trigger_rules || []).map((rule, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border border-ink-100 rounded-lg">
                  <Badge variant="brand" size="xs">{rule.event}</Badge>
                  <span className="text-sm text-ink-600">Branch:</span>
                  <code className="text-xs bg-ink-100 px-2 py-0.5 rounded font-mono text-ink-700">{rule.branch}</code>
                  <span className="text-sm text-ink-600">→</span>
                  <Badge variant="success" size="xs">{rule.suite}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-2">Webhook URL</h2>
            <p className="text-xs text-ink-400 mb-2">Add this URL to your GitHub repo's webhook settings</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-ink-100 px-3 py-2 rounded font-mono text-ink-700">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook</code>
              <Button variant="secondary" size="sm" onClick={() => {
                navigator.clipboard?.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`);
                setWebhookCopied(true);
                setTimeout(() => setWebhookCopied(false), 2000);
              }}><span className="flex items-center gap-1.5">{webhookCopied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Webhook className="w-3.5 h-3.5" />} {webhookCopied ? 'Copied!' : 'Copy'}</span></Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-ink-800">Generated GitHub Actions Workflow</h2>
              <Button variant="secondary" size="sm" onClick={copyYaml}>
                <span className="flex items-center gap-1.5">{copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied!' : 'Copy YAML'}</span>
              </Button>
            </div>
            <pre className="text-xs font-mono bg-ink-900 text-ink-200 p-4 rounded-lg overflow-x-auto">{workflowYaml}</pre>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-800 mb-4">Recent CI/CD Runs</h2>
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id} className="flex items-center gap-3 p-3 border border-ink-100 rounded-lg hover:bg-ink-50">
                  {run.github_status === 'passed' ? <Check className="w-5 h-5 text-success-500" /> : <X className="w-5 h-5 text-danger-500" />}
                  <GitCommit className="w-4 h-4 text-ink-400" />
                  <code className="text-xs font-mono text-ink-600">{run.commit_sha}</code>
                  <span className="text-sm text-ink-700 flex-1 truncate">{run.commit_message}</span>
                  <Badge variant="neutral" size="xs">{run.triggered_suite}</Badge>
                  <span className="text-xs text-ink-400">{run.pass_rate}% pass</span>
                  <span className="text-xs text-ink-400">{new Date(run.timestamp).toLocaleString()}</span>
                </div>
              ))}
              {runs.length === 0 && <p className="text-sm text-ink-400 text-center py-4">No CI/CD runs yet</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
