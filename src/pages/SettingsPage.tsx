import React from 'react';
import { useParams } from 'react-router-dom';
import { Server, GitBranch, Bell, Brain, Database, Save, Loader2, Check, Globe, KeyRound } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { fetchEnvironments, updateEnvironment, PROJECT_ID } from '../lib/api';
import type { Environment } from '../lib/types';

export default function SettingsPage() {
  const { projectId } = useParams();
  const pid = projectId || PROJECT_ID;

  const [envs, setEnvs] = React.useState<Environment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState('');
  const [aiModel, setAiModel] = React.useState('deepseek-v4-flash-0731');
  const [temperature, setTemperature] = React.useState('0.3');
  const [maxTokens, setMaxTokens] = React.useState('4096');
  const [validationPasses, setValidationPasses] = React.useState('3');
  const [notifEmail, setNotifEmail] = React.useState({ runComplete: true, flakyDetected: true, valFailure: false, smokeFail: true, weekly: true });
  const [browserlessKey, setBrowserlessKey] = React.useState('');
  const [browserlessUrl, setBrowserlessUrl] = React.useState('');
  const [credentials, setCredentials] = React.useState<Record<string, { login_url: string; username: string; password: string; username_selector: string; password_selector: string; submit_selector: string }>>({});

  React.useEffect(() => {
    (async () => {
      try {
        const e = await fetchEnvironments(pid);
        setEnvs(e);
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-settings`, {
          headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const s = data.settings || {};
          if (s.AI_MODEL) setAiModel(s.AI_MODEL);
          if (s.AI_TEMPERATURE) setTemperature(s.AI_TEMPERATURE);
          if (s.AI_MAX_TOKENS) setMaxTokens(s.AI_MAX_TOKENS);
          if (s.VALIDATION_PASSES) setValidationPasses(s.VALIDATION_PASSES);
          if (s.BROWSERLESS_API_KEY) setBrowserlessKey(s.BROWSERLESS_API_KEY);
          if (s.BROWSERLESS_BASE_URL) setBrowserlessUrl(s.BROWSERLESS_BASE_URL);
          const credMap: Record<string, any> = {};
          for (const c of (data.credentials || [])) {
            credMap[c.environment] = { login_url: c.login_url, username: c.username, password: c.password, username_selector: c.username_selector, password_selector: c.password_selector, submit_selector: c.submit_selector };
          }
          setCredentials(credMap);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pid]);

  const updateCredential = (env: string, field: string, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [env]: { ...(prev[env] || { login_url: '', username: '', password: '', username_selector: '', password_selector: '', submit_selector: '' }), [field]: value },
    }));
  };

  const handleEnvUpdate = async (id: string, url: string) => {
    try {
      await updateEnvironment(id, url);
      setEnvs(prev => prev.map(e => e.id === id ? { ...e, url } : e));
    } catch (err) {
      console.error('Failed to update environment:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('Saving settings...');
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          settings: {
            AI_MODEL: aiModel,
            AI_TEMPERATURE: temperature,
            AI_MAX_TOKENS: maxTokens,
            VALIDATION_PASSES: validationPasses,
            BROWSERLESS_API_KEY: browserlessKey,
            BROWSERLESS_BASE_URL: browserlessUrl || 'https://chrome.browserless.io',
          },
          credentials: Object.entries(credentials).map(([env, c]) => ({ project_id: pid, environment: env, ...c })),
        }),
      });
      setSaveStatus('Settings saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setSaveStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-ink-400">Loading settings...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-ink-800">Settings</h1>
        <p className="text-sm text-ink-500 mt-1">Configure integrations, environments, and preferences</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">AI Model Settings</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Model</label>
            <select value={aiModel} onChange={e => setAiModel(e.target.value)} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg">
              <option value="deepseek-v4-flash-0731">DeepSeek V4 Flash</option>
              <option value="glm-5.3-flash">GLM 5.3 Flash</option>
              <option value="minimax-m3">MiniMax M3</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Temperature</label>
            <input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} step="0.1" min="0" max="1" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Max Tokens</label>
            <input type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Validation Passes</label>
            <input type="number" value={validationPasses} onChange={e => setValidationPasses(e.target.value)} className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Environment URLs</h2>
        </div>
        <div className="space-y-3">
          {envs.map(env => (
            <div key={env.id} className="flex items-center gap-3">
              <Badge variant={env.name === 'prod' ? 'danger' : env.name === 'staging' ? 'warn' : 'success'} size="sm">{env.name}</Badge>
              <input type="url" defaultValue={env.url} onBlur={e => handleEnvUpdate(env.id, e.target.value)} className="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Login Credentials</h2>
        </div>
        <p className="text-xs text-ink-400 mb-4">If your website requires a login, add the credentials for each environment. The test runner will sign in before running tests. Passwords are stored securely and never shown in the browser.</p>
        <div className="space-y-5">
          {envs.map(env => {
            const c = credentials[env.name] || { login_url: '', username: '', password: '', username_selector: '', password_selector: '', submit_selector: '' };
            return (
              <div key={env.id} className="p-4 border border-ink-200 rounded-lg">
                <Badge variant={env.name === 'prod' ? 'danger' : env.name === 'staging' ? 'warn' : 'success'} size="sm">{env.name}</Badge>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Login Page URL</label>
                    <input type="url" value={c.login_url} onChange={e => updateCredential(env.name, 'login_url', e.target.value)} placeholder="https://example.com/login" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Username / Email</label>
                    <input type="text" value={c.username} onChange={e => updateCredential(env.name, 'username', e.target.value)} placeholder="user@example.com" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Password</label>
                    <input type="password" value={c.password} onChange={e => updateCredential(env.name, 'password', e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Username Field Selector (optional)</label>
                    <input type="text" value={c.username_selector} onChange={e => updateCredential(env.name, 'username_selector', e.target.value)} placeholder="input[name=email]" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Password Field Selector (optional)</label>
                    <input type="text" value={c.password_selector} onChange={e => updateCredential(env.name, 'password_selector', e.target.value)} placeholder="input[name=password]" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 block mb-1.5">Login Button Selector (optional)</label>
                    <input type="text" value={c.submit_selector} onChange={e => updateCredential(env.name, 'submit_selector', e.target.value)} placeholder="button[type=submit]" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Website Crawling (Browser)</h2>
        </div>
        <p className="text-xs text-ink-400 mb-3">Add a headless-browser key so the crawler can render JavaScript-heavy sites that block simple requests. Leave blank to use basic crawling.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Browserless API Key</label>
            <input type="password" value={browserlessKey} onChange={e => setBrowserlessKey(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Browserless Base URL</label>
            <input type="text" value={browserlessUrl} onChange={e => setBrowserlessUrl(e.target.value)} placeholder="https://chrome.browserless.io" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Jira Integration</h2>
          <Badge variant="neutral" size="xs">Not connected</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">Base URL</label>
            <input type="text" placeholder="https://myteam.atlassian.net" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1.5">API Token</label>
            <input type="password" placeholder="••••••••" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Grafana Integration</h2>
          <Badge variant="neutral" size="xs">Not connected</Badge>
        </div>
        <p className="text-xs text-ink-400 mb-3">Connect Grafana to your Supabase Postgres database using a read-only connection string.</p>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1.5">Postgres Connection String (read-only)</label>
          <input type="text" placeholder="postgresql://readonly:password@db.supabase.co:5432/postgres" className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg" />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-ink-800">Notification Preferences</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: 'runComplete', label: 'Email on run complete' },
            { key: 'flakyDetected', label: 'Email on flaky test detected' },
            { key: 'valFailure', label: 'Email on validation failure' },
            { key: 'smokeFail', label: 'Email on smoke suite failure in CI/CD' },
            { key: 'weekly', label: 'Weekly summary report' },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={notifEmail[item.key as keyof typeof notifEmail]} onChange={e => setNotifEmail(prev => ({ ...prev, [item.key]: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-ink-700">{item.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saveStatus && <span className={`text-xs ${saveStatus.startsWith('Error') ? 'text-danger-600' : 'text-success-600'}`}>{saveStatus}</span>}
        <Button variant="primary" disabled={saving} onClick={handleSave}>
          <span className="flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveStatus ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} Save Settings</span>
        </Button>
      </div>
    </div>
  );
}
