import React from 'react';

export function Badge({ children, variant = 'neutral', size = 'sm' }: {
  children: React.ReactNode;
  variant?: 'neutral' | 'brand' | 'success' | 'danger' | 'warn' | 'purple';
  size?: 'sm' | 'xs';
}) {
  const variants: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    success: 'bg-success-100 text-success-700',
    danger: 'bg-danger-100 text-danger-700',
    warn: 'bg-warn-100 text-warn-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  const sizes = { sm: 'text-xs px-2 py-0.5', xs: 'text-[10px] px-1.5 py-0.5' };
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}

export function Button({ children, variant = 'primary', size = 'md', onClick, disabled, className = '' }: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
    ghost: 'text-ink-600 hover:bg-ink-100',
    danger: 'bg-danger-500 text-white hover:bg-danger-600',
    success: 'bg-success-500 text-white hover:bg-success-600',
  };
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-base px-5 py-2.5' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '', onClick }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-ink-200 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-200' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function ProgressBar({ value, max = 100, variant = 'brand', height = 'h-2' }: {
  value: number;
  max?: number;
  variant?: 'brand' | 'success' | 'danger' | 'warn';
  height?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const colors: Record<string, string> = {
    brand: 'bg-brand-500',
    success: 'bg-success-500',
    danger: 'bg-danger-500',
    warn: 'bg-warn-500',
  };
  return (
    <div className={`w-full bg-ink-100 rounded-full overflow-hidden ${height}`}>
      <div className={`${colors[variant]} ${height} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatCard({ label, value, sublabel, icon, variant = 'neutral' }: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  variant?: 'neutral' | 'success' | 'danger' | 'warn' | 'brand';
}) {
  const accents: Record<string, string> = {
    neutral: 'text-ink-700',
    success: 'text-success-600',
    danger: 'text-danger-600',
    warn: 'text-warn-600',
    brand: 'text-brand-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${accents[variant]}`}>{value}</p>
          {sublabel && <p className="text-xs text-ink-400 mt-1">{sublabel}</p>}
        </div>
        {icon && <div className={`${accents[variant]} opacity-80`}>{icon}</div>}
      </div>
    </Card>
  );
}

export function StatusDot({ status }: { status: 'pass' | 'fail' | 'warn' | 'skip' | 'pending' | 'running' }) {
  const colors: Record<string, string> = {
    pass: 'bg-success-500',
    fail: 'bg-danger-500',
    warn: 'bg-warn-500',
    skip: 'bg-ink-300',
    pending: 'bg-ink-300',
    running: 'bg-brand-500 animate-pulse',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

export function ResultIcon({ result }: { result: 'pass' | 'fail' | 'warn' }) {
  if (result === 'pass') return <span className="text-success-500 text-lg leading-none">&#10003;</span>;
  if (result === 'fail') return <span className="text-danger-500 text-lg leading-none">&#10007;</span>;
  return <span className="text-warn-500 text-lg leading-none">!</span>;
}

export function MiniBars({ values, variant = 'brand' }: {
  values: number[];
  variant?: 'brand' | 'success' | 'danger';
}) {
  const max = Math.max(...values, 1);
  const colors: Record<string, string> = {
    brand: 'bg-brand-400',
    success: 'bg-success-400',
    danger: 'bg-danger-400',
  };
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className={`${colors[variant]} rounded-sm transition-all duration-300`}
          style={{ height: `${(v / max) * 100}%`, width: '8px' }}
        />
      ))}
    </div>
  );
}

export function RunDots({ runs }: { runs: ('pass' | 'fail' | 'skip')[] }) {
  const colors: Record<string, string> = {
    pass: 'bg-success-500',
    fail: 'bg-danger-500',
    skip: 'bg-ink-300',
  };
  return (
    <div className="flex items-center gap-1">
      {runs.map((r, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${colors[r]}`} title={r} />
      ))}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-ink-200">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            active === tab.id
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-ink-300 mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink-700">{title}</h3>
      {description && <p className="text-sm text-ink-400 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${maxWidth} mx-4 animate-slide-up`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200">
          <h2 className="text-lg font-semibold text-ink-800">{title}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl">&times;</button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function GherkinView({ gherkin }: { gherkin: string }) {
  const lines = gherkin.split('\n');
  return (
    <pre className="text-sm font-mono leading-relaxed bg-ink-50 rounded-lg p-4 overflow-x-auto">
      {lines.map((line, i) => {
        const keyword = line.trim().split(' ')[0];
        const rest = line.replace(keyword, '');
        const kwClass = keyword === 'Then' ? 'then' : keyword === 'When' ? 'when' : '';
        return (
          <div key={i}>
            {keyword && ['Given', 'When', 'Then', 'And', 'But', 'Feature:', 'Scenario:'].includes(keyword) ? (
              <><span className={`gherkin-keyword ${kwClass}`}>{keyword}</span><span className="text-ink-700">{rest}</span></>
            ) : (
              <span className="text-ink-700">{line}</span>
            )}
          </div>
        );
      })}
    </pre>
  );
}
