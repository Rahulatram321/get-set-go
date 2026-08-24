'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

function DlqContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');

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
    queryKey: ['dlq', projectId],
    queryFn: () => api.getDlq(projectId),
    enabled: !!projectId,
  });

  const items = (data?.data as Array<{
    id: string; name: string; failureReason: string; attemptCount: number;
    lastError: string; failedAt: string; queue: { name: string }; jobId: string;
  }>) ?? [];

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Dead Letter Queue</h1>
          <p className="text-sm text-muted-foreground">Permanently failed jobs awaiting review</p>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="No dead letter jobs" description="Failed jobs that exceed retry limits appear here" />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="gradient-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.queue.name} · {item.attemptCount} attempts · {formatRelativeTime(item.failedAt)}</p>
                    <p className="text-sm text-red-400 font-mono mt-2">{item.lastError ?? item.failureReason}</p>
                  </div>
                  <button
                    onClick={() => api.retryJob(projectId, item.jobId).then(() => refetch())}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs border border-primary/20 hover:bg-primary/20"
                  >
                    Requeue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function DlqPage() {
  return <Suspense fallback={<LoadingSkeleton />}><DlqContent /></Suspense>;
}
