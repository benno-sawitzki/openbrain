#!/usr/bin/env node
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import { exec } from 'child_process';

const app = express();
const PORT = parseInt(process.env.MARKETING_HQ_PORT || '4000', 10);

// Resolve data directory
function resolveDir(): string {
  const flagIdx = process.argv.indexOf('--dir');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1];
  if (process.env.MARKETING_HQ_DIR) return process.env.MARKETING_HQ_DIR;
  return path.join(os.homedir(), 'marketing-test');
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

// API
app.get('/api/tasks', (_req, res) => {
  res.json(readJSON(p('.taskpipe', 'tasks.json')) || []);
});

app.get('/api/leads', (_req, res) => {
  res.json(readJSON(p('.leadpipe', 'leads.json')) || []);
});

app.get('/api/content', (_req, res) => {
  res.json(readJSON(p('.contentq', 'queue.json')) || []);
});

app.get('/api/activity', (_req, res) => {
  const activity = readJSON(p('.taskpipe', 'activity.json')) || { events: [], profile: null };
  const patterns = readJSON(p('.taskpipe', 'patterns.json')) || { completions: [], dailyCompletions: {} };
  res.json({ activity, patterns });
});

app.get('/api/stats', (_req, res) => {
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

app.get('/api/config', (_req, res) => {
  res.json({
    taskpipe: readYAML(p('.taskpipe', 'config.yaml')) || {},
    leadpipe: readYAML(p('.leadpipe', 'config.yaml')) || {},
    contentq: readYAML(p('.contentq', 'config.yaml')) || {},
  });
});

// Inbox media files
app.use('/inbox', express.static(path.join(DATA_DIR, '.contentq', 'inbox')));

app.get('/api/inbox', (_req, res) => {
  res.json(readJSON(p('.contentq', 'inbox.json')) || []);
});

let agentsCache: { data: any; ts: number } = { data: null, ts: 0 };

app.get('/api/agents', (_req, res) => {
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

  exec(`node "${antfarmCli}" logs 2>/dev/null`, (err, logsOut) => {
    exec(`node "${antfarmCli}" workflow status 2>/dev/null`, (err2, statusOut) => {
      const data = {
        available: true,
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

app.post('/api/tasks', (req, res) => {
  const { content, energy, estimate, due, campaign, stake, tags } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const tasksPath = p('.taskpipe', 'tasks.json');
  const tasks = readJSON(tasksPath) || [];
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
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  res.json(task);
});

// Create lead
app.post('/api/leads', (req, res) => {
  const { name, email, company, source, value, stage, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const leadsPath = p('.leadpipe', 'leads.json');
  const leads = readJSON(leadsPath) || [];
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
  fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
  res.json(lead);
});

// Create content
app.post('/api/content', (req, res) => {
  const { text, platform, tags } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const queuePath = p('.contentq', 'queue.json');
  const queue = readJSON(queuePath) || [];
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
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  res.json(item);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const tasksPath = p('.taskpipe', 'tasks.json');
  const tasks = readJSON(tasksPath);
  if (!tasks) return res.status(500).json({ error: 'could not read tasks' });
  const task = tasks.find((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  const updates = req.body;
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  res.json(task);
});

// Update lead
app.put('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const leadsPath = p('.leadpipe', 'leads.json');
  const leads = readJSON(leadsPath);
  if (!leads) return res.status(500).json({ error: 'could not read leads' });
  const lead = leads.find((l: any) => id.length < 36 ? l.id.startsWith(id) : l.id === id);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  const updates = req.body;
  Object.assign(lead, updates, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2));
  res.json(lead);
});

// Update content
app.put('/api/content/:id', (req, res) => {
  const { id } = req.params;
  const queuePath = p('.contentq', 'queue.json');
  const queue = readJSON(queuePath);
  if (!queue) return res.status(500).json({ error: 'could not read content' });
  const item = queue.find((c: any) => id.length < 36 ? c.id.startsWith(id) : c.id === id);
  if (!item) return res.status(404).json({ error: 'content not found' });
  const updates = req.body;
  Object.assign(item, updates, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  res.json(item);
});

// Move task to new status

app.post('/api/tasks/:id/move', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });

  const tasksPath = p('.taskpipe', 'tasks.json');
  const tasks = readJSON(tasksPath);
  if (!tasks) return res.status(500).json({ error: 'could not read tasks' });

  const task = tasks.find((t: any) =>
    id.length < 36 ? t.id.startsWith(id) : t.id === id
  );
  if (!task) return res.status(404).json({ error: 'task not found' });

  task.status = status;
  task.updatedAt = new Date().toISOString();
  if (status === 'done') task.completedAt = new Date().toISOString();
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  res.json(task);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const tasksPath = p('.taskpipe', 'tasks.json');
  const tasks = readJSON(tasksPath);
  if (!tasks) return res.status(500).json({ error: 'could not read tasks' });
  const idx = tasks.findIndex((t: any) => id.length < 36 ? t.id.startsWith(id) : t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'task not found' });
  const removed = tasks.splice(idx, 1)[0];
  fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  res.json(removed);
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

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`🚀 Marketing HQ running at http://localhost:${PORT}`);
  console.log(`📁 Reading from: ${DATA_DIR}`);
  if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  }
});
