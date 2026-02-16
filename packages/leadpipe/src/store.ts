import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Lead, Config } from './types.js';
import { isCloudMode, getClient } from '@openbrain/cli-client';

const DIR = path.resolve('.leadpipe');
const LEADS_FILE = path.join(DIR, 'leads.json');
const CONFIG_FILE = path.join(DIR, 'config.yaml');
const TEMPLATES_DIR = path.join(DIR, 'templates');

export function ensureDir(): void {
  if (!fs.existsSync(DIR)) {
    throw new Error('Not initialized. Run `leadpipe init` first.');
  }
}

export function getDir(): string { return DIR; }
export function getTemplatesDir(): string { return TEMPLATES_DIR; }

export async function loadLeads(): Promise<Lead[]> {
  if (isCloudMode()) return getClient().listLeads();
  ensureDir();
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
}

export async function saveLeads(leads: Lead[]): Promise<void> {
  if (isCloudMode()) { await getClient().bulkWriteLeads(leads); return; }
  ensureDir();
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

export async function loadConfig(): Promise<Config> {
  if (isCloudMode()) return getClient().getConfig('leadpipe');
  ensureDir();
  return yaml.load(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Config;
}

export async function saveConfig(config: Config): Promise<void> {
  if (isCloudMode()) { await getClient().writeConfig('leadpipe', config); return; }
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, yaml.dump(config));
}

export function findLead(leads: Lead[], idPrefix: string): Lead | undefined {
  return leads.find(l => l.id.startsWith(idPrefix));
}

export function initStore(): void {
  if (fs.existsSync(DIR)) {
    console.log('.leadpipe/ already exists.');
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(LEADS_FILE, '[]');

  const defaultConfig: Config = {
    pipelines: {
      default: { stages: ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'] },
      agentsmith: { stages: ['lead', 'demo', 'trial', 'negotiation', 'closed', 'churned'] }
    },
    scoring: {
      rules: [
        { type: 'call', points: 30 },
        { type: 'meeting', points: 50 },
        { type: 'email', points: 10 },
        { type: 'dm', points: 20 },
        { type: 'note', points: 5 }
      ]
    },
    stale: { days: 7 },
    csv: { mapping: { name: 'Name', email: 'Email', company: 'Company' } }
  };
  fs.writeFileSync(CONFIG_FILE, yaml.dump(defaultConfig));

  // Default templates
  const templates: Record<string, string> = {
    'cold-dm.md': `Hey {{name}},

Saw your work at {{company}}. I'm building CLI tools for AI marketing agents — think "Unix philosophy" but for marketing.

Would love to show you what we're working on. Free for a quick call this week?

Best,
Benno`,
    'follow-up.md': `Hey {{name}},

Just following up on our last conversation. Any thoughts on what we discussed?

Would love to keep the momentum going. Let me know if you have 15 minutes this week.

Best,
Benno`,
    'proposal-intro.md': `Hi {{name}},

Great chatting with you! As discussed, here's a quick overview of what we can do for {{company}}.

I'll send over a detailed proposal shortly. In the meantime, feel free to reach out with any questions.

Best,
Benno`,
    'check-in.md': `Hey {{name}},

It's been a while since we last connected. How are things going at {{company}}?

Would love to catch up and hear what you're working on. Coffee or a quick call?

Best,
Benno`
  };

  for (const [file, content] of Object.entries(templates)) {
    fs.writeFileSync(path.join(TEMPLATES_DIR, file), content);
  }

  console.log('Initialized .leadpipe/ with config, templates.');
}
