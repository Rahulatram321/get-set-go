'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { StatusBadge, LoadingSkeleton, EmptyState } from '@/components/ui';
import { CreateJobModal } from '@/components/modals';
import { api } from '@/lib/api';
import { formatDuration, formatRelativeTime } from '@/lib/utils';

function JobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

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

  const { data: queuesData } = useQuery({
    queryKey: ['queues', projectId],
    queryFn: () => api.getQueues(projectId),
    enabled: !!projectId,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['jobs', projectId, statusFilter, search],
    queryFn: () => api.getJobs(projectId, {
      ...(statusFilter && { status: statusFilter }),
      ...(search && { search }),
      limit: '50',
    }),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const queues = (queuesData?.data as Array<{ name: string }>) ?? [];
  const jobs = (data?.data as Array<{
    id: string; name: string; status: string; priority: number; batchId: string | null;
    attemptNumber: number; createdAt: string; executionDurationMs: number | null;
    queue: { name: string }; errorMessage: string | null;
  }>) ?? [];

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()} onCreateJob={() => setCreateOpen(true)}>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Job Explorer</h1>
            <p className="text-sm text-muted-foreground">Search and inspect all jobs</p>
          </div>
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="w-4 h-4" /> Create Job
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <input placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50 w-64" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-muted border border-border text-sm outline-none">
            <option value="">All statuses</option>
            {['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {isLoading ? <LoadingSkeleton /> : jobs.length === 0 ? (
          <EmptyState title="No jobs found" description="Create a job or adjust your filters" action={
            <button onClick={() => setCreateOpen(true)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Create Job</button>
          } />
        ) : (
          <div className="gradient-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Job', 'Queue', 'Status', 'Batch', 'Attempts', 'Duration', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{job.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{job.id.slice(0, 12)}...</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{job.queue.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3">{job.batchId ? (
                      <a href={`/batches/${job.batchId}?project=${projectId}`} className="text-xs font-mono text-primary hover:underline">{job.batchId.slice(0, 8)}...</a>
                    ) : '-'}</td>
                    <td className="px-4 py-3 font-mono">{job.attemptNumber}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{formatDuration(job.executionDurationMs)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatRelativeTime(job.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <a href={`/jobs/${job.id}?project=${projectId}`} className="text-xs text-primary hover:underline">View</a>
                        {['FAILED', 'DEAD_LETTER'].includes(job.status) && (
                          <button onClick={() => api.retryJob(projectId, job.id).then(() => refetch())} className="text-xs text-orange-400 hover:underline">Retry</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {projectId && <CreateJobModal open={createOpen} onClose={() => setCreateOpen(false)} projectId={projectId} queues={queues} onCreated={() => refetch()} />}
    </AppShell>
  );
}

export default function JobsPage() {
  return <Suspense fallback={<LoadingSkeleton />}><JobsContent /></Suspense>;
}
