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
  } catch {
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
  await supabase.from('workspace_data').upsert({
    workspace_id: user.workspaceId,
    data_type: dataType,
    data: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,data_type' });
  return true;
}

// --- Workflows ---
const wfStorage = IS_CLOUD
  ? null // Cloud storage created per-request in router
  : new LocalWorkflowStorage();

function getWorkflowStorage(req: express.Request): LocalWorkflowStorage {
  // For now, local storage only. Cloud mode will be added later.
  return wfStorage as LocalWorkflowStorage;
}

const wfEngine = wfStorage ? new WorkflowEngine(wfStorage) : null;

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

// API — file-based endpoints (local mode only, return empty data in cloud mode)
app.get('/api/tasks', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'tasks') || []);
  res.json(readJSON(p('.taskpipe', 'tasks.json')) || []);
});

app.get('/api/leads', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'leads') || []);
  res.json(readJSON(p('.leadpipe', 'leads.json')) || []);
});

app.get('/api/content', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'content') || []);
  res.json(readJSON(p('.contentq', 'queue.json')) || []);
});

app.get('/api/activity', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'activity') || { activity: { events: [], profile: null }, patterns: { completions: [], dailyCompletions: {} } });
  const activity = readJSON(p('.taskpipe', 'activity.json')) || { events: [], profile: null };
  const patterns = readJSON(p('.taskpipe', 'patterns.json')) || { completions: [], dailyCompletions: {} };
  res.json({ activity, patterns });
});

