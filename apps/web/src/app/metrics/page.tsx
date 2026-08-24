'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AppShell } from '@/components/layout';
import { LoadingSkeleton } from '@/components/ui';
import { api } from '@/lib/api';

const RANGES = ['1h', '6h', '24h', '7d'];

function MetricsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [range, setRange] = useState('24h');

  useEffect(() => {
    if (!api.getToken()) router.push('/');
    else initProject();
  }, [router]);

  async function initProject() {
    const p = searchParams.get('project');
    if (p) { setProjectId(p); return; }
    const orgs = await api.getOrganizations();
    if (orgs.data?.[0]) {
      const projects = await api.getProjects(orgs.data[0].id);
      if (projects.data?.[0]) setProjectId(projects.data[0].id);
    }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['metrics', projectId, range],
    queryFn: () => api.getMetrics(projectId, range),
    enabled: !!projectId,
  });

  const metrics = (data?.data as Array<{
    timestamp: string; jobsProcessed: number; jobsFailed: number;
    avgLatencyMs: number; queueDepth: number; throughputPerMin: number;
    queue: { name: string };
  }>) ?? [];

  const chartData = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    processed: m.jobsProcessed,
    failed: m.jobsFailed,
    latency: Math.round(m.avgLatencyMs),
    depth: m.queueDepth,
    throughput: m.throughputPerMin,
    queue: m.queue.name,
  }));

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Observability</h1>
            <p className="text-sm text-muted-foreground">Performance metrics and throughput analysis</p>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-md text-xs transition-colors ${range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <div className="grid gap-4">
            {[
              { title: 'Jobs Processed', dataKey: 'processed', color: 'hsl(var(--primary))' },
              { title: 'Average Latency (ms)', dataKey: 'latency', color: 'hsl(var(--warning))' },
              { title: 'Queue Depth', dataKey: 'depth', color: 'hsl(var(--destructive))' },
            ].map((chart) => (
              <div key={chart.title} className="gradient-border rounded-xl p-5">
                <h3 className="text-sm font-medium mb-4">{chart.title}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Line type="monotone" dataKey={chart.dataKey} stroke={chart.color} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function MetricsPage() {
  return <Suspense fallback={<LoadingSkeleton />}><MetricsContent /></Suspense>;
}
