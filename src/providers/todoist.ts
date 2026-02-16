// Todoist provider — implements TaskProvider via Todoist REST API v2.

import type { TaskProvider, TaskStats, ProviderCapabilities } from './types';

const BASE = 'https://api.todoist.com/api/v1';

interface TodoistDue {
  date: string;
  datetime?: string;
  timezone?: string;
}

interface TodoistDuration {
  amount: number;
  unit: 'minute' | 'day';
}

interface TodoistTask {
  id: string;
  content: string;
  description: string;
  is_completed: boolean;
  priority: number;        // 1 (normal) – 4 (urgent)
  due: TodoistDue | null;
  labels: string[];
  created_at: string;
  url: string;
  duration: TodoistDuration | null;
  project_id: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function priorityToEnergy(p: number): string {
  if (p >= 3) return 'high';
  if (p === 2) return 'medium';
  return 'low';
}

function energyToPriority(e?: string): number {
  if (e === 'high') return 4;
  if (e === 'medium') return 2;
  return 1;
}

function mapToOB(t: TodoistTask): Record<string, any> {
  const dueStr = t.due?.datetime ?? t.due?.date ?? undefined;
  const estimate =
    t.duration && t.duration.unit === 'minute' ? t.duration.amount : undefined;

  return {
    id: t.id,
    content: t.content,
    status: t.is_completed ? 'done' : 'todo',
    energy: priorityToEnergy(t.priority),
    due: dueStr,
    tags: t.labels,
    createdAt: t.created_at,
    updatedAt: t.created_at, // Todoist doesn't expose updated_at
    estimate,
    meta: {
      description: t.description,
      url: t.url,
      project_id: t.project_id,
      priority: t.priority,
      duration: t.duration,
      due_raw: t.due,
    },
  };
}

function mapToTodoist(data: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = {};
  if (data.content !== undefined) body.content = data.content;
  if (data.due !== undefined) body.due_date = data.due;
  if (data.energy !== undefined) body.priority = energyToPriority(data.energy);
  if (data.tags !== undefined) body.labels = data.tags;
  if (data.estimate !== undefined) {
    body.duration = { amount: data.estimate, unit: 'minute' };
  }
  return body;
}

// ---------------------------------------------------------------------------
// Resolve API key — supports $ENV_VAR or ${ENV_VAR} syntax
// ---------------------------------------------------------------------------

function resolveKey(raw: string): string {
  if (raw.startsWith('$')) {
    const name = raw.replace(/^\$\{?|\}?$/g, '');
    const val = process.env[name];
    if (!val) throw new Error(`Todoist: env var ${name} is not set`);
    return val;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class TodoistProvider implements TaskProvider {
  readonly id = 'todoist';
  readonly name = 'Todoist';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,
    move: true,
    reorder: false,
  };

  private apiKey: string;
  private projectIds?: number[];
  private maxItems: number;

  constructor(config: { api_key: string; project_ids?: number[]; max_items?: number }) {
    this.apiKey = resolveKey(config.api_key);
    this.projectIds = config.project_ids;
    this.maxItems = config.max_items ?? 200;
  }

  // ---- internal fetch wrapper ----

  private async req<T = any>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Todoist API ${res.status}: ${text}`);
    }
    // DELETE / close / reopen return 204 with no body
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  // ---- TaskProvider implementation ----

  async list(opts?: { limit?: number; status?: string }): Promise<any[]> {
    const limit = opts?.limit ?? this.maxItems;
    let tasks: TodoistTask[] = [];

    if (this.projectIds && this.projectIds.length > 0) {
      // Fetch from each configured project
      const fetches = this.projectIds.map((pid) =>
        this.req<TodoistTask[]>(`/tasks?project_id=${pid}&limit=${limit}`),
      );
      const results = await Promise.all(fetches);
      tasks = results.flat();
    } else {
      tasks = await this.req<TodoistTask[]>(`/tasks?limit=${limit}`);
    }

    // Optional status filter
    if (opts?.status === 'done') {
      tasks = tasks.filter((t) => t.is_completed);
    } else if (opts?.status === 'todo') {
      tasks = tasks.filter((t) => !t.is_completed);
    }

    return tasks.slice(0, limit).map(mapToOB);
  }

  async get(id: string): Promise<any | null> {
    try {
      const t = await this.req<TodoistTask>(`/tasks/${id}`);
      return mapToOB(t);
    } catch (err: any) {
      if (err?.message?.includes('404')) return null;
      throw err;
    }
  }

  async stats(): Promise<TaskStats> {
    const tasks = await this.list();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let overdue = 0;
    for (const t of tasks) {
      if (t.status === 'todo' && t.due && t.due < todayStr) {
        overdue++;
      }
    }

    return {
      total: tasks.length,
      doneToday: 0, // Todoist active-task list doesn't include completed tasks
      overdue,
      streak: undefined,
    };
  }

  async create(data: Partial<any>): Promise<any> {
    const body = mapToTodoist(data);
    const t = await this.req<TodoistTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapToOB(t);
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const body = mapToTodoist(data);
    const t = await this.req<TodoistTask>(`/tasks/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapToOB(t);
  }

  async delete(id: string): Promise<void> {
    await this.req(`/tasks/${id}`, { method: 'DELETE' });
  }

  async move(id: string, status: string): Promise<any> {
    if (status === 'done') {
      await this.req(`/tasks/${id}/close`, { method: 'POST' });
    } else {
      await this.req(`/tasks/${id}/reopen`, { method: 'POST' });
    }
    // Re-fetch so we return the updated OB task
    return this.get(id);
  }
}
