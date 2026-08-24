'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { StatusBadge, LoadingSkeleton, HealthIndicator } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

export default function WorkersPage() {
  const router = useRouter();

  useEffect(() => {
    if (!api.getToken()) router.push('/');
  }, [router]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const workers = (data?.data as Array<{
    id: string; workerId: string; hostname: string; status: string;
    health: string; currentJobs: number; capacity: number;
    version: string; lastHeartbeat: string; startedAt: string;
    _count: { jobs: number; executions: number };
  }>) ?? [];

  return (
    <AppShell onRefresh={() => refetch()}>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Workers</h1>
          <p className="text-sm text-muted-foreground">Monitor distributed worker health and utilization</p>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.map((w) => (
              <div key={w.id} className="gradient-border rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-mono font-medium text-sm">{w.workerId}</p>
                    <p className="text-xs text-muted-foreground">{w.hostname}</p>
                  </div>
                  <HealthIndicator status={w.health as 'healthy' | 'warning' | 'offline'} />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={w.status} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Jobs</span>
                    <span className="font-mono">{w.currentJobs}/{w.capacity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Executions</span>
                    <span className="font-mono">{w._count.executions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Heartbeat</span>
                    <span className="text-xs">{formatRelativeTime(w.lastHeartbeat)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${(w.currentJobs / w.capacity) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
