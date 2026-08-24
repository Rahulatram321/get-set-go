'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, RefreshCw, LayoutDashboard, ListTodo, Layers, Cpu,
  BarChart3, AlertTriangle, Settings, Command, Plus, ScrollText, Package,
} from 'lucide-react';
import { ThemeToggle, HelpModal } from '@/components/modals';

interface CommandPaletteProps {
  projectId?: string;
  onRefresh?: () => void;
  onCreateJob?: () => void;
  onCreateQueue?: () => void;
}

export function CommandPalette({ projectId, onRefresh, onCreateJob, onCreateQueue }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  const qs = projectId ? `?project=${projectId}` : '';

  const commands = [
    { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, action: () => projectId && router.push(`/dashboard${qs}`) },
    { id: 'jobs', label: 'Go to Jobs', icon: ListTodo, action: () => projectId && router.push(`/jobs${qs}`) },
    { id: 'queues', label: 'Go to Queues', icon: Layers, action: () => projectId && router.push(`/queues${qs}`) },
    { id: 'workers', label: 'Go to Workers', icon: Cpu, action: () => router.push('/workers') },
    { id: 'metrics', label: 'Go to Metrics', icon: BarChart3, action: () => projectId && router.push(`/metrics${qs}`) },
    { id: 'dlq', label: 'Go to Dead Letter Queue', icon: AlertTriangle, action: () => projectId && router.push(`/dlq${qs}`) },
    { id: 'audit', label: 'Go to Audit Logs', icon: ScrollText, action: () => projectId && router.push(`/audit-logs${qs}`) },
    { id: 'batches', label: 'Go to Batches', icon: Package, action: () => projectId && router.push(`/batches${qs}`) },
    { id: 'create-job', label: 'Create Job', icon: Plus, action: () => onCreateJob?.() },
    { id: 'create-queue', label: 'Create Queue', icon: Plus, action: () => onCreateQueue?.() },
    { id: 'refresh', label: 'Refresh Data', icon: RefreshCw, action: () => onRefresh?.() },
    { id: 'settings', label: 'Settings', icon: Settings, action: () => router.push('/settings') },
  ];

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <button onClick={() => setOpen(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors">
        <Command className="w-3 h-3" /><span>Search...</span>
        <kbd className="ml-4 text-xs bg-background px-1.5 py-0.5 rounded border">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commands..." className="flex-1 bg-transparent outline-none text-sm" />
            </div>
            <div className="max-h-64 overflow-y-auto py-2">
              {filtered.map((cmd) => (
                <button key={cmd.id} onClick={() => { cmd.action(); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left">
                  <cmd.icon className="w-4 h-4 text-muted-foreground" />{cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar({ projectId }: { projectId?: string }) {
  const qs = projectId ? `?project=${projectId}` : '';
  const links = [
    { href: `/dashboard${qs}`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/jobs${qs}`, label: 'Jobs', icon: ListTodo },
    { href: `/queues${qs}`, label: 'Queues', icon: Layers },
    { href: `/batches${qs}`, label: 'Batches', icon: Package },
    { href: '/workers', label: 'Workers', icon: Cpu },
    { href: `/metrics${qs}`, label: 'Metrics', icon: BarChart3 },
    { href: `/dlq${qs}`, label: 'Dead Letter', icon: AlertTriangle },
    { href: `/audit-logs${qs}`, label: 'Audit Logs', icon: ScrollText },
  ];

  return (
    <aside className="w-56 border-r border-border bg-card/50 flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OQ</span>
          </div>
          <div>
            <p className="font-semibold text-sm">OrbitQueue</p>
            <p className="text-xs text-muted-foreground">Job Scheduler</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <link.icon className="w-4 h-4" />{link.label}
          </a>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <a href="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50">
          <Settings className="w-4 h-4" />Settings
        </a>
      </div>
    </aside>
  );
}

export function AppShell({
  children, projectId, onRefresh, onCreateJob, onCreateQueue,
}: {
  children: React.ReactNode; projectId?: string; onRefresh?: () => void;
  onCreateJob?: () => void; onCreateQueue?: () => void;
}) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const qs = projectId ? `?project=${projectId}` : '';

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); return; }
    if (e.key === '?' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); setHelpOpen(true); return; }
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') { onRefresh?.(); return; }

    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    if (e.key === 'g') { setGPressed(true); setTimeout(() => setGPressed(false), 1000); return; }
    if (gPressed) {
      const routes: Record<string, string> = {
        j: `/jobs${qs}`, q: `/queues${qs}`, w: '/workers', m: `/metrics${qs}`,
        d: `/dashboard${qs}`, a: `/audit-logs${qs}`, b: `/batches${qs}`,
      };
      if (routes[e.key]) { e.preventDefault(); router.push(routes[e.key]); setGPressed(false); }
    }
  }, [gPressed, onRefresh, qs, router]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projectId={projectId} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/30 backdrop-blur-sm">
          <div />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => setHelpOpen(true)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground text-xs" title="Keyboard shortcuts">?</button>
            <CommandPalette projectId={projectId} onRefresh={onRefresh} onCreateJob={onCreateJob} onCreateQueue={onCreateQueue} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
