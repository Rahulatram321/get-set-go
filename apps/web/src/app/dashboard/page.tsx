'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, CheckCircle, XCircle, RefreshCw, AlertTriangle, Cpu, Layers,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { AppShell } from '@/components/layout';
import { MetricCard, StatusBadge, LoadingSkeleton, HealthIndicator } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    if (!api.getToken()) {
      router.push('/');
      return;
    }
    initProject();
  }, [router]);

  async function initProject() {
    const paramProject = searchParams.get('project');
    if (paramProject) {
      setProjectId(paramProject);
      return;
    }
    const orgs = await api.getOrganizations();
    if (orgs.data?.[0]) {
      const projects = await api.getProjects(orgs.data[0].id);
      if (projects.data?.[0]) {
        setProjectId(projects.data[0].id);
      }
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => api.getDashboard(projectId),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const { data: metricsData } = useQuery({
    queryKey: ['metrics', projectId],
    queryFn: () => api.getMetrics(projectId, '24h'),
    enabled: !!projectId,
  });

  const { data: eventsData } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.getSystemEvents(),
    refetchInterval: 10000,
  });

  const dashboard = data?.data as {
    stats: Record<string, number>;
    workers: Array<{ workerId: string; status: string; health: string; currentJobs: number; hostname: string }>;
    dlqCount: number;
    recentFailures: Array<{ id: string; name: string; errorMessage: string; queue: { name: string } }>;
    metrics: { successRate: number; failureRate: number; throughput: number };
  } | undefined;

  const chartData = ((metricsData?.data as Array<{ timestamp: string; jobsProcessed: number; jobsFailed: number; avgLatencyMs: number }>) ?? [])
    .slice(-24)
    .map((m) => ({
      time: new Date(m.timestamp).getHours() + ':00',
      processed: m.jobsProcessed,
      failed: m.jobsFailed,
      latency: Math.round(m.avgLatencyMs),
    }));

  if (!projectId) return <LoadingSkeleton rows={8} />;

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">System overview and real-time metrics</p>
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Jobs Completed" value={dashboard?.stats?.COMPLETED ?? 0} icon={CheckCircle} trend="up" />
              <MetricCard title="Jobs Running" value={dashboard?.stats?.RUNNING ?? 0} icon={Activity} />
              <MetricCard title="Success Rate" value={`${(dashboard?.metrics?.successRate ?? 0).toFixed(1)}%`} icon={CheckCircle} />
              <MetricCard title="DLQ Count" value={dashboard?.dlqCount ?? 0} icon={AlertTriangle} trend={dashboard?.dlqCount ? 'down' : 'neutral'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 gradient-border rounded-xl p-5">
                <h3 className="text-sm font-medium mb-4">Throughput (24h)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="processed" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" />
                    <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive)/0.1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="gradient-border rounded-xl p-5">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> Active Workers
                </h3>
                <div className="space-y-3">
                  {(dashboard?.workers ?? []).slice(0, 5).map((w) => (
                    <div key={w.workerId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-mono">{w.workerId}</p>
                        <p className="text-xs text-muted-foreground">{w.hostname}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={w.status} />
                        <HealthIndicator status={w.health as 'healthy' | 'warning' | 'offline'} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="gradient-border rounded-xl p-5">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" /> Recent Failures
                </h3>
                {(dashboard?.recentFailures ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent failures</p>
                ) : (
                  <div className="space-y-2">
                    {dashboard?.recentFailures.map((f) => (
                      <div key={f.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{f.name}</span>
                          <span className="text-xs text-muted-foreground">{f.queue.name}</span>
                        </div>
                        <p className="text-xs text-red-400 mt-1 font-mono truncate">{f.errorMessage}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="gradient-border rounded-xl p-5">
                <h3 className="text-sm font-medium mb-4">Live Event Stream</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {((eventsData?.data as Array<{ type: string; message: string; createdAt: string; severity: string }>) ?? []).map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs font-mono">
                      <span className="text-muted-foreground shrink-0">{formatRelativeTime(e.createdAt)}</span>
                      <span className={e.severity === 'error' ? 'text-red-400' : 'text-foreground'}>{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={8} />}>
      <DashboardContent />
    </Suspense>
  );
}
