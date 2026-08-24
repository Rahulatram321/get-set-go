'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Plus, Droplets, RotateCcw, Trash2, Settings2 } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { StatusBadge, LoadingSkeleton } from '@/components/ui';
import { CreateQueueModal, EditQueueModal } from '@/components/modals';
import { api } from '@/lib/api';

function QueuesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editQueue, setEditQueue] = useState<{ id: string; description: string; concurrencyLimit: number; maxAttempts: number } | null>(null);

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
    queryKey: ['queues', projectId],
    queryFn: () => api.getQueues(projectId),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const queues = (data?.data as Array<{
    id: string; name: string; description: string; status: string;
    concurrencyLimit: number; maxAttempts: number; stats: Record<string, number>;
  }>) ?? [];

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()} onCreateQueue={() => setCreateOpen(true)}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Queues</h1>
            <p className="text-sm text-muted-foreground">Manage job queues and concurrency</p>
          </div>
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="w-4 h-4" /> Create Queue
          </button>
        </div>

        {isLoading ? <LoadingSkeleton /> : (
          <div className="grid gap-4">
            {queues.map((queue) => (
              <div key={queue.id} className="gradient-border rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{queue.name}</h3>
                      <StatusBadge status={queue.status} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{queue.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => setEditQueue(queue)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-xs hover:bg-muted/80"><Settings2 className="w-3 h-3" /> Edit</button>
                    {queue.status === 'ACTIVE' ? (
                      <>
                        <button onClick={() => api.pauseQueue(projectId, queue.id).then(() => refetch())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs border border-yellow-500/20"><Pause className="w-3 h-3" /> Pause</button>
                        <button onClick={() => api.drainQueue(projectId, queue.id).then(() => refetch())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-xs border border-orange-500/20"><Droplets className="w-3 h-3" /> Drain</button>
                      </>
                    ) : (
                      <button onClick={() => api.resumeQueue(projectId, queue.id).then(() => refetch())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs border border-green-500/20"><Play className="w-3 h-3" /> Resume</button>
                    )}
                    <button onClick={() => api.retryQueueFailures(projectId, queue.id).then(() => refetch())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20"><RotateCcw className="w-3 h-3" /> Retry Failed</button>
                    <button onClick={() => api.clearCompletedJobs(projectId, queue.id).then(() => refetch())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs border border-red-500/20"><Trash2 className="w-3 h-3" /> Clear Completed</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Waiting', key: 'QUEUED' }, { label: 'Running', key: 'RUNNING' },
                    { label: 'Completed', key: 'COMPLETED' }, { label: 'Failed', key: 'FAILED' },
                    { label: 'Concurrency', key: null, value: queue.concurrencyLimit },
                  ].map((s) => (
                    <div key={s.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold tabular-nums">{s.value ?? queue.stats[s.key!] ?? 0}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {projectId && <CreateQueueModal open={createOpen} onClose={() => setCreateOpen(false)} projectId={projectId} onCreated={() => refetch()} />}
      {editQueue && projectId && (
        <EditQueueModal open={!!editQueue} onClose={() => setEditQueue(null)} projectId={projectId} queue={editQueue} onUpdated={() => refetch()} />
      )}
    </AppShell>
  );
}

export default function QueuesPage() {
  return <Suspense fallback={<LoadingSkeleton />}><QueuesContent /></Suspense>;
}
