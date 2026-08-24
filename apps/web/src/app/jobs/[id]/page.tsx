'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { StatusBadge, LoadingSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDuration, formatRelativeTime } from '@/lib/utils';

function JobDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const jobId = params.id as string;
  const projectId = searchParams.get('project') ?? '';
  const [analysis, setAnalysis] = useState<{
    summary: string; probableCause: string; suggestedFix: string; retryRecommendation: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!api.getToken()) router.push('/');
  }, [router]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['job', projectId, jobId],
    queryFn: () => api.getJob(projectId, jobId),
    enabled: !!projectId && !!jobId,
  });

  const job = data?.data as {
    id: string; name: string; status: string; priority: number;
    attemptNumber: number; maxAttempts: number; payload: Record<string, unknown>;
    errorMessage: string | null; executionDurationMs: number | null;
    queue: { name: string };
    executions: Array<{ attemptNumber: number; status: string; durationMs: number | null; startedAt: string }>;
    logs: Array<{ level: string; message: string; createdAt: string }>;
  } | undefined;

  async function runAnalysis() {
    setAnalyzing(true);
    const res = await api.analyzeJob(projectId, jobId);
    setAnalysis((res.data as { analysis: typeof analysis })?.analysis ?? null);
    setAnalyzing(false);
  }

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      {isLoading ? <LoadingSkeleton rows={8} /> : !job ? <p>Job not found</p> : (
        <div className="space-y-6 animate-fade-in max-w-4xl">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{job.name}</h1>
              <p className="text-xs font-mono text-muted-foreground mt-1">{job.id}</p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={job.status} />
              {['FAILED', 'DEAD_LETTER'].includes(job.status) && (
                <>
                  <button onClick={() => api.retryJob(projectId, jobId).then(() => refetch())} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs border border-primary/20">Retry</button>
                  <button onClick={runAnalysis} disabled={analyzing} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-xs border border-purple-500/20">
                    <Sparkles className="w-3 h-3" />{analyzing ? 'Analyzing...' : 'AI Analysis'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Queue', value: job.queue.name },
              { label: 'Priority', value: job.priority },
              { label: 'Attempts', value: `${job.attemptNumber}/${job.maxAttempts}` },
              { label: 'Duration', value: formatDuration(job.executionDurationMs) },
            ].map((s) => (
              <div key={s.label} className="gradient-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-medium mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {job.errorMessage && (
            <div className="gradient-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
              <p className="text-sm font-mono text-red-300">{job.errorMessage}</p>
            </div>
          )}

          {analysis && (
            <div className="gradient-border rounded-xl p-4 border-purple-500/20">
              <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Failure Analysis</h3>
              <div className="space-y-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Summary</p><p>{analysis.summary}</p></div>
                <div><p className="text-muted-foreground text-xs">Probable Cause</p><p>{analysis.probableCause}</p></div>
                <div><p className="text-muted-foreground text-xs">Suggested Fix</p><p>{analysis.suggestedFix}</p></div>
                <div><p className="text-muted-foreground text-xs">Retry Recommendation</p><p className="text-amber-400">{analysis.retryRecommendation}</p></div>
              </div>
            </div>
          )}

          <div className="gradient-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Payload</h3>
            <pre className="text-xs font-mono bg-muted/30 p-3 rounded-lg overflow-x-auto">{JSON.stringify(job.payload, null, 2)}</pre>
          </div>

          <div className="gradient-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Execution History</h3>
            <div className="space-y-2">
              {job.executions.map((ex) => (
                <div key={ex.attemptNumber} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                  <span>Attempt #{ex.attemptNumber}</span>
                  <StatusBadge status={ex.status} />
                  <span className="text-muted-foreground">{formatDuration(ex.durationMs)}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(ex.startedAt)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="gradient-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Logs</h3>
            <div className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto bg-muted/20 p-3 rounded-lg">
              {job.logs.map((log, i) => (
                <div key={i} className={log.level === 'error' ? 'text-red-400' : 'text-foreground'}>
                  <span className="text-muted-foreground">[{formatRelativeTime(log.createdAt)}]</span> {log.message}
                </div>
              ))}
              {job.logs.length === 0 && <p className="text-muted-foreground">No logs yet</p>}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function JobDetailPage() {
  return <Suspense fallback={<LoadingSkeleton />}><JobDetailContent /></Suspense>;
}
