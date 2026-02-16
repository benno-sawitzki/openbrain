import type { Task, Lead, ContentItem, AppState } from './types';
import { supabase, isCloudMode } from './supabase';

const json = (r: Response) => r.json();

// In cloud mode, add the auth token to all API requests.
// Use getSession() first (fast, cached), only refreshSession() if expired.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function authHeaders(): Promise<Record<string, string>> {
  if (!isCloudMode || !supabase) return {};
  const now = Date.now() / 1000;
  // Return cached token if still valid (with 30s buffer)
  if (cachedToken && now < tokenExpiresAt - 30) {
    return { Authorization: `Bearer ${cachedToken}` };
  }
  // Try cached session first (instant, no network)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session.expires_at && now < session.expires_at - 30) {
    cachedToken = session.access_token;
    tokenExpiresAt = session.expires_at;
    return { Authorization: `Bearer ${session.access_token}` };
  }
  // Token expired — try refresh (but don't crash if it fails)
  if (session?.refresh_token) {
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed?.access_token) {
        cachedToken = refreshed.access_token;
        tokenExpiresAt = refreshed.expires_at || 0;
        return { Authorization: `Bearer ${refreshed.access_token}` };
      }
    } catch {}
  }
  // Last resort: use whatever token we have (even if expired — server will reject, but won't log us out)
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...init?.headers, ...(await authHeaders()) };
  return fetch(url, { ...init, headers });
}

export interface ModuleInfo {
  provider: string;   // e.g. 'todoist', 'taskpipe'
  name: string;       // e.g. 'Todoist', 'Taskpipe'
  writable: boolean;
}

export type Modules = {
  tasks?: ModuleInfo | false;
  crm?: ModuleInfo | false;
  content?: ModuleInfo | false;
  // Legacy compat — old boolean format
  [key: string]: ModuleInfo | false | undefined;
};

export const fetchModules = (): Promise<Modules> =>
  apiFetch('/api/modules').then(json);

// Check if a slot is active (works with both old boolean and new ModuleInfo format)
export function slotActive(modules: Modules | undefined, slot: 'tasks' | 'crm' | 'content'): boolean {
  if (!modules) return false;
  const val = modules[slot];
  if (val === false) return false;
  if (val && typeof val === 'object') return true;
  // Legacy compat: check old keys
  const legacyMap: Record<string, string> = { tasks: 'taskpipe', crm: 'leadpipe', content: 'contentq' };
  const legacy = modules[legacyMap[slot]];
  return legacy !== false && legacy !== undefined;
}

export async function fetchAll(modules?: Modules): Promise<AppState> {
  const [tasks, leads, content, activity, stats, config, inbox, agents] = await Promise.all([
    slotActive(modules, 'tasks') ? apiFetch('/api/tasks').then(json) : [],
    slotActive(modules, 'crm') ? apiFetch('/api/leads').then(json) : [],
    slotActive(modules, 'content') ? apiFetch('/api/content').then(json) : [],
    apiFetch('/api/activity').then(json),
    apiFetch('/api/stats').then(json),
    apiFetch('/api/config').then(json),
    slotActive(modules, 'content') ? apiFetch('/api/inbox').then(json) : [],
    apiFetch('/api/agents').then(json),
  ]);
  return { tasks, leads, content, inbox, activity, stats, config, agents } as AppState;
}

