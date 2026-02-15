import type { Task, Lead, ContentItem, AppState } from './types';
import { supabase, isCloudMode } from './supabase';

const json = (r: Response) => r.json();

// In cloud mode, add the auth token to all API requests.
// getSession() can return stale/expired tokens from cache, so we
// call getUser() first which forces a server-side refresh if needed.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function authHeaders(): Promise<Record<string, string>> {
  if (!isCloudMode || !supabase) return {};
  const now = Date.now() / 1000;
  if (cachedToken && now < tokenExpiresAt - 30) {
    return { Authorization: `Bearer ${cachedToken}` };
  }
  // Force refresh by getting user (validates + refreshes token)
  const { data: { session } } = await supabase.auth.refreshSession();
  if (!session?.access_token) {
    // Fallback to getSession if refresh fails
    const { data: { session: fallback } } = await supabase.auth.getSession();
    if (!fallback?.access_token) return {};
    cachedToken = fallback.access_token;
    tokenExpiresAt = fallback.expires_at || 0;
    return { Authorization: `Bearer ${fallback.access_token}` };
  }
  cachedToken = session.access_token;
  tokenExpiresAt = session.expires_at || 0;
  return { Authorization: `Bearer ${session.access_token}` };
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...init?.headers, ...(await authHeaders()) };
  return fetch(url, { ...init, headers });
}

export async function fetchAll(): Promise<AppState> {
  const [tasks, leads, content, activity, stats, config, inbox, agents] = await Promise.all([
    apiFetch('/api/tasks').then(json),
    apiFetch('/api/leads').then(json),
    apiFetch('/api/content').then(json),
    apiFetch('/api/activity').then(json),
    apiFetch('/api/stats').then(json),
    apiFetch('/api/config').then(json),
    apiFetch('/api/inbox').then(json),
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
