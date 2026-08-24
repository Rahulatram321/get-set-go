'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout';
import { FormField, inputClass } from '@/components/modals';
import { api, resolveProjectId } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');
  const [orgId, setOrgId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('DEVELOPER');
  const [inviteMsg, setInviteMsg] = useState('');
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyMsg, setKeyMsg] = useState('');

  useEffect(() => {
    if (!api.getToken()) router.push('/');
    else resolveProjectId().then((r) => { if (r) { setProjectId(r.projectId); setOrgId(r.orgId); } });
  }, [router]);

  const { data: membersData, refetch: refetchMembers } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.getProjectMembers(projectId),
    enabled: !!projectId,
  });

  const { data: keysData, refetch: refetchKeys } = useQuery({
    queryKey: ['api-keys', projectId],
    queryFn: () => api.getApiKeys(projectId),
    enabled: !!projectId,
  });

  const members = (membersData?.data as Array<{ id: string; role: string; user: { name: string; email: string } }>) ?? [];
  const keys = (keysData?.data as Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }>) ?? [];

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg('');
    const res = await api.inviteProjectMember(projectId, inviteEmail, inviteRole);
    setInviteMsg(res.success ? `Invited ${inviteEmail}` : (res.error?.message ?? 'Failed'));
    if (res.success) { setInviteEmail(''); refetchMembers(); }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyMsg('');
    const res = await api.createApiKey(projectId, keyName);
    if (res.success && res.data) {
      setNewKey((res.data as { key: string }).key);
      setKeyName('');
      refetchKeys();
    } else {
      setKeyMsg(res.error?.message ?? 'Failed');
    }
  }

  function logout() {
    api.setToken(null);
    router.push('/');
  }

  return (
    <AppShell projectId={projectId}>
      <div className="max-w-2xl space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Team, API keys, and preferences</p>
        </div>

        <section className="gradient-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Invite Team Member</h2>
          <p className="text-xs text-muted-foreground">User must already have an OrbitQueue account</p>
          <form onSubmit={inviteMember} className="flex gap-3 flex-wrap">
            <input className={inputClass + ' flex-1 min-w-[200px]'} type="email" placeholder="email@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <select className={inputClass + ' w-36'} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              {['ADMIN', 'OPERATOR', 'DEVELOPER', 'VIEWER'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Invite</button>
          </form>
          {inviteMsg && <p className="text-sm text-green-400">{inviteMsg}</p>}
          <div className="space-y-2 pt-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                <div><p>{m.user.name}</p><p className="text-xs text-muted-foreground">{m.user.email}</p></div>
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{m.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="gradient-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">API Keys</h2>
          <p className="text-xs text-muted-foreground">Use as <code className="bg-muted px-1 rounded">Authorization: Bearer oq_...</code> or <code className="bg-muted px-1 rounded">X-API-Key</code> header</p>
          <form onSubmit={createKey} className="flex gap-3">
            <input className={inputClass + ' flex-1'} placeholder="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} required />
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">Create Key</button>
          </form>
          {newKey && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 mb-1">Copy this key now — it won&apos;t be shown again:</p>
              <code className="text-xs font-mono break-all">{newKey}</code>
            </div>
          )}
          {keyMsg && <p className="text-sm text-red-400">{keyMsg}</p>}
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                <div><p>{k.name}</p><p className="text-xs font-mono text-muted-foreground">{k.prefix}...</p></div>
                <button onClick={() => api.revokeApiKey(projectId, k.id).then(() => refetchKeys())} className="text-xs text-red-400 hover:underline">Revoke</button>
              </div>
            ))}
          </div>
        </section>

        <section className="gradient-border rounded-xl p-5">
          <button onClick={logout} className="w-full py-2 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20 hover:bg-destructive/20">
            Sign out
          </button>
        </section>
      </div>
    </AppShell>
  );
}
