'use client';

import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const colors: Record<string, string> = {
    QUEUED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RUNNING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    COMPLETED: 'bg-green-500/20 text-green-400 border-green-500/30',
    FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
    ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
    PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    IDLE: 'bg-green-500/20 text-green-400 border-green-500/30',
    BUSY: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    UNHEALTHY: 'bg-red-500/20 text-red-400 border-red-500/30',
    DEAD_LETTER: 'bg-red-500/20 text-red-300 border-red-500/30',
    RETRY_SCHEDULED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border font-mono',
        colors[status] ?? 'bg-muted text-muted-foreground border-border',
        className
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="gradient-border rounded-xl p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
      {trend && (
        <div className={cn('text-xs mt-2', trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground')}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} vs last period
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl">⚡</span>
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

export function HealthIndicator({ status }: { status: 'healthy' | 'warning' | 'offline' }) {
  const config = {
    healthy: { color: 'bg-green-400 glow-success', label: 'Healthy' },
    warning: { color: 'bg-yellow-400 glow-warning', label: 'Warning' },
    offline: { color: 'bg-red-400 glow-error', label: 'Offline' },
  };
  const c = config[status];
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full animate-pulse-slow', c.color)} />
      <span className="text-xs text-muted-foreground">{c.label}</span>
    </div>
  );
}
