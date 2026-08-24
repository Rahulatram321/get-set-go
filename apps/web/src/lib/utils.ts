import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  SCHEDULED: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  CLAIMED: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  RUNNING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  COMPLETED: 'bg-green-500/20 text-green-400 border-green-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  RETRY_SCHEDULED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  DEAD_LETTER: 'bg-red-500/20 text-red-300 border-red-500/30',
  CANCELLED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
  PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  IDLE: 'bg-green-500/20 text-green-400 border-green-500/30',
  BUSY: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  UNHEALTHY: 'bg-red-500/20 text-red-400 border-red-500/30',
  healthy: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  offline: 'bg-red-500/20 text-red-400',
};
