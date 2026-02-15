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

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`🚀 Marketing HQ running at http://localhost:${PORT}`);
  console.log(`📁 Reading from: ${DATA_DIR}`);
  if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  }
});
