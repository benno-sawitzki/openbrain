#!/usr/bin/env node
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { initLocalGateway, getLocalGateway, gatewayPool, GatewayClient } from './gateway';
import type { GatewayConfig } from './gateway';
import { LocalWorkflowStorage, CloudWorkflowStorage } from './workflows/storage';
import { WorkflowEngine } from './workflows/engine';
import { createWorkflowRouter } from './workflows/routes';
import { resolveProviders, getModulesResponse } from './providers/resolve';
import type { ResolvedProviders } from './providers/resolve';
import { PROVIDER_REGISTRY, SLOTS, SLOT_LABELS, getProvidersForSlot } from './providers/registry';
import type { Slot } from './providers/registry';

// Load .env file if present (no dependency needed)
const envPath = path.join(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const app = express();
const PORT = parseInt(process.env.MARKETING_HQ_PORT || '4000', 10);
const SERVER_START = Date.now();

// Cloud mode: Supabase is configured
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const IS_CLOUD = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);
const supabase = IS_CLOUD ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

// Track IDs deleted via cloud UI so local sync doesn't re-add them
const cloudDeletedIds = new Map<string, Set<string>>(); // key: "workspaceId:dataType" → Set of deleted IDs

function trackCloudDeletion(workspaceId: string, dataType: string, id: string) {
  const key = `${workspaceId}:${dataType}`;
  if (!cloudDeletedIds.has(key)) cloudDeletedIds.set(key, new Set());
  cloudDeletedIds.get(key)!.add(id);
}

// Merge local array data with cloud array data by ID, keeping newer updatedAt
function mergeArrayData(localItems: any[], cloudItems: any[], deletedIds: Set<string> | undefined): any[] {
  const merged = new Map<string, any>();
  // Start with cloud items (these are the "truth" for cloud-edited items)
  for (const item of cloudItems) {
    if (item.id) merged.set(item.id, item);
  }
  // Merge local items: add new ones, update existing only if local is newer
  for (const item of localItems) {
    if (!item.id) continue;
    if (deletedIds?.has(item.id)) continue; // Don't re-add cloud-deleted items
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item); // New item from local
    } else {
      // Keep whichever has the newer updatedAt
      const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
      const cloudTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (localTime > cloudTime) {
        merged.set(item.id, item);
      }
    }
  }
  return Array.from(merged.values());
}

// Per-workspace write lock to prevent concurrent read-modify-write races
// (e.g., sync endpoint + cloud UI move endpoint interleaving)
const writeLocks = new Map<string, Promise<void>>();

async function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (writeLocks.has(key)) {
    await writeLocks.get(key);
  }
  let resolve: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  writeLocks.set(key, promise);
  try {
    return await fn();
  } finally {
    writeLocks.delete(key);
    resolve!();
  }
}

// Local mode: direct Gateway connection
if (!IS_CLOUD) {
  initLocalGateway();
}

// Auth middleware for cloud mode — extracts user from Bearer token
async function resolveUser(req: express.Request): Promise<{ userId: string; workspaceId: string; gatewayConfig: GatewayConfig | null } | null> {
  if (!IS_CLOUD || !supabase) return null;
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: workspace } = await supabase.from('workspaces').select('*').eq('user_id', user.id).single();
  if (!workspace) return null;
  const gatewayConfig = workspace.gateway_url && workspace.gateway_token
    ? { url: workspace.gateway_url, token: workspace.gateway_token }
    : null;
  return { userId: user.id, workspaceId: workspace.id, gatewayConfig };
}

// Get the gateway client for the current request (local or cloud)
async function getGatewayForRequest(req: express.Request): Promise<GatewayClient | null> {
  if (!IS_CLOUD) {
    return getLocalGateway();
  }
  const user = await resolveUser(req);
  if (!user?.gatewayConfig) return null;
  try {
    return await gatewayPool.getOrConnect(user.workspaceId, user.gatewayConfig);
  } catch (e: any) {
    console.error('[gateway] Pool connect failed:', e.message);
    return null;
  }
}

// Read synced data from Supabase (cloud mode)
async function readSyncedData(req: express.Request, dataType: string): Promise<any | null> {
  if (!IS_CLOUD || !supabase) return null;
  const user = await resolveUser(req);
  if (!user) return null;
  const { data } = await supabase
    .from('workspace_data')
    .select('data')
    .eq('workspace_id', user.workspaceId)
    .eq('data_type', dataType)
    .single();
  return data?.data ?? null;
}

