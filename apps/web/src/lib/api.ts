const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('oq_token', token);
      else localStorage.removeItem('oq_token');
    }
  }

  getToken() {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('oq_token');
    }
    return this.token;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    return res.json();
  }

  login(email: string, password: string) {
    return this.request<{ accessToken: string; user: { id: string; email: string; name: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
    );
  }

  register(email: string, password: string, name: string) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  }

  getMe() {
    return this.request<{ id: string; email: string; name: string }>('/auth/me');
  }

  getOrganizations() {
    return this.request<Array<{ id: string; name: string; slug: string }>>('/organizations');
  }

  getProjects(orgId: string) {
    return this.request<Array<{ id: string; name: string; slug: string }>>(`/organizations/${orgId}/projects`);
  }

  getDashboard(projectId: string) {
    return this.request(`/projects/${projectId}/dashboard`);
  }

  getQueues(projectId: string) {
    return this.request(`/projects/${projectId}/queues`);
  }

  createQueue(projectId: string, data: unknown) {
    return this.request(`/projects/${projectId}/queues`, { method: 'POST', body: JSON.stringify(data) });
  }

  updateQueue(projectId: string, queueId: string, data: unknown) {
    return this.request(`/projects/${projectId}/queues/${queueId}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  pauseQueue(projectId: string, queueId: string) {
    return this.request(`/projects/${projectId}/queues/${queueId}/pause`, { method: 'PATCH' });
  }

  resumeQueue(projectId: string, queueId: string) {
    return this.request(`/projects/${projectId}/queues/${queueId}/resume`, { method: 'PATCH' });
  }

  drainQueue(projectId: string, queueId: string) {
    return this.request(`/projects/${projectId}/queues/${queueId}/drain`, { method: 'PATCH' });
  }

  retryQueueFailures(projectId: string, queueId: string) {
    return this.request(`/projects/${projectId}/queues/${queueId}/retry-failures`, { method: 'POST' });
  }

  clearCompletedJobs(projectId: string, queueId: string) {
    return this.request(`/projects/${projectId}/queues/${queueId}/completed`, { method: 'DELETE' });
  }

  getJobs(projectId: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`/projects/${projectId}/jobs${qs}`);
  }

  getJob(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}`);
  }

  createJob(projectId: string, data: unknown) {
    return this.request(`/projects/${projectId}/jobs`, { method: 'POST', body: JSON.stringify(data) });
  }

  createBatchJobs(projectId: string, data: unknown) {
    return this.request(`/projects/${projectId}/jobs/batch`, { method: 'POST', body: JSON.stringify(data) });
  }

  retryJob(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}/retry`, { method: 'POST' });
  }

  analyzeJob(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}/analyze`);
  }

  getWorkers() {
    return this.request('/workers');
  }

  getDlq(projectId: string) {
    return this.request(`/projects/${projectId}/dlq`);
  }

  getMetrics(projectId: string, range = '24h') {
    return this.request(`/projects/${projectId}/metrics?range=${range}`);
  }

  getAuditLogs(projectId: string, page = 1) {
    return this.request(`/projects/${projectId}/audit-logs?page=${page}&limit=50`);
  }

  getBatches(projectId: string) {
    return this.request(`/projects/${projectId}/batches`);
  }

  getBatch(projectId: string, batchId: string) {
    return this.request(`/projects/${projectId}/batches/${batchId}`);
  }

  getProjectMembers(projectId: string) {
    return this.request(`/projects/${projectId}/members`);
  }

  inviteProjectMember(projectId: string, email: string, role: string) {
    return this.request(`/projects/${projectId}/members/invite`, {
      method: 'POST', body: JSON.stringify({ email, role }),
    });
  }

  getOrgMembers(orgId: string) {
    return this.request(`/organizations/${orgId}/members`);
  }

  inviteOrgMember(orgId: string, email: string, role: string) {
    return this.request(`/organizations/${orgId}/members/invite`, {
      method: 'POST', body: JSON.stringify({ email, role }),
    });
  }

  getApiKeys(projectId: string) {
    return this.request(`/projects/${projectId}/api-keys`);
  }

  createApiKey(projectId: string, name: string, expiresInDays?: number) {
    return this.request(`/projects/${projectId}/api-keys`, {
      method: 'POST', body: JSON.stringify({ name, expiresInDays }),
    });
  }

  revokeApiKey(projectId: string, keyId: string) {
    return this.request(`/projects/${projectId}/api-keys/${keyId}`, { method: 'DELETE' });
  }

  getWorkflows(projectId: string) {
    return this.request(`/projects/${projectId}/workflows`);
  }

  createWorkflow(projectId: string, data: unknown) {
    return this.request(`/projects/${projectId}/workflows`, { method: 'POST', body: JSON.stringify(data) });
  }

  getSystemEvents() {
    return this.request('/system/events?limit=20');
  }
}

export const api = new ApiClient();

export async function resolveProjectId(): Promise<{ projectId: string; orgId: string } | null> {
  const orgs = await api.getOrganizations();
  if (!orgs.data?.[0]) return null;
  const orgId = orgs.data[0].id;
  const projects = await api.getProjects(orgId);
  if (!projects.data?.[0]) return null;
  return { projectId: projects.data[0].id, orgId };
}
