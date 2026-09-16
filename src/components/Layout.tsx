import React from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, FlaskConical, ShieldCheck,
  Layers, Play, AlertTriangle, GitBranch, BarChart3, Bug,
  Settings, ChevronRight, Shield, ClipboardList
} from 'lucide-react';
import { fetchProject } from '../lib/api';
import type { Project } from '../lib/types';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { projectId } = useParams();
  const pid = projectId || '';
  const [project, setProject] = React.useState<Project | null>(null);

  React.useEffect(() => {
    if (!pid) return;
    fetchProject(pid).then(setProject).catch(() => setProject(null));
  }, [pid]);

  const navItems = [
    { to: `/project/${pid}`, label: 'Dashboard', icon: LayoutDashboard },
    { to: `/project/${pid}/requirements`, label: 'Requirements', icon: FileText },
    { to: `/project/${pid}/planner`, label: 'Planner', icon: ClipboardList },
    { to: `/project/${pid}/test-cases`, label: 'Test Cases', icon: FlaskConical },
    { to: `/project/${pid}/validation`, label: 'Validation', icon: ShieldCheck },
    { to: `/project/${pid}/suites`, label: 'Test Suites', icon: Layers },
    { to: `/project/${pid}/execution`, label: 'Test Execution', icon: Play },
    { to: `/project/${pid}/flaky`, label: 'Flaky Tests', icon: AlertTriangle },
    { to: `/project/${pid}/cicd`, label: 'CI/CD', icon: GitBranch },
    { to: `/project/${pid}/reports`, label: 'Reports', icon: BarChart3 },
    { to: `/project/${pid}/defects`, label: 'Defects', icon: Bug },
    { to: `/project/${pid}/settings`, label: 'Settings', icon: Settings },
  ];

  const projectName = project?.name || 'Project';

  return (
    <div className="flex h-screen bg-ink-50">
      {/* Sidebar */}
      <aside className="w-60 bg-ink-900 text-ink-200 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-ink-800">
          <NavLink to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">TestPhi</h1>
              <p className="text-[10px] text-ink-400 mt-0.5">AI Test Platform</p>
            </div>
          </NavLink>
        </div>

        {/* Project indicator */}
        <div className="px-4 py-3 border-b border-ink-800">
          <div className="flex items-center gap-2 text-xs text-ink-400 mb-1">
            <span>Current Project</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{projectName}</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white font-medium'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-800 text-xs text-ink-500">
          v1.0.0 — Prototype
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-ink-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <span>Projects</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-ink-700 font-medium">{projectName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <span className="w-2 h-2 rounded-full bg-success-500"></span>
              Connected
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
