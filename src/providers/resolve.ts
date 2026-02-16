import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type {
  TaskProvider,
  CrmProvider,
  ContentProvider,
  ProviderConfig,
  ModulesResponse,
} from './types';
import { TaskpipeProvider } from './taskpipe';
import { LeadpipeProvider } from './leadpipe';
import { ContentqProvider } from './contentq';
import { TodoistProvider } from './todoist';
import { CachedProvider } from './cache';

// ---------------------------------------------------------------------------
// Resolved providers bundle
// ---------------------------------------------------------------------------

export interface ResolvedProviders {
  tasks: TaskProvider | null;
  crm: CrmProvider | null;
  content: ContentProvider | null;
}

// ---------------------------------------------------------------------------
// Environment variable expansion
// ---------------------------------------------------------------------------

/** Recursively expand ${ENV_VAR} and $ENV_VAR references in string values. */
function expandEnv(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Full replacement: entire value is a single env ref
    if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(obj)) {
      const name = obj.slice(2, -1);
      return process.env[name] ?? obj;
    }
    if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(obj)) {
      const name = obj.slice(1);
      return process.env[name] ?? obj;
    }
    // Inline expansion: replace ${VAR} occurrences within a larger string
    return obj.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
      return process.env[name] ?? _match;
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnv);
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = expandEnv(v);
    }
    return out;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// File-based read/write helpers
// ---------------------------------------------------------------------------

function fileReader(filePath: string): () => Promise<any[]> {
  return async () => {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };
}