app.get('/api/stats', async (_req, res) => {
  if (IS_CLOUD) return res.json(await readSyncedData(_req, 'stats') || { doneToday: 0, pipelineValue: 0, drafts: 0, streak: 0, stakeRisk: 0, overdueStakes: 0 });
  const tasks = readJSON(p('.taskpipe', 'tasks.json')) || [];
  const leads = readJSON(p('.leadpipe', 'leads.json')) || [];
  const content = readJSON(p('.contentq', 'queue.json')) || [];
  const patterns = readJSON(p('.taskpipe', 'patterns.json')) || { completions: [], dailyCompletions: {} };

  const today = new Date().toISOString().slice(0, 10);
  const doneToday = tasks.filter((t: any) => t.status === 'done' && t.completedAt?.startsWith(today)).length;
  const pipelineValue = leads.filter((l: any) => !['lost'].includes(l.stage)).reduce((s: number, l: any) => s + (l.value || 0), 0);
  const drafts = content.filter((c: any) => c.status === 'draft').length;

  // Calculate streak from dailyCompletions
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if ((patterns.dailyCompletions?.[key] || 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (i === 0) {
      d.setDate(d.getDate() - 1); // today might not have completions yet
    } else break;
  }

  // Stakes at risk
  const overdueTasks = tasks.filter((t: any) => t.stake && t.status !== 'done' && t.due && t.due < today);
  const stakeRisk = overdueTasks.reduce((s: number, t: any) => {
    const m = t.stake?.match(/€([\d,]+)/);
    return s + (m ? parseInt(m[1].replace(',', '')) : 0);
  }, 0);

  res.json({ doneToday, pipelineValue, drafts, streak, stakeRisk, overdueStakes: overdueTasks.length });
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
if (wfEngine && wfStorage) {
  app.use('/api/wf', createWorkflowRouter(wfEngine, wfStorage, authenticateRunToken));
}

app.post('/api/tasks', async (req, res) => {
  const { content, energy, estimate, due, campaign, stake, tags } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  try {
    const tasks = IS_CLOUD
      ? ((await readSyncedData(req, 'tasks')) || [])
      : (readJSON(p('.taskpipe', 'tasks.json')) || []);
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      content,
      status: 'todo',
      energy: energy || 'medium',
      estimate: estimate || null,
      due: due || null,
      campaign: campaign || null,
      stake: stake || null,
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    if (IS_CLOUD) {
      await writeSyncedData(req, 'tasks', tasks);
    } else {
      fs.writeFileSync(p('.taskpipe', 'tasks.json'), JSON.stringify(tasks, null, 2));
    }
    res.json(task);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create lead
app.post('/api/leads', async (req, res) => {
  const { name, email, company, source, value, stage, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const leads = IS_CLOUD
      ? ((await readSyncedData(req, 'leads')) || [])
      : (readJSON(p('.leadpipe', 'leads.json')) || []);
    const now = new Date().toISOString();
    const lead = {
      id: crypto.randomUUID(),
      name,
      email: email || null,
      company: company || null,
      source: source || 'other',
      value: value || 0,
      stage: stage || 'cold',
      score: 0,
      tags: tags || [],
      touches: [],
      createdAt: now,
      updatedAt: now,
    };
    leads.push(lead);
    if (IS_CLOUD) {
      await writeSyncedData(req, 'leads', leads);
    } else {
      fs.writeFileSync(p('.leadpipe', 'leads.json'), JSON.stringify(leads, null, 2));
    }
    res.json(lead);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create content
app.post('/api/content', async (req, res) => {
  const { text, platform, tags } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const queue = IS_CLOUD
      ? ((await readSyncedData(req, 'content')) || [])
      : (readJSON(p('.contentq', 'queue.json')) || []);
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      text,
      platform: platform || 'linkedin',
      status: 'draft',
      tags: tags || [],
      createdAt: now,
      updatedAt: now,
    };
    queue.push(item);
    if (IS_CLOUD) {
      await writeSyncedData(req, 'content', queue);
    } else {
      fs.writeFileSync(p('.contentq', 'queue.json'), JSON.stringify(queue, null, 2));
    }
    res.json(item);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tasks = IS_CLOUD
      ? ((await readSyncedData(req, 'tasks')) || [])
      : (readJSON(p('.taskpipe', 'tasks.json')) || []);
    const task = tasks.find((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    Object.assign(task, req.body, { updatedAt: new Date().toISOString() });
    if (IS_CLOUD) {
      await writeSyncedData(req, 'tasks', tasks);
    } else {
      fs.writeFileSync(p('.taskpipe', 'tasks.json'), JSON.stringify(tasks, null, 2));
    }
    res.json(task);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update lead
app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const leads = IS_CLOUD
      ? ((await readSyncedData(req, 'leads')) || [])
      : (readJSON(p('.leadpipe', 'leads.json')) || []);
    const lead = leads.find((l: any) => id.length < 36 ? l.id.startsWith(id) : l.id === id);
    if (!lead) return res.status(404).json({ error: 'lead not found' });
    Object.assign(lead, req.body, { updatedAt: new Date().toISOString() });
    if (IS_CLOUD) {
      await writeSyncedData(req, 'leads', leads);
    } else {
      fs.writeFileSync(p('.leadpipe', 'leads.json'), JSON.stringify(leads, null, 2));
    }
    res.json(lead);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update content
app.put('/api/content/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const queue = IS_CLOUD
      ? ((await readSyncedData(req, 'content')) || [])
      : (readJSON(p('.contentq', 'queue.json')) || []);
    const item = queue.find((c: any) => id.length < 36 ? c.id.startsWith(id) : c.id === id);
    if (!item) return res.status(404).json({ error: 'content not found' });
    Object.assign(item, req.body, { updatedAt: new Date().toISOString() });
    if (IS_CLOUD) {
      await writeSyncedData(req, 'content', queue);
    } else {
      fs.writeFileSync(p('.contentq', 'queue.json'), JSON.stringify(queue, null, 2));
    }
    res.json(item);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Move task to new status

app.post('/api/tasks/:id/move', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });

  try {
    let tasks: any[];
    if (IS_CLOUD) {
      tasks = (await readSyncedData(req, 'tasks')) || [];
    } else {
      tasks = readJSON(p('.taskpipe', 'tasks.json')) || [];
    }

    const task = tasks.find((t: any) =>
      id.length < 36 ? t.id.startsWith(id) : t.id === id
    );
    if (!task) return res.status(404).json({ error: 'task not found' });

    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (status === 'done') task.completedAt = new Date().toISOString();

    if (IS_CLOUD) {
      await writeSyncedData(req, 'tasks', tasks);
    } else {
      const tasksPath = p('.taskpipe', 'tasks.json');
      fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
    }
    res.json(task);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tasks = IS_CLOUD
      ? ((await readSyncedData(req, 'tasks')) || [])
      : (readJSON(p('.taskpipe', 'tasks.json')) || []);
    const idx = tasks.findIndex((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'task not found' });
    const removed = tasks.splice(idx, 1)[0];
    if (IS_CLOUD) {
      await writeSyncedData(req, 'tasks', tasks);
    } else {
      fs.writeFileSync(p('.taskpipe', 'tasks.json'), JSON.stringify(tasks, null, 2));
    }
    res.json(removed);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
app.post('/api/tasks/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  const tasksPath = p('.taskpipe', 'tasks.json');
  const tasks = readJSON(tasksPath);
  if (!tasks) return res.status(500).json({ error: 'could not read tasks' });

  const taskMap = new Map(tasks.map((t: any) => [t.id, t]));
  const reordered: any[] = [];
  for (const id of ids) {
    const task = taskMap.get(id);
    if (task) {
      reordered.push(task);
      taskMap.delete(id);
    }
  }
  // Append any tasks not in the ids array
  for (const task of taskMap.values()) {
    reordered.push(task);
  }

  fs.writeFileSync(tasksPath, JSON.stringify(reordered, null, 2));
  res.json({ ok: true });
});

// Move lead to new stage

app.post('/api/leads/:id/move', (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage required' });

  const leadsPath = p('.leadpipe', 'leads.json');
  const leads = readJSON(leadsPath);
  if (!leads) return res.status(500).json({ error: 'could not read leads' });

  const lead = leads.find((l: any) =>
    id.length < 36 ? l.id.startsWith(id) : l.id === id
  );
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  lead.stage = stage;
  lead.updatedAt = new Date().toISOString();
  fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
  res.json(lead);
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
  const gw = await getGatewayForRequest(_req);
  res.json({
    enabled: !!gw,
    connected: gw?.isConnected() || false,
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
