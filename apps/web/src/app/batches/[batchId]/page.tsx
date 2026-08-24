'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { StatusBadge, LoadingSkeleton } from '@/components/ui';
import { api } from '@/lib/api';

function BatchDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const batchId = params.batchId as string;
  const projectId = searchParams.get('project') ?? '';

  useEffect(() => {
    if (!api.getToken()) router.push('/');
  }, [router]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['batch', projectId, batchId],
    queryFn: () => api.getBatch(projectId, batchId),
    enabled: !!projectId && !!batchId,
    refetchInterval: 3000,
  });

  const batch = data?.data as {
    batchId: string; total: number; completed: number; failed: number;
    pending: number; progressPercent: number;
    jobs: Array<{ id: string; name: string; status: string }>;
  } | undefined;

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      {isLoading ? <LoadingSkeleton /> : !batch ? <p>Batch not found</p> : (
        <div className="space-y-6 animate-fade-in max-w-3xl">
          <div>
            <h1 className="text-2xl font-bold">Batch Progress</h1>
            <p className="font-mono text-sm text-muted-foreground mt-1">{batch.batchId}</p>
          </div>

          <div className="gradient-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl font-bold tabular-nums">{batch.progressPercent}%</span>
              <span className="text-muted-foreground">{batch.completed}/{batch.total} completed</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${batch.progressPercent}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div><p className="text-xl font-semibold text-green-400">{batch.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div>
              <div><p className="text-xl font-semibold text-red-400">{batch.failed}</p><p className="text-xs text-muted-foreground">Failed</p></div>
              <div><p className="text-xl font-semibold text-amber-400">{batch.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div>
            </div>
          </div>

          <div className="gradient-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {batch.jobs.map((job) => (
                  <tr key={job.id} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <a href={`/jobs/${job.id}?project=${projectId}`} className="hover:text-primary">{job.name}</a>
                      <p className="text-xs font-mono text-muted-foreground">{job.id.slice(0, 12)}...</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function BatchDetailPage() {
  return <Suspense fallback={<LoadingSkeleton />}><BatchDetailContent /></Suspense>;
}