async function writeSyncedData(req: express.Request, dataType: string, payload: any): Promise<boolean> {
  if (!IS_CLOUD || !supabase) return false;
  const user = await resolveUser(req);
  if (!user) return false;
  const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown';
  console.log(`[WRITE] writeSyncedData(${dataType}) from: ${caller}`);
  if (dataType === 'leads' && Array.isArray(payload)) {
    for (const l of payload) console.log(`[WRITE]   ${l.name}: stage=${l.stage}`);
  }
  const { error } = await supabase.from('workspace_data').upsert({
    workspace_id: user.workspaceId,
    data_type: dataType,
    data: payload,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,data_type' });
  if (error) { console.error(`[writeSyncedData] ${dataType} FAILED:`, error.message); return false; }
  return true;
}

// Atomic read-modify-write for cloud data — acquires write lock to prevent sync races
async function cloudReadModifyWrite(
  req: express.Request,
  dataType: string,
  modify: (items: any[]) => any[] | null, // return null to abort
): Promise<{ items: any[] | null; error?: string }> {
  if (!IS_CLOUD || !supabase) { console.log(`[cloudRMW] skip — not cloud`); return { items: null }; }
  const user = await resolveUser(req);
  if (!user) { console.log(`[cloudRMW] ${dataType} — auth failed (no user from token)`); return { items: null, error: 'unauthorized' }; }

  return withWriteLock(`sync:${user.workspaceId}`, async () => {
    const { data } = await supabase
      .from('workspace_data')
      .select('data')
      .eq('workspace_id', user.workspaceId)
      .eq('data_type', dataType)
      .single();
    const items: any[] = data?.data || [];
    const result = modify(items);
    if (result === null) return { items: null, error: 'not found' };

    console.log(`[WRITE] cloudRMW(${dataType}) writing ${Array.isArray(result) ? result.length : '?'} items`);
    if (dataType === 'leads' && Array.isArray(result)) {
      for (const l of result) console.log(`[WRITE]   ${l.name}: stage=${l.stage}`);
    }
    const { error } = await supabase.from('workspace_data').upsert({
      workspace_id: user.workspaceId,
      data_type: dataType,
      data: result,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,data_type' });
    if (error) return { items: null, error: error.message };
    return { items: result };
  });
}

// --- Workflows ---
const localWfStorage = new LocalWorkflowStorage();
const localWfEngine = new WorkflowEngine(localWfStorage);

async function getWorkflowContext(req: any): Promise<{ storage: import('./workflows/storage').WorkflowStorage; engine: WorkflowEngine }> {
  if (IS_CLOUD && supabase) {
    const user = await resolveUser(req);
    if (user) {
      const storage = new CloudWorkflowStorage(supabase, user.workspaceId);
      const engine = new WorkflowEngine(storage);
      return { storage, engine };
    }
  }
  return { storage: localWfStorage, engine: localWfEngine };
}

function authenticateRunToken(req: any): string | null {
  const header = req.headers['x-run-token'] as string;
  if (header) return header;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer rt_')) return auth.slice(7);
  return null;
}

// Resolve data directory
function resolveDir(): string {
  const flagIdx = process.argv.indexOf('--dir');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1];
  if (process.env.MARKETING_HQ_DIR) return process.env.MARKETING_HQ_DIR;
  return path.join(os.homedir(), 'clawd', 'marketing');
}

const DATA_DIR = resolveDir();

function readJSON(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

function readYAML(filePath: string): any {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

const p = (...parts: string[]) => path.join(DATA_DIR, ...parts);

// --- Provider system ---
// Resolves which service powers each slot (tasks, CRM, content) from openbrain.yaml
// or auto-detects CLI tools. In cloud mode, providers use Supabase read/write functions.
// NOTE: Cloud mode providers are request-scoped (need auth), so we resolve per-request.
// Local mode providers are resolved once at startup.
let localProviders: ResolvedProviders = IS_CLOUD
  ? { tasks: null, crm: null, content: null } // initialized per-request in cloud mode
  : resolveProviders({ dataDir: DATA_DIR });

// For cloud mode, resolve providers using request-scoped read/write
async function getProviders(req?: express.Request): Promise<ResolvedProviders> {
  if (!IS_CLOUD) return localProviders;

  // In cloud mode, read saved provider config from workspace_data
  let configOverride: any = null;
  if (req) {
    configOverride = await readSyncedData(req, 'provider_config') || null;
  }

  return resolveProviders({
    dataDir: DATA_DIR,
    configOverride,
    cloudReadData: async (dataType: string) => {
      if (!req) return [];
      return await readSyncedData(req, dataType) || [];
    },
    cloudWriteData: async (dataType: string, data: any) => {
      if (!req) return;
      await writeSyncedData(req, dataType, data);
    },
  });
}

// Module detection — which providers are active for each slot
app.get('/api/modules', async (_req, res) => {
  const providers = await getProviders(_req);
  res.json(getModulesResponse(providers));
});

// ── Provider configuration endpoints ─────────────────────────────────

// Returns the registry of available providers and their config fields
app.get('/api/providers', (_req, res) => {
  res.json({
    slots: SLOTS,
    slotLabels: SLOT_LABELS,
    providers: PROVIDER_REGISTRY,
  });
});

// Returns current provider config (which provider is selected per slot + their settings)
app.get('/api/provider-config', async (req, res) => {
  if (IS_CLOUD) {
    const data = await readSyncedData(req, 'provider_config');
    return res.json(data || { providers: {} });
  }
  // Local mode: read from openbrain.yaml
  const configPath = path.join(DATA_DIR, '..', 'openbrain.yaml');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(raw) as any;
      res.json(parsed || { providers: {} });
    } else {
      res.json({ providers: {} });
    }
  } catch {
    res.json({ providers: {} });
  }
});

// Saves provider config and hot-reloads providers
app.post('/api/provider-config', async (req, res) => {
  const config = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config object required' });
  }

  if (IS_CLOUD) {
    const ok = await writeSyncedData(req, 'provider_config', config);
    if (!ok) return res.status(500).json({ error: 'failed to save config' });
    return res.json({ ok: true });
  }

  // Local mode: write openbrain.yaml, then hot-reload providers
  const configPath = path.join(DATA_DIR, '..', 'openbrain.yaml');
  try {
    const yamlStr = yaml.dump(config, { lineWidth: 120 });
    fs.writeFileSync(configPath, yamlStr);
    // Hot-reload: re-resolve providers with new config
    localProviders = resolveProviders({ dataDir: DATA_DIR });
    console.log('[provider-config] Saved and hot-reloaded providers');
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Test a provider connection by instantiating it and calling list({limit:1})
app.post('/api/provider-config/test', async (req, res) => {
  const { providerId, config: providerConfig } = req.body;
  if (!providerId) return res.status(400).json({ error: 'providerId required' });

  const def = PROVIDER_REGISTRY.find(p => p.id === providerId);
  if (!def) return res.status(400).json({ error: `unknown provider: ${providerId}` });

  try {
    let provider: any = null;
    switch (providerId) {
      case 'todoist': {
        const { TodoistProvider } = await import('./providers/todoist');
        if (!providerConfig?.api_key) return res.json({ ok: false, error: 'API key required' });
        const projectIds = providerConfig.project_ids
          ? String(providerConfig.project_ids).split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
          : undefined;
        provider = new TodoistProvider({
          api_key: providerConfig.api_key,
          project_ids: projectIds,
          max_items: providerConfig.max_items ? parseInt(providerConfig.max_items, 10) : undefined,
        });
        break;
      }
      case 'pipedrive': {
        const { PipedriveProvider } = await import('./providers/pipedrive');
        if (!providerConfig?.api_key) return res.json({ ok: false, error: 'API key required' });
        provider = new PipedriveProvider({
          api_key: providerConfig.api_key,
          domain: providerConfig.domain || undefined,
          pipeline_id: providerConfig.pipeline_id ? parseInt(providerConfig.pipeline_id, 10) : undefined,
        });
        break;
      }
      case 'taskpipe':
      case 'leadpipe':
      case 'contentq':
        // CLI tools don't need connection testing
        return res.json({ ok: true, message: 'CLI tool — no connection needed' });
      default:
        return res.json({ ok: false, error: `No test available for ${providerId}` });
    }

    if (provider) {
      await provider.list({ limit: 1 });
      res.json({ ok: true });
    }
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// API — provider-based data endpoints
app.get('/api/tasks', async (_req, res) => {
  const { tasks } = await getProviders(_req);
  if (!tasks) return res.json([]);
  try { res.json(await tasks.list()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leads', async (_req, res) => {
  const { crm } = await getProviders(_req);
  if (!crm) return res.json([]);
  try { res.json(await crm.list()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/content', async (_req, res) => {
  const { content } = await getProviders(_req);
  if (!content) return res.json([]);
  try { res.json(await content.list()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/activity', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'activity') || { activity: { events: [], profile: null }, patterns: { completions: [], dailyCompletions: {} } });
  const activity = readJSON(p('.taskpipe', 'activity.json')) || { events: [], profile: null };
  const patterns = readJSON(p('.taskpipe', 'patterns.json')) || { completions: [], dailyCompletions: {} };
  res.json({ activity, patterns });
});

app.get('/api/stats', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'stats') || { doneToday: 0, pipelineValue: 0, drafts: 0, streak: 0, stakeRisk: 0, overdueStakes: 0 });
  const providers = await getProviders(_req);
  try {
    const [taskStats, crmStats, contentStats] = await Promise.all([
      providers.tasks?.stats() ?? { total: 0, doneToday: 0, overdue: 0, streak: 0, stakeRisk: 0, overdueStakes: 0 },
      providers.crm?.stats() ?? { pipelineValue: 0 },
      providers.content?.stats() ?? { drafts: 0 },
    ]);
    res.json({
      doneToday: taskStats.doneToday,
      pipelineValue: crmStats.pipelineValue,
      drafts: contentStats.drafts,
      streak: taskStats.streak ?? 0,
      stakeRisk: taskStats.stakeRisk ?? 0,
      overdueStakes: taskStats.overdueStakes ?? 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'config') || { taskpipe: {}, leadpipe: {}, contentq: {} });
  res.json({
    taskpipe: readYAML(p('.taskpipe', 'config.yaml')) || {},
    leadpipe: readYAML(p('.leadpipe', 'config.yaml')) || {},
    contentq: readYAML(p('.contentq', 'config.yaml')) || {},
  });
});

// Inbox media files
app.use('/inbox', express.static(path.join(DATA_DIR, '.contentq', 'inbox')));

app.get('/api/inbox', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'inbox') || []);
  res.json(readJSON(p('.contentq', 'inbox.json')) || []);
});

let agentsCache: { data: any; ts: number } = { data: null, ts: 0 };

app.get('/api/agents', async (_req, res) => {
  const gw = await getGatewayForRequest(_req);
  if (gw?.isConnected()) {
    try {
      const agents = await gw.agentsList();
      res.json({ available: true, source: 'gateway', agents });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // Fallback: antfarm CLI
  const now = Date.now();
  if (agentsCache.data && now - agentsCache.ts < 30000) {
    return res.json(agentsCache.data);
  }

  const antfarmCli = path.join(os.homedir(), '.openclaw', 'workspace', 'antfarm', 'dist', 'cli', 'cli.js');
  if (!fs.existsSync(antfarmCli)) {
    const data = { available: false, workflows: [], logs: [] };
    agentsCache = { data, ts: now };
    return res.json(data);
  }

  exec(`node "${antfarmCli}" logs 2>/dev/null`, (_err, logsOut) => {
    exec(`node "${antfarmCli}" workflow status 2>/dev/null`, (_err2, statusOut) => {
      const data = {
        available: true,
        source: 'antfarm',
        logs: logsOut?.trim() || '',
        status: statusOut?.trim() || '',
        workflows: parseWorkflows(statusOut || ''),
      };
      agentsCache = { data, ts: now };
      res.json(data);
    });
  });
});

function parseWorkflows(output: string): any[] {
  if (!output.trim()) return [];
  const workflows: any[] = [];
  const lines = output.trim().split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      workflows.push(parsed);
    } catch {
      // Try to parse structured text output
      const match = line.match(/(\w+)\s+(\w+)\s+(.+)/);
      if (match) {
        workflows.push({ id: match[1], status: match[2], task: match[3] });
      }
    }
  }
  return workflows;
}

// Create task
app.use(express.json());

// Mount workflow router (needs JSON parsing from above)
app.use('/api/wf', createWorkflowRouter(getWorkflowContext, authenticateRunToken));

app.post('/api/tasks', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const { tasks } = await getProviders(req);
  if (!tasks) return res.status(400).json({ error: 'no tasks provider' });
  try {
    const task = await tasks.create(req.body);
    res.json(task);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create lead
app.post('/api/leads', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { crm } = await getProviders(req);
  if (!crm) return res.status(400).json({ error: 'no CRM provider' });
  try {
    const lead = await crm.create(req.body);
    res.json(lead);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create content
app.post('/api/content', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const { content } = await getProviders(req);
  if (!content) return res.status(400).json({ error: 'no content provider' });
  try {
    const item = await content.create(req.body);
    res.json(item);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { tasks } = await getProviders(req);
  if (!tasks) return res.status(400).json({ error: 'no tasks provider' });
  try {
    const task = await tasks.update(id, req.body);
    res.json(task);
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'task not found' });
    res.status(500).json({ error: e.message });
  }
});

// Update lead
app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const { crm } = await getProviders(req);
  if (!crm) return res.status(400).json({ error: 'no CRM provider' });
  try {
    const lead = await crm.update(id, req.body);
    res.json(lead);
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'lead not found' });
    res.status(500).json({ error: e.message });
  }
});

// Update content
app.put('/api/content/:id', async (req, res) => {
  const { id } = req.params;
  const { content } = await getProviders(req);
  if (!content) return res.status(400).json({ error: 'no content provider' });
  try {
    const item = await content.update(id, req.body);
    res.json(item);
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'content not found' });
    res.status(500).json({ error: e.message });
  }
});

// Move task to new status

app.post('/api/tasks/:id/move', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  // Cloud mode: use cloudReadModifyWrite for atomic sync-safe updates
  if (IS_CLOUD) {
    try {
      let movedTask: any = null;
      const { error } = await cloudReadModifyWrite(req, 'tasks', (tasks) => {
        const task = tasks.find((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
        if (!task) return null;
        task.status = status;
        task.updatedAt = new Date().toISOString();
        if (status === 'done') task.completedAt = new Date().toISOString();
        movedTask = task;
        return tasks;
      });
      if (error === 'not found') return res.status(404).json({ error: 'task not found' });
      if (error) return res.status(500).json({ error });
      res.json(movedTask);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    return;
  }
  const { tasks } = await getProviders(req);
  if (!tasks) return res.status(400).json({ error: 'no tasks provider' });
  try {
    const task = await tasks.move(id, status);
    res.json(task);
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'task not found' });
    res.status(500).json({ error: e.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  // Cloud mode: use cloudReadModifyWrite for atomic sync-safe deletes with deletion tracking
  if (IS_CLOUD) {
    try {
      let removedTask: any = null;
      const user = await resolveUser(req);
      const { error } = await cloudReadModifyWrite(req, 'tasks', (tasks) => {
        const idx = tasks.findIndex((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
        if (idx === -1) return null;
        removedTask = tasks.splice(idx, 1)[0];
        if (user) trackCloudDeletion(user.workspaceId, 'tasks', removedTask.id);
        return tasks;
      });
      if (error === 'not found') return res.status(404).json({ error: 'task not found' });
      if (error) return res.status(500).json({ error });
      res.json(removedTask);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    return;
  }
  const { tasks } = await getProviders(req);
  if (!tasks) return res.status(400).json({ error: 'no tasks provider' });
  try {
    await tasks.delete(id);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'task not found' });
    res.status(500).json({ error: e.message });
  }
});

// Read spec/attachment file for a task
app.get('/api/tasks/:id/spec', (req, res) => {
  const { id } = req.params;
  const tasks = readJSON(p('.taskpipe', 'tasks.json'));
  if (!tasks) return res.status(500).json({ error: 'could not read tasks' });
  const task = tasks.find((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  const links = task.links || {};
  const specs: Record<string, string> = {};
  for (const [key, val] of Object.entries(links)) {
    if (!val) continue;
    // Resolve relative to DATA_DIR
    const filePath = path.resolve(DATA_DIR, val as string);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        specs[key] = fs.readFileSync(filePath, 'utf-8');
      }
    } catch { /* skip unreadable */ }
  }
  res.json({ links, specs });
});

// Reorder tasks
app.post('/api/tasks/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  // Cloud mode: keep existing direct Supabase logic for atomic reorder
  if (IS_CLOUD) {
    try {
      const tasks = (await readSyncedData(req, 'tasks')) || [];
      const taskMap = new Map(tasks.map((t: any) => [t.id, t]));
      const reordered: any[] = [];
      for (const id of ids) {
        const task = taskMap.get(id);
        if (task) { reordered.push(task); taskMap.delete(id); }
      }
      for (const task of taskMap.values()) reordered.push(task);
      await writeSyncedData(req, 'tasks', reordered);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    return;
  }

  const { tasks } = await getProviders(req);
  if (!tasks) return res.status(400).json({ error: 'no tasks provider' });
  try {
    if (tasks.reorder) {
      await tasks.reorder(ids);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Move lead to new stage

app.post('/api/leads/:id/move', async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage required' });

  // Cloud mode: use cloudReadModifyWrite for atomic sync-safe updates
  if (IS_CLOUD) {
    try {
      let movedLead: any = null;
      const { error } = await cloudReadModifyWrite(req, 'leads', (leads) => {
        const lead = leads.find((l: any) => id.length < 36 ? l.id.startsWith(id) : l.id === id);
        if (!lead) return null;
        lead.stage = stage;
        lead.updatedAt = new Date().toISOString();
        movedLead = lead;
        return leads;
      });
      if (error === 'not found') return res.status(404).json({ error: 'lead not found' });
      if (error) return res.status(500).json({ error });
      res.json(movedLead);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    return;
  }

  const { crm } = await getProviders(req);
  if (!crm) return res.status(400).json({ error: 'no CRM provider' });
  try {
    const lead = await crm.move(id, stage);
    res.json(lead);
  } catch (e: any) {
    if (e.message?.includes('not found')) return res.status(404).json({ error: 'lead not found' });
    res.status(500).json({ error: e.message });
  }
});

// General CLI helper for local commands (gog, codexbar, etc.)
function runCLI(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

// OpenClaw cron + heartbeat — reads locally or via SSH to Mac Mini
const MAC_MINI = 'benno@bennos-mac-mini.local';
const OPENCLAW_DIR_REMOTE = '~/.openclaw';
const OPENCLAW_DIR_LOCAL = path.join(os.homedir(), '.openclaw');

function sshReadFile(remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`ssh -o ConnectTimeout=5 -o BatchMode=yes ${MAC_MINI} "cat ${remotePath}"`,
      { timeout: 10000 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
  });
}

function readCronJobs(): Promise<any> {
  const localPath = path.join(OPENCLAW_DIR_LOCAL, 'cron', 'jobs.json');
  try {
    return Promise.resolve(JSON.parse(fs.readFileSync(localPath, 'utf-8')));
  } catch {}
  return sshReadFile(`${OPENCLAW_DIR_REMOTE}/cron/jobs.json`).then(out => JSON.parse(out));
}

function readOpenclawConfig(): Promise<any> {
  const localPath = path.join(OPENCLAW_DIR_LOCAL, 'openclaw.json');
  try {
    return Promise.resolve(JSON.parse(fs.readFileSync(localPath, 'utf-8')));
  } catch {}
  return sshReadFile(`${OPENCLAW_DIR_REMOTE}/openclaw.json`).then(out => JSON.parse(out));
}

function writeCronJobs(data: any): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const localPath = path.join(OPENCLAW_DIR_LOCAL, 'cron', 'jobs.json');
  try {
    fs.writeFileSync(localPath, json);
    return Promise.resolve();
  } catch {}
  return new Promise((resolve, reject) => {
    const child = exec(`ssh -o ConnectTimeout=5 -o BatchMode=yes ${MAC_MINI} "cat > ${OPENCLAW_DIR_REMOTE}/cron/jobs.json"`,
      { timeout: 10000 }, (err) => { if (err) reject(err); else resolve(); });
    child.stdin?.end(json);
  });
}

app.get('/api/cron/jobs', async (_req, res) => {
  try {
    const gw = await getGatewayForRequest(_req);
    if (gw?.isConnected()) {
      const data = await gw.cronList();
      res.json(data);
    } else if (IS_CLOUD) {
      // Cloud mode: gateway is the only source for cron jobs
      res.json({ jobs: [], _reason: 'gateway_not_connected' });
    } else {
      const data = await readCronJobs();
      res.json(data);
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cron/jobs/:id/toggle', async (req, res) => {
  try {
    const data = await readCronJobs();
    const jobs: any[] = data.jobs || [];
    const job = jobs.find((j: any) => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    job.enabled = req.body.enabled;
    job.updatedAtMs = Date.now();
    await writeCronJobs(data);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cron/jobs/:id', async (req, res) => {
  try {
    const data = await readCronJobs();
    data.jobs = (data.jobs || []).filter((j: any) => j.id !== req.params.id);
    await writeCronJobs(data);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cron/jobs/:id/run', async (req, res) => {
  try {
    const jobId = req.params.id;
    // Validate jobId format (UUID only)
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return res.status(400).json({ error: 'Invalid job ID' });
    await new Promise<void>((resolve, reject) => {
      exec(`ssh -o ConnectTimeout=5 -o BatchMode=yes ${MAC_MINI} "openclaw cron run ${jobId}"`,
        { timeout: 15000 }, (err) => { if (err) reject(err); else resolve(); });
    });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Heartbeat config — prefer Gateway health data
app.get('/api/heartbeat', async (_req, res) => {
  try {
    const gw = await getGatewayForRequest(_req);
    if (gw?.isConnected()) {
      const health = await gw.health();
      res.json({ source: 'gateway', ...health });
      return;
    }
    // Fallback: read config files
    const config = await readOpenclawConfig();
    const heartbeat = config?.agents?.defaults?.heartbeat || {};
    const hbPath = path.join(DATA_DIR, '..', 'HEARTBEAT.md');
    let heartbeatMd = '';
    try { heartbeatMd = fs.readFileSync(hbPath, 'utf-8'); } catch {}
    res.json({ source: 'file', config: heartbeat, checklist: heartbeatMd });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Agent brain — workspace files + config
const WORKSPACE = path.join(DATA_DIR, '..');

app.get('/api/agent/brain', async (_req, res) => {
  try {
    if (IS_CLOUD) {
      const data = await readSyncedData(_req, 'brain');
      return res.json(data || { model: {}, channels: {}, connections: [], skills: [], memoryFiles: [] });
    }
    const readFile = (name: string) => {
      try { return fs.readFileSync(path.join(WORKSPACE, name), 'utf-8'); } catch { return null; }
    };
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    let config: any = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}

    // Extract useful config info (redact secrets)
    const model = config?.agents?.defaults?.model || {};
    const channels: Record<string, any> = {};
    if (config?.channels) {
      for (const [k, v] of Object.entries(config.channels as Record<string, any>)) {
        channels[k] = { enabled: v.enabled !== false, dmPolicy: v.dmPolicy, groupPolicy: v.groupPolicy };
      }
    }

    // Installed skills — scan all skill directories
    const skillEntries = config?.skills?.entries || {};
    const configuredSkills = Object.keys(skillEntries);
    const skillDirs = [
      path.join(os.homedir(), 'clawd', 'skills'),
      path.join(os.homedir(), '.openclaw', 'skills'),
      '/opt/homebrew/lib/node_modules/openclaw/skills',
    ];
    const allSkills = new Set<string>(configuredSkills);
    for (const dir of skillDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('.')) allSkills.add(e.name);
        }
      } catch {}
    }
    const skills = Array.from(allSkills).sort();

    // Memory files
    const memoryDir = path.join(WORKSPACE, 'memory');
    let memoryFiles: string[] = [];
    try { memoryFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md')).sort().reverse(); } catch {}

    // Parse connections from TOOLS.md
    const toolsMd = readFile('TOOLS.md') || '';
    const connections: any[] = [];

    // Split TOOLS.md into sections by ## headings for API key extraction
    const toolsSections: Record<string, string> = {};
    const sectionRegex = /^##\s+(.+)$/gm;
    let sMatch: RegExpExecArray | null;
    const sectionStarts: { name: string; start: number }[] = [];
    while ((sMatch = sectionRegex.exec(toolsMd)) !== null) {
      sectionStarts.push({ name: sMatch[1].trim(), start: sMatch.index });
    }
    for (let i = 0; i < sectionStarts.length; i++) {
      const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].start : toolsMd.length;
      toolsSections[sectionStarts[i].name.toLowerCase()] = toolsMd.slice(sectionStarts[i].start, end);
    }

    // Extract masked API keys from a section of text
    const maskKey = (value: string): string => {
      const v = value.replace(/`/g, '').trim();
      if (v.length <= 8) return v.slice(0, 2) + '····' + v.slice(-2);
      return v.slice(0, 4) + '····' + v.slice(-4);
    };
    const extractKeys = (sectionText: string): { label: string; masked: string }[] => {
      const keys: { label: string; masked: string }[] = [];
      const keyPattern = /\*\*([^*]*(?:Key|Token|Secret)[^*]*)\*\*:?\s*`?([^`\n]+)`?/gi;
      let km: RegExpExecArray | null;
      while ((km = keyPattern.exec(sectionText)) !== null) {
        const label = km[1].trim().replace(/[*:]/g, '');
        const value = km[2].trim();
        if (value.length >= 6 && !/https?:\/\//.test(value) && !/\s/.test(value)) {
          keys.push({ label, masked: maskKey(value) });
        }
      }
      return keys;
    };

    // Map integration names to TOOLS.md section keys for key extraction
    const sectionKeyMap: Record<string, string[]> = {
      'Things 3': ['things 3'],
      'Calendly': ['calendly'],
      'Todoist': ['todoist'],
      'Klaviyo': ['klaviyo'],
      'Brevo': ['brevo (email marketing)', 'brevo'],
      'Customer.io': ['customer.io'],
      'Late (LinkedIn)': ['late (getlate.dev) — social media api', 'late'],
      'Loops.so': ['loops.so'],
      'Bento': ['bento (email marketing)', 'bento'],
      'ElevenLabs': ['elevenlabs tts (sag)', 'elevenlabs'],
      'Slack': ['slack app (a.m.i.)', 'slack'],
    };

    // Extract known integrations from TOOLS.md sections
    const integrations: Record<string, { pattern: RegExp; icon: string; category: string }> = {
      'Google Calendar': { pattern: /gog calendar|Google Calendar/i, icon: '📅', category: 'Productivity' },
      'Todoist': { pattern: /Todoist|todoist/i, icon: '✅', category: 'Productivity' },
      'Things 3': { pattern: /Things 3|things.*auth/i, icon: '📋', category: 'Productivity' },
      'Calendly': { pattern: /Calendly|calendly/i, icon: '📆', category: 'Scheduling' },
      'Late (LinkedIn)': { pattern: /Late.*API|getlate\.dev/i, icon: '💼', category: 'Social Media' },
      'Brevo': { pattern: /Brevo|brevo/i, icon: '📧', category: 'Email Marketing' },
      'Loops.so': { pattern: /Loops\.so|loops\.so/i, icon: '🔄', category: 'Email Marketing' },
      'Customer.io': { pattern: /Customer\.io|customer\.io/i, icon: '📨', category: 'Email Marketing' },
      'Klaviyo': { pattern: /Klaviyo|klaviyo/i, icon: '📊', category: 'Email Marketing' },
      'Bento': { pattern: /Bento.*email|bento.*config/i, icon: '🍱', category: 'Email Marketing' },
      'ElevenLabs': { pattern: /ElevenLabs|ELEVENLABS|eleven/i, icon: '🎙️', category: 'Voice AI' },
      'OpenAI': { pattern: /OpenAI|openai/i, icon: '🤖', category: 'AI' },
      'Brave Search': { pattern: /Brave.*Search|brave.*api/i, icon: '🔍', category: 'Search' },
      'GitHub': { pattern: /GitHub|gh.*cli/i, icon: '🐙', category: 'Development' },
      'Slack': { pattern: /Slack.*App|slack.*token/i, icon: '💬', category: 'Communication' },
      'WhatsApp': { pattern: /WhatsApp|whatsapp/i, icon: '📱', category: 'Communication' },
      'Stripe': { pattern: /Stripe|stripe/i, icon: '💳', category: 'Payments' },
    };

    for (const [name, info] of Object.entries(integrations)) {
      if (info.pattern.test(toolsMd) || info.pattern.test(JSON.stringify(config))) {
        // Try to extract status
        let status = 'configured';
        let detail = '';
        if (name === 'Klaviyo' && /too ecommerce|not primary/i.test(toolsMd)) { status = 'inactive'; detail = 'Not primary (too ecommerce-focused)'; }
        else if (name === 'Customer.io' && /not verified/i.test(toolsMd)) { status = 'needs-setup'; detail = 'Account not verified for sending'; }
        else if (name === 'Brave Search' && /invalid|refresh/i.test(toolsMd)) { status = 'error'; detail = 'API key may need refresh'; }
        else if (name === 'Slack') {
          status = channels.slack?.enabled ? 'active' : 'inactive';
          detail = channels.slack?.enabled ? 'Connected' : 'Disabled in config';
        }
        else if (name === 'WhatsApp') { status = 'active'; detail = 'Connected'; }
        else if (name === 'Late (LinkedIn)') { status = 'active'; detail = 'LinkedIn posting + image upload'; }
        else if (name === 'Brevo') { status = 'active'; detail = 'Free plan, 300 emails/day'; }
        else if (name === 'Todoist') { status = 'active'; detail = 'API v1'; }
        else if (name === 'Calendly') { status = 'active'; detail = 'API connected'; }
        else if (name === 'Google Calendar') { status = 'active'; detail = 'via gog CLI'; }
        else if (name === 'ElevenLabs') { status = 'active'; detail = 'TTS + voices'; }
        else if (name === 'GitHub') { status = 'active'; detail = 'gh CLI authenticated'; }
        else if (name === 'Things 3') { status = 'active'; detail = 'Auth token set'; }
        else if (name === 'Bento') { status = 'active'; detail = 'benno-sawitzki.com'; }
        else if (name === 'Loops.so') { status = 'configured'; detail = 'API key set, shortlisted'; }

        // Extract API keys for this integration from its TOOLS.md section
        const sectionAliases = sectionKeyMap[name] || [name.toLowerCase()];
        let apiKeys: { label: string; masked: string }[] = [];
        for (const alias of sectionAliases) {
          const section = toolsSections[alias];
          if (section) { apiKeys = extractKeys(section); break; }
        }

        connections.push({ name, icon: info.icon, category: info.category, status, detail, apiKeys: apiKeys.length ? apiKeys : undefined });
      }
    }

    // Also add skills as connections
    for (const s of skills) {
      const existing = connections.find(c => c.name.toLowerCase().includes(s.replace(/-/g, ' ').split(' ')[0]));
      if (!existing) {
        connections.push({ name: s, icon: '🔧', category: 'Skills', status: 'active', detail: 'OpenClaw skill' });
      }
    }

    res.json({
      soul: readFile('SOUL.md'),
      user: readFile('USER.md'),
      memory: readFile('MEMORY.md'),
      tools: readFile('TOOLS.md'),
      identity: readFile('IDENTITY.md'),
      heartbeat: readFile('HEARTBEAT.md'),
      model,
      channels,
      skills,
      connections,
      memoryFiles,
      recentMemory: memoryFiles.slice(0, 3).map(f => ({
        name: f,
        content: (() => { try { return fs.readFileSync(path.join(memoryDir, f), 'utf-8'); } catch { return ''; } })(),
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Daily overview — aggregates reminders, calendar, follow-ups, cron jobs
app.get('/api/daily', async (_req, res) => {
  try {
    const result: any = { reminders: [], calendar: [], followUps: [], cronJobs: [], todoist: [] };

    // Cron jobs with next run
    try {
      const data = await readCronJobs();
      const jobs = data?.jobs || [];
      result.cronJobs = jobs.filter((j: any) => j.enabled).map((j: any) => ({
        id: j.id, name: j.name, schedule: j.schedule,
        nextRun: j.state?.nextRunAtMs, lastRun: j.state?.lastRunAtMs,
      }));
    } catch {}

    // Task reminders
    try {
      const tasksPath = p('.taskpipe', 'tasks.json');
      const tasks = readJSON(tasksPath) || [];
      for (const t of tasks) {
        if (t.reminders?.length) {
          for (const r of t.reminders) {
            result.reminders.push({ task: t.content, taskId: t.id, at: r.at, fired: r.fired });
          }
        }
      }
      // Also tasks due today/tomorrow
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      result.dueToday = tasks.filter((t: any) => t.due === today && t.status !== 'done').length;
      result.dueTomorrow = tasks.filter((t: any) => t.due === tomorrow && t.status !== 'done').length;
      result.overdue = tasks.filter((t: any) => t.due && t.due < today && t.status !== 'done').length;
    } catch {}

    // Lead follow-ups
    try {
      const leadsPath = p('.leadpipe', 'leads.json');
      const leads = readJSON(leadsPath) || [];
      const today = new Date().toISOString().slice(0, 10);
      for (const l of leads) {
        if (l.followUp) {
          result.followUps.push({ name: l.name, date: l.followUp, overdue: l.followUp <= today, stage: l.stage, value: l.value });
        }
      }
    } catch {}

    // Google Calendar (via gog CLI)
    try {
      const out = await runCLI('gog calendar list --days 3 --json 2>/dev/null');
      const cal = JSON.parse(out);
      result.calendar = (cal.events || []).slice(0, 10).map((e: any) => ({
        summary: e.summary, start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date, location: e.location,
      }));
    } catch {}

    // Todoist (quick fetch — local mode only)
    if (!IS_CLOUD && process.env.TODOIST_API_KEY) {
      try {
        const todoRes = await fetch('https://api.todoist.com/api/v1/tasks', {
          headers: { 'Authorization': `Bearer ${process.env.TODOIST_API_KEY}` },
        });
        const todoData = await todoRes.json() as any;
        result.todoist = (todoData.results || todoData || []).slice(0, 10).map((t: any) => ({
          content: t.content, due: t.due?.date, priority: t.priority, url: t.url,
        }));
      } catch {}
    }

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health/pulse', async (_req, res) => {
  try {
    const heartbeatState = readJSON(path.join(os.homedir(), 'clawd', 'memory', 'heartbeat-state.json'));
    const activity = readJSON(p('.taskpipe', 'activity.json'));
    const antfarmExists = fs.existsSync(path.join(os.homedir(), '.openclaw', 'workspace', 'antfarm'));

    const services: Record<string, any> = {};
    if (heartbeatState?.lastChecks) {
      for (const [channel, ts] of Object.entries(heartbeatState.lastChecks)) {
        if (ts == null) { services[channel] = { lastCheck: null, ageMs: Infinity, status: 'offline' }; continue; }
        const tsNum = Number(ts);
        // Detect Unix seconds vs milliseconds: if < 1e12, it's seconds
        const msTime = tsNum < 1e12 ? tsNum * 1000 : tsNum;
        const age = Date.now() - msTime;
        services[channel] = {
          lastCheck: ts,
          ageMs: age,
          status: age < 3600000 ? 'healthy' : age < 86400000 ? 'stale' : 'offline',
        };
      }
    }

    res.json({
      services,
      activity: {
        summary: activity?.dailySummary || null,
        profile: activity?.profile || null,
        eventCount: activity?.events?.length || 0,
      },
      antfarm: antfarmExists,
      uptime: Date.now() - SERVER_START,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health/cost', async (_req, res) => {
  try {
    let usage = null;
    try {
      const out = await runCLI('codexbar usage --json --provider claude 2>/dev/null');
      usage = JSON.parse(out);
    } catch {}

    let config = null;
    try {
      config = readJSON(path.join(os.homedir(), '.codexbar', 'config.json'));
    } catch {}

    res.json({ usage, config });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/calendar', async (_req, res) => {
  try {
    const events: any[] = [];

    // In cloud mode, build calendar from synced tasks/leads
    const tasks = IS_CLOUD
      ? (await readSyncedData(_req, 'tasks') || [])
      : readJSON(p('.taskpipe', 'tasks.json')) || [];
    const leads = IS_CLOUD
      ? (await readSyncedData(_req, 'leads') || [])
      : readJSON(p('.leadpipe', 'leads.json')) || [];

    // Google Calendar events (local mode only)
    if (!IS_CLOUD) {
      try {
        const out = await runCLI('gog calendar list --days 14 --json 2>/dev/null');
        const cal = JSON.parse(out);
        for (const e of (cal.events || [])) {
          events.push({
            type: 'calendar',
            title: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location,
          });
        }
      } catch {}
    }

    // Task due dates
    for (const t of tasks) {
      if (t.due && t.status !== 'done') {
        events.push({ type: 'task', title: t.content, start: t.due, taskId: t.id, energy: t.energy });
      }
    }

    // Lead follow-ups
    for (const l of leads) {
      if (l.followUp) {
        events.push({ type: 'followup', title: `Follow up: ${l.name}`, start: l.followUp, leadId: l.id, value: l.value, stage: l.stage });
      }
    }

    // Sort by start date
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    res.json({ events });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/feed', async (_req, res) => {
  try {
    const items: any[] = [];
    const cutoff = Date.now() - 48 * 3600000;

    // Load data — from Supabase in cloud mode, from files in local mode
    const activity = IS_CLOUD
      ? (await readSyncedData(_req, 'activity') || {})
      : readJSON(p('.taskpipe', 'activity.json')) || {};
    const tasks = IS_CLOUD
      ? (await readSyncedData(_req, 'tasks') || [])
      : readJSON(p('.taskpipe', 'tasks.json')) || [];
    const leads = IS_CLOUD
      ? (await readSyncedData(_req, 'leads') || [])
      : readJSON(p('.leadpipe', 'leads.json')) || [];
    const content = IS_CLOUD
      ? (await readSyncedData(_req, 'content') || [])
      : readJSON(p('.contentq', 'queue.json')) || [];

    // Activity events
    for (const e of (activity?.events || [])) {
      items.push({ type: 'activity', title: e.type || 'event', detail: e.summary || e.channel || '', time: e.ts, icon: '⚡' });
    }

    // Recently completed tasks
    for (const t of tasks) {
      if (t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() > cutoff) {
        items.push({ type: 'task', title: `Completed: ${t.content}`, detail: t.campaign || '', time: t.completedAt, icon: '✅' });
      }
    }

    // Recent lead touches
    for (const l of leads) {
      for (const touch of (l.touches || [])) {
        if (new Date(touch.date).getTime() > cutoff) {
          items.push({ type: 'lead', title: `${touch.type}: ${l.name}`, detail: touch.note || '', time: touch.date, icon: '🤝' });
        }
      }
    }

    // Recently published content
    for (const c of content) {
      if (c.status === 'published' && c.updatedAt && new Date(c.updatedAt).getTime() > cutoff) {
        items.push({ type: 'content', title: `Published on ${c.platform}`, detail: c.text?.slice(0, 80) || '', time: c.updatedAt, icon: '📤' });
      }
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const counts = { activity: 0, task: 0, lead: 0, content: 0 };
    for (const item of items) {
      if (item.type in counts) counts[item.type as keyof typeof counts]++;
    }

    res.json({ items, counts });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/memory/timeline', async (_req, res) => {
  try {
    if (IS_CLOUD) {
      const data = await readSyncedData(_req, 'memory');
      return res.json(data || { files: [] });
    }
    const memoryDir = path.join(WORKSPACE, 'memory');
    const files: any[] = [];
    try {
      const entries = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
      for (const f of entries) {
        const filePath = path.join(memoryDir, f);
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        files.push({
          name: f,
          modified: stat.mtime.toISOString(),
          preview: content.slice(0, 100),
          lines: content.split('\n').length,
        });
      }
    } catch {}
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    res.json({ files });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/revenue', (_req, res) => {
  try {
    const leads = readJSON(p('.leadpipe', 'leads.json')) || [];
    const stages = ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'];
    const byStage: Record<string, { count: number; value: number }> = {};
    for (const s of stages) byStage[s] = { count: 0, value: 0 };

    const bySource: Record<string, { count: number; value: number }> = {};
    const recentWins: any[] = [];
    let totalWon = 0, totalPipeline = 0;

    for (const l of leads) {
      const st = l.stage || 'cold';
      if (!byStage[st]) byStage[st] = { count: 0, value: 0 };
      byStage[st].count++;
      byStage[st].value += l.value || 0;

      if (st === 'won') {
        totalWon += l.value || 0;
        recentWins.push({ name: l.name, value: l.value, date: l.updatedAt });
      } else if (st !== 'lost') {
        totalPipeline += l.value || 0;
      }

      const src = l.source || 'other';
      if (!bySource[src]) bySource[src] = { count: 0, value: 0 };
      bySource[src].count++;
      bySource[src].value += l.value || 0;
    }

    const total = leads.length || 1;
    const wonCount = byStage.won?.count || 0;

    recentWins.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      totalWon,
      totalPipeline,
      byStage,
      bySource,
      recentWins: recentWins.slice(0, 5),
      conversionRate: Math.round((wonCount / total) * 100),
      totalLeads: leads.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Gateway-powered endpoints ---

app.get('/api/gateway/status', async (_req, res) => {
  const gw = await getGatewayForRequest(_req);
  if (!gw?.isConnected()) {
    return res.json({ connected: false });
  }
  try {
    const status = await gw.status();
    res.json({ connected: true, ...status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/gateway/health', async (_req, res) => {
  const gw = await getGatewayForRequest(_req);
  if (!gw?.isConnected()) {
    return res.json({ connected: false });
  }
  try {
    const health = await gw.health();
    res.json({ connected: true, ...health });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/gateway/sessions', async (_req, res) => {
  const gw = await getGatewayForRequest(_req);
  if (!gw?.isConnected()) {
    return res.json({ connected: false, sessions: [] });
  }
  try {
    const data = await gw.sessionsList();
    res.json({ connected: true, ...data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/gateway/skills', async (_req, res) => {
  const gw = await getGatewayForRequest(_req);
  if (!gw?.isConnected()) {
    return res.json({ connected: false, skills: [] });
  }
  try {
    const data = await gw.skillsStatus();
    res.json({ connected: true, ...data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Gateway connection info for the client
app.get('/api/gateway/info', async (_req, res) => {
  let reason: string | undefined;
  if (IS_CLOUD) {
    const user = await resolveUser(_req);
    if (!user) reason = 'no_auth';
    else if (!user.gatewayConfig) reason = 'no_gateway_config';
  } else if (!getLocalGateway()) {
    reason = 'no_gateway_token_env';
  }
  const gw = await getGatewayForRequest(_req);
  res.json({
    enabled: !!gw,
    connected: gw?.isConnected() || false,
    ...(reason ? { reason } : {}),
  });
});

// Test a gateway connection (used by Connect page)
app.post('/api/gateway/test', async (req, res) => {
  const { gateway_url, gateway_token } = req.body;
  if (!gateway_url || !gateway_token) {
    return res.json({ ok: false, error: 'URL and token are required' });
  }
  try {
    const { GatewayClient } = await import('./gateway');
    const client = new GatewayClient({ url: gateway_url, token: gateway_token });
    client.connect();
    const connected = await client.waitForConnection(8000);
    client.disconnect();
    if (connected) {
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: 'Could not connect — check URL and token' });
    }
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════
// Sync: local → cloud
// ═══════════════════════════════════════════

const SYNC_SECRET = process.env.SYNC_SECRET || '';

// Cloud side: receive sync data from local instance
if (IS_CLOUD && SYNC_SECRET) {
  app.post('/api/sync', async (req, res) => {
    console.log(`[WRITE] SYNC received from ${req.ip}`);
    const secret = req.headers['x-sync-secret'];
    if (!secret || secret !== SYNC_SECRET) {
      console.log(`[WRITE] SYNC rejected — bad secret`);
      return res.status(401).json({ error: 'invalid sync secret' });
    }

    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId || !supabase) {
      return res.status(400).json({ error: 'workspace-id header required' });
    }

    try {
      // Editable types: only ADD new items from local (never overwrite existing cloud items)
      const editableTypes = ['tasks', 'leads', 'content'] as const;
      // Read-only types: safe to overwrite (these are display-only in cloud UI)
      const replaceTypes = ['activity', 'stats', 'config', 'inbox'] as const;
      let synced = 0;

      await withWriteLock(`sync:${workspaceId}`, async () => {
        for (const dt of editableTypes) {
          if (req.body[dt] !== undefined && Array.isArray(req.body[dt])) {
            const { data: row, error: readErr } = await supabase
              .from('workspace_data')
              .select('data')
              .eq('workspace_id', workspaceId)
              .eq('data_type', dt)
              .single();

            if (readErr && readErr.code !== 'PGRST116') {
              console.error(`[sync] SKIPPING ${dt} — cloud read failed:`, readErr.message);
              continue;
            }

            const cloudItems: any[] = row?.data || [];
            const cloudIds = new Set(cloudItems.map((item: any) => item.id).filter(Boolean));
            const deletedIds = cloudDeletedIds.get(`${workspaceId}:${dt}`);

            // Only add items from local that DON'T exist in cloud yet
            let added = 0;
            const result = [...cloudItems];
            for (const item of req.body[dt]) {
              if (!item.id) continue;
              if (cloudIds.has(item.id)) continue; // Already in cloud — don't touch
              if (deletedIds?.has(item.id)) continue; // Was deleted in cloud — don't re-add
              result.push(item);
              added++;
            }

            if (added === 0) {
              // Nothing new from local — do NOT write back to cloud at all.
              // This prevents any possibility of the sync overwriting cloud edits.
              synced++;
              continue;
            }

            console.log(`[sync] ${dt}: adding ${added} new items from local`);
            const { error: writeErr } = await supabase.from('workspace_data').upsert({
              workspace_id: workspaceId,
              data_type: dt,
              data: result,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,data_type' });

            if (writeErr) {
              console.error(`[sync] FAILED to write ${dt}:`, writeErr.message);
            } else {
              synced++;
            }
          }
        }

        for (const dt of replaceTypes) {
          if (req.body[dt] !== undefined) {
            console.log(`[WRITE] sync replace: ${dt}`);
            const { error: writeErr } = await supabase.from('workspace_data').upsert({
              workspace_id: workspaceId,
              data_type: dt,
              data: req.body[dt],
              synced_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,data_type' });
            if (writeErr) {
              console.error(`[sync] FAILED to write ${dt}:`, writeErr.message);
            } else {
              synced++;
            }
          }
        }
      });

      // Return cloud data so local can write it back (two-way sync)
      const mergedBack: Record<string, any> = {};
      for (const dt of editableTypes) {
        if (req.body[dt] !== undefined) {
          const { data: row } = await supabase
            .from('workspace_data')
            .select('data')
            .eq('workspace_id', workspaceId)
            .eq('data_type', dt)
            .single();
          if (row?.data) mergedBack[dt] = row.data;
        }
      }

      res.json({ ok: true, synced, merged: mergedBack });
    } catch (e: any) {
      console.error('Sync error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  console.log('   Sync endpoint: POST /api/sync (secret-authenticated)');
}

// Local side: push local data to cloud periodically
const SYNC_URL = process.env.SYNC_URL || '';         // e.g. http://46.225.119.95:4000
const SYNC_WORKSPACE_ID = process.env.SYNC_WORKSPACE_ID || '';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000', 10);

if (!IS_CLOUD && SYNC_URL && SYNC_SECRET && SYNC_WORKSPACE_ID) {
  async function syncToCloud() {
    try {
      const payload: Record<string, any> = {};
      const files: [string, string][] = [
        ['tasks', p('.taskpipe', 'tasks.json')],
        ['leads', p('.leadpipe', 'leads.json')],
        ['content', p('.contentq', 'queue.json')],
        ['activity', p('activity.json')],
        ['stats', p('.taskpipe', 'stats.json')],
        ['config', p('config.json')],
        ['inbox', p('inbox.json')],
      ];

      for (const [key, filePath] of files) {
        const data = readJSON(filePath);
        if (data !== null) payload[key] = data;
      }

      // Also try alternate stats path
      if (!payload.stats) {
        const alt = readJSON(p('stats.json'));
        if (alt) payload.stats = alt;
      }

      if (Object.keys(payload).length === 0) return;

      const resp = await fetch(`${SYNC_URL}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-secret': SYNC_SECRET,
          'x-workspace-id': SYNC_WORKSPACE_ID,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.text();
        console.error(`Sync failed (${resp.status}): ${err}`);
      } else {
        // Two-way sync: write back merged data from cloud to local JSON files
        try {
          const result = await resp.json();
          const mergedFiles: [string, string][] = [
            ['tasks', p('.taskpipe', 'tasks.json')],
            ['leads', p('.leadpipe', 'leads.json')],
            ['content', p('.contentq', 'queue.json')],
          ];
          for (const [key, filePath] of mergedFiles) {
            if (result.merged?.[key] && Array.isArray(result.merged[key])) {
              fs.writeFileSync(filePath, JSON.stringify(result.merged[key], null, 2));
            }
          }
        } catch {}
      }
    } catch (e: any) {
      console.error('Sync error:', e.message);
    }
  }

  // Run first sync after 5 seconds, then every SYNC_INTERVAL
  setTimeout(() => {
    syncToCloud();
    setInterval(syncToCloud, SYNC_INTERVAL);
  }, 5000);

  console.log(`   Sync: pushing to ${SYNC_URL} every ${SYNC_INTERVAL / 1000}s`);
}

// ── Sync status ──────────────────────────────────────────────────────
app.get('/api/sync/status', async (req, res) => {
  if (!IS_CLOUD || !supabase) {
    return res.json({ syncEnabled: false });
  }
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { data } = await supabase
      .from('workspace_data')
      .select('data_type, updated_at')
      .eq('workspace_id', user.workspaceId);
    const types: Record<string, string> = {};
    let latest: string | null = null;
    for (const row of (data || [])) {
      types[row.data_type] = row.updated_at;
      if (!latest || row.updated_at > latest) latest = row.updated_at;
    }
    res.json({ syncEnabled: true, types, latest });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Gateway reconnect ────────────────────────────────────────────────
app.post('/api/gateway/reconnect', async (req, res) => {
  if (!IS_CLOUD) {
    return res.json({ ok: true, message: 'local mode — no cached connection' });
  }
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  gatewayPool.disconnect(user.workspaceId);
  res.json({ ok: true });
});

// ── Account deletion ─────────────────────────────────────────────────
app.delete('/api/account', async (req, res) => {
  if (!IS_CLOUD || !supabase) {
    return res.status(400).json({ error: 'only available in cloud mode' });
  }
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    // Delete workspace first (CASCADE will clean up workspace_data)
    await supabase.from('workspaces').delete().eq('user_id', user.userId);
    // Delete user via admin API
    const { error } = await supabase.auth.admin.deleteUser(user.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞🧠 Open Brain running at http://0.0.0.0:${PORT}`);
  console.log(`   Mode: ${IS_CLOUD ? 'cloud (multi-tenant)' : 'local'}`);
  if (!IS_CLOUD) console.log(`   Data: ${DATA_DIR}`);
  if (process.platform === 'darwin' && !IS_CLOUD) {
    exec(`open http://localhost:${PORT}`);
  }
});
