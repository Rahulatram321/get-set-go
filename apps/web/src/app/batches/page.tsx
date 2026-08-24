'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';

function BatchesContent() {
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
    queryKey: ['batches', projectId],
    queryFn: () => api.getBatches(projectId),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const batches = (data?.data as Array<{
    batchId: string; total: number; completed: number; failed: number;
    pending: number; progressPercent: number;
  }>) ?? [];

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Batch Jobs</h1>
          <p className="text-sm text-muted-foreground">Monitor batch submission progress</p>
        </div>

        {isLoading ? <LoadingSkeleton /> : batches.length === 0 ? (
          <EmptyState title="No batches yet" description="Submit jobs via the batch API to see progress here" />
        ) : (
          <div className="grid gap-4">
            {batches.map((batch) => (
              <a key={batch.batchId} href={`/batches/${batch.batchId}?project=${projectId}`} className="gradient-border rounded-xl p-5 block hover:bg-muted/10 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-sm">{batch.batchId}</p>
                  <span className="text-lg font-semibold tabular-nums">{batch.progressPercent}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-3">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${batch.progressPercent}%` }} />
                </div>
                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div><p className="font-semibold">{batch.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
                  <div><p className="font-semibold text-green-400">{batch.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div>
                  <div><p className="font-semibold text-red-400">{batch.failed}</p><p className="text-xs text-muted-foreground">Failed</p></div>
                  <div><p className="font-semibold text-amber-400">{batch.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function BatchesPage() {
  return <Suspense fallback={<LoadingSkeleton />}><BatchesContent /></Suspense>;
}