function fileWriter(filePath: string): (data: any[]) => Promise<void> {
  return async (data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export function resolveProviders(opts: {
  dataDir: string;
  configPath?: string;
  cloudReadData?: (dataType: string) => Promise<any>;
  cloudWriteData?: (dataType: string, data: any) => Promise<void>;
  cloudReadModifyWrite?: (
    dataType: string,
    modify: (items: any[]) => any[] | null,
  ) => Promise<{ items: any[] | null; error?: string }>;
  readPatterns?: () => Promise<any>;
}): ResolvedProviders {
  const { dataDir, cloudReadData, cloudWriteData, readPatterns } = opts;
  const isCloud = typeof cloudReadData === 'function';

  // ---- 1. Load config ----

  const configPath =
    opts.configPath ?? path.join(dataDir, '..', 'openbrain.yaml');

  let config: ProviderConfig | null = null;
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(raw) as ProviderConfig | null;
      config = parsed ? (expandEnv(parsed) as ProviderConfig) : null;
    }
  } catch (err) {
    console.warn('[resolve] Failed to read openbrain.yaml:', err);
  }

  // ---- 2. Helper: build read/write for a CLI data file ----

  function makeReadWrite(
    dataType: string,
    localFilePath: string,
  ): { readData: () => Promise<any[]>; writeData: (data: any[]) => Promise<void> } {
    if (isCloud) {
      return {
        readData: async () => (await cloudReadData(dataType)) || [],
        writeData: async (data) => cloudWriteData!(dataType, data),
      };
    }
    return {
      readData: fileReader(localFilePath),
      writeData: fileWriter(localFilePath),
    };
  }

  // ---- 3. Resolve tasks ----

  let tasks: TaskProvider | null = null;

  const configuredTasks = config?.providers?.tasks;
  if (configuredTasks) {
    switch (configuredTasks) {
      case 'taskpipe': {
        const tasksFile = path.join(dataDir, '.taskpipe', 'tasks.json');
        const patternsFile = path.join(dataDir, '.taskpipe', 'patterns.json');
        const rw = makeReadWrite('tasks', tasksFile);
        const patternsReader =
          readPatterns ??
          (isCloud ? undefined : fileReader(patternsFile));
        tasks = new TaskpipeProvider({
          ...rw,
          readPatterns: patternsReader,
        });
        break;
      }
      case 'todoist': {
        if (config?.todoist?.api_key) {
          const inner = new TodoistProvider(
            config.todoist as { api_key: string; project_ids?: number[]; max_items?: number },
          );
          tasks = new CachedProvider<TaskProvider>(inner, 300_000) as unknown as TaskProvider;
        } else {
          console.warn('[resolve] Todoist configured but no api_key provided');
        }
        break;
      }
      default:
        console.warn(`[resolve] Unknown tasks provider: ${configuredTasks}`);
    }
  } else {
    // Auto-detect
    if (isCloud) {
      const rw = makeReadWrite('tasks', '');
      tasks = new TaskpipeProvider({
        ...rw,
        readPatterns: readPatterns,
      });
    } else if (fs.existsSync(path.join(dataDir, '.taskpipe'))) {
      const tasksFile = path.join(dataDir, '.taskpipe', 'tasks.json');
      const patternsFile = path.join(dataDir, '.taskpipe', 'patterns.json');
      tasks = new TaskpipeProvider({
        readData: fileReader(tasksFile),
        writeData: fileWriter(tasksFile),
        readPatterns: fileReader(patternsFile),
      });
    }
  }

  // ---- 4. Resolve CRM ----

  let crm: CrmProvider | null = null;

  const configuredCrm = config?.providers?.crm;
  if (configuredCrm) {
    switch (configuredCrm) {
      case 'leadpipe': {
        const leadsFile = path.join(dataDir, '.leadpipe', 'leads.json');
        const rw = makeReadWrite('leads', leadsFile);
        crm = new LeadpipeProvider(rw);
        break;
      }
      case 'pipedrive':
      case 'hubspot':
        console.warn(`[resolve] ${configuredCrm} provider not yet implemented`);
        break;
      default:
        console.warn(`[resolve] Unknown CRM provider: ${configuredCrm}`);
    }
  } else {
    // Auto-detect
    if (isCloud) {
      const rw = makeReadWrite('leads', '');
      crm = new LeadpipeProvider(rw);
    } else if (fs.existsSync(path.join(dataDir, '.leadpipe'))) {
      const leadsFile = path.join(dataDir, '.leadpipe', 'leads.json');
      crm = new LeadpipeProvider({
        readData: fileReader(leadsFile),
        writeData: fileWriter(leadsFile),
      });
    }
  }

  // ---- 5. Resolve content ----

  let content: ContentProvider | null = null;

  const configuredContent = config?.providers?.content;
  if (configuredContent) {
    switch (configuredContent) {
      case 'contentq': {
        const queueFile = path.join(dataDir, '.contentq', 'queue.json');
        const rw = makeReadWrite('content', queueFile);
        content = new ContentqProvider(rw);
        break;
      }
      default:
        console.warn(`[resolve] Unknown content provider: ${configuredContent}`);
    }
  } else {
    // Auto-detect
    if (isCloud) {
      const rw = makeReadWrite('content', '');
      content = new ContentqProvider(rw);
    } else if (fs.existsSync(path.join(dataDir, '.contentq'))) {
      const queueFile = path.join(dataDir, '.contentq', 'queue.json');
      content = new ContentqProvider({
        readData: fileReader(queueFile),
        writeData: fileWriter(queueFile),
      });
    }
  }

  return { tasks, crm, content };
}

// ---------------------------------------------------------------------------
// Module info helper for /api/modules
// ---------------------------------------------------------------------------

export function getModulesResponse(providers: ResolvedProviders): ModulesResponse {
  return {
    tasks: providers.tasks
      ? {
          provider: providers.tasks.id,
          name: providers.tasks.name,
          writable: providers.tasks.capabilities.create,
        }
      : false,
    crm: providers.crm
      ? {
          provider: providers.crm.id,
          name: providers.crm.name,
          writable: providers.crm.capabilities.create,
        }
      : false,
    content: providers.content
      ? {
          provider: providers.content.id,
          name: providers.content.name,
          writable: providers.content.capabilities.create,
        }
      : false,
  };
}