export const createTask = async (body: Partial<Task>) =>
  apiFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const updateTask = async (id: string, body: Partial<Task>) =>
  apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const deleteTask = async (id: string) =>
  apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const moveTask = async (id: string, status: string) =>
  apiFetch(`/api/tasks/${encodeURIComponent(id)}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(json);

export const reorderTasks = async (ids: string[]) =>
  apiFetch('/api/tasks/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });

export const fetchTaskSpec = async (id: string): Promise<{ links: Record<string, string>; specs: Record<string, string> }> =>
  apiFetch(`/api/tasks/${encodeURIComponent(id)}/spec`).then(json);

export const createLead = async (body: Partial<Lead>) =>
  apiFetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const updateLead = async (id: string, body: Partial<Lead>) =>
  apiFetch(`/api/leads/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const deleteLead = async (id: string) =>
  apiFetch(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const moveLead = async (id: string, stage: string) =>
  apiFetch(`/api/leads/${encodeURIComponent(id)}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }) }).then(json);

export const createContent = async (body: Partial<ContentItem>) =>
  apiFetch('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const updateContent = async (id: string, body: Partial<ContentItem>) =>
  apiFetch(`/api/content/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

// Cron endpoints
export const fetchCronJobs = (): Promise<any> =>
  apiFetch('/api/cron/jobs').then(json);

export const toggleCronJob = (id: string, enabled: boolean): Promise<any> =>
  apiFetch(`/api/cron/jobs/${encodeURIComponent(id)}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }).then(json);

export const runCronJob = (id: string): Promise<any> =>
  apiFetch(`/api/cron/jobs/${encodeURIComponent(id)}/run`, { method: 'POST' }).then(json);

export const deleteCronJob = (id: string): Promise<any> =>
  apiFetch(`/api/cron/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json);

export const createCronJob = (body: any): Promise<any> =>
  apiFetch('/api/cron/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

// Calendar, Feed, and other data endpoints
export const fetchCalendar = (): Promise<any> =>
  apiFetch('/api/calendar').then(json);

export const fetchFeed = (): Promise<any> =>
  apiFetch('/api/feed').then(json);

export const fetchDaily = (): Promise<any> =>
  apiFetch('/api/daily').then(json);

export const fetchRevenue = (): Promise<any> =>
  apiFetch('/api/revenue').then(json);

export const fetchBrain = (): Promise<any> =>
  apiFetch('/api/agent/brain').then(json);

export const fetchMemoryTimeline = (): Promise<any> =>
  apiFetch('/api/memory/timeline').then(json);

export const testGateway = (body: any): Promise<Response> =>
  apiFetch('/api/gateway/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Gateway-powered endpoints
export const fetchGatewayInfo = (): Promise<{ enabled: boolean; connected: boolean }> =>
  apiFetch('/api/gateway/info').then(json);

export const fetchGatewaySessions = (): Promise<any> =>
  apiFetch('/api/gateway/sessions').then(json);

export const fetchGatewayHealth = (): Promise<any> =>
  apiFetch('/api/gateway/health').then(json);

export const fetchGatewaySkills = (): Promise<any> =>
  apiFetch('/api/gateway/skills').then(json);

// --- Workflow API ---
export const fetchWorkflowDefs = (): Promise<any[]> =>
  apiFetch('/api/wf/definitions').then(json);

export const fetchWorkflowRuns = (filter?: { workflowId?: string; status?: string }): Promise<any[]> => {
  const params = new URLSearchParams();
  if (filter?.workflowId) params.set('workflowId', filter.workflowId);
  if (filter?.status) params.set('status', filter.status);
  const qs = params.toString();
  return apiFetch(`/api/wf/runs${qs ? '?' + qs : ''}`).then(json);
};

export const fetchWorkflowRun = (id: string): Promise<any> =>
  apiFetch(`/api/wf/runs/${encodeURIComponent(id)}`).then(json);

export const createWorkflowDef = (body: any): Promise<any> =>
  apiFetch('/api/wf/definitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

export const startWorkflowRun = (workflowId: string, task: string): Promise<any> =>
  apiFetch('/api/wf/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflowId, task }) }).then(json);

export const resumeWorkflowRun = (id: string): Promise<any> =>
  apiFetch(`/api/wf/runs/${encodeURIComponent(id)}/resume`, { method: 'POST' }).then(json);

export const pauseWorkflowRun = (id: string): Promise<any> =>
  apiFetch(`/api/wf/runs/${encodeURIComponent(id)}/pause`, { method: 'POST' }).then(json);

export const cancelWorkflowRun = (id: string): Promise<any> =>
  apiFetch(`/api/wf/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json);

// Provider configuration endpoints
export const fetchProviderRegistry = (): Promise<any> =>
  apiFetch('/api/providers').then(json);

export const fetchProviderConfig = (): Promise<any> =>
  apiFetch('/api/provider-config').then(json);

export const saveProviderConfig = (config: any): Promise<any> =>
  apiFetch('/api/provider-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }).then(json);

export const testProviderConnection = (providerId: string, config: any): Promise<any> =>
  apiFetch('/api/provider-config/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId, config }) }).then(json);

// Settings page endpoints
export const fetchSyncStatus = (): Promise<any> =>
  apiFetch('/api/sync/status').then(json);

export const reconnectGateway = (): Promise<any> =>
  apiFetch('/api/gateway/reconnect', { method: 'POST' }).then(json);

export const deleteAccount = (): Promise<any> =>
  apiFetch('/api/account', { method: 'DELETE' }).then(json);
