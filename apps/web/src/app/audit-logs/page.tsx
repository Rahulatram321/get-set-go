'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

function AuditLogsContent() {
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
    queryKey: ['audit-logs', projectId],
    queryFn: () => api.getAuditLogs(projectId),
    enabled: !!projectId,
  });

  const logs = (data?.data as Array<{
    id: string; action: string; resource: string; resourceId: string | null;
    createdAt: string; metadata: Record<string, unknown>;
    user: { name: string; email: string } | null;
  }>) ?? [];

  return (
    <AppShell projectId={projectId} onRefresh={() => refetch()}>
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Track all important actions in this project</p>
        </div>

        {isLoading ? <LoadingSkeleton /> : logs.length === 0 ? (
          <EmptyState title="No audit logs" description="Actions like queue changes and job retries will appear here" />
        ) : (
          <div className="gradient-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Time', 'User', 'Action', 'Resource', 'Details'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(log.createdAt)}</td>
                    <td className="px-4 py-3">{log.user?.name ?? 'System'}</td>
                    <td className="px-4 py-3"><span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{log.action}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{log.resource}{log.resourceId && <span className="font-mono text-xs ml-1">({log.resourceId.slice(0, 8)})</span>}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground truncate max-w-xs">{JSON.stringify(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function AuditLogsPage() {
  return <Suspense fallback={<LoadingSkeleton />}><AuditLogsContent /></Suspense>;
}
