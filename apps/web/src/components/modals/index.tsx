'use client';

import { useState } from 'react';
import { X, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl animate-fade-in', className)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export const inputClass = 'w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/50';

export function CreateJobModal({
  open, onClose, projectId, queues, onCreated,
}: {
  open: boolean; onClose: () => void; projectId: string;
  queues: Array<{ name: string }>; onCreated: () => void;
}) {
  const [name, setName] = useState('send-welcome-email');
  const [queue, setQueue] = useState(queues[0]?.name ?? 'email');
  const [payload, setPayload] = useState('{"email":"user@example.com"}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try { JSON.parse(payload); } catch { setError('Invalid JSON payload'); setLoading(false); return; }
    const res = await api.createJob(projectId, { queue, name, payload: JSON.parse(payload), schedule: { type: 'immediate' } });
    if (!res.success) { setError(res.error?.message ?? 'Failed'); setLoading(false); return; }
    onCreated(); onClose(); setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Job">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <FormField label="Job Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></FormField>
        <FormField label="Queue">
          <select className={inputClass} value={queue} onChange={(e) => setQueue(e.target.value)}>
            {queues.map((q) => <option key={q.name} value={q.name}>{q.name}</option>)}
          </select>
        </FormField>
        <FormField label="Payload (JSON)">
          <textarea className={cn(inputClass, 'font-mono h-24')} value={payload} onChange={(e) => setPayload(e.target.value)} />
        </FormField>
        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Job'}
        </button>
      </form>
    </Modal>
  );
}

export function CreateQueueModal({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [concurrencyLimit, setConcurrencyLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await api.createQueue(projectId, { name, description, concurrencyLimit });
    if (!res.success) { setError(res.error?.message ?? 'Failed'); setLoading(false); return; }
    onCreated(); onClose(); setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Queue">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <FormField label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="my-queue" required /></FormField>
        <FormField label="Description"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        <FormField label="Concurrency Limit"><input type="number" className={inputClass} value={concurrencyLimit} onChange={(e) => setConcurrencyLimit(Number(e.target.value))} min={1} /></FormField>
        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Create Queue</button>
      </form>
    </Modal>
  );
}

export function EditQueueModal({ open, onClose, projectId, queue, onUpdated }: {
  open: boolean; onClose: () => void; projectId: string;
  queue: { id: string; description: string; concurrencyLimit: number; maxAttempts: number };
  onUpdated: () => void;
}) {
  const [description, setDescription] = useState(queue.description ?? '');
  const [concurrencyLimit, setConcurrencyLimit] = useState(queue.concurrencyLimit);
  const [maxAttempts, setMaxAttempts] = useState(queue.maxAttempts);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await api.updateQueue(projectId, queue.id, { description, concurrencyLimit, maxAttempts });
    onUpdated(); onClose(); setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Queue">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Description"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        <FormField label="Concurrency Limit"><input type="number" className={inputClass} value={concurrencyLimit} onChange={(e) => setConcurrencyLimit(Number(e.target.value))} min={1} /></FormField>
        <FormField label="Max Attempts"><input type="number" className={inputClass} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} min={1} /></FormField>
        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Save Changes</button>
      </form>
    </Modal>
  );
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shortcuts = [
    { keys: '⌘K', desc: 'Command palette' }, { keys: 'R', desc: 'Refresh data' },
    { keys: 'G then J', desc: 'Go to Jobs' }, { keys: 'G then Q', desc: 'Go to Queues' },
    { keys: 'G then W', desc: 'Go to Workers' }, { keys: 'G then M', desc: 'Go to Metrics' },
    { keys: 'G then D', desc: 'Go to Dashboard' }, { keys: 'G then A', desc: 'Go to Audit Logs' },
    { keys: '?', desc: 'Show this help' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.keys} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <span className="text-sm text-muted-foreground">{s.desc}</span>
            <kbd className="text-xs bg-muted px-2 py-1 rounded border font-mono">{s.keys}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" aria-label="Toggle theme">
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
