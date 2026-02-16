// GitHub Issues provider — implements TaskProvider via GitHub REST API.
// Status is derived from labels (configurable mapping) and issue state.

import type { TaskProvider, TaskStats, ProviderCapabilities } from './types';

const BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// GitHub API types (subset)
// ---------------------------------------------------------------------------

interface GitHubLabel {
  id: number;
  name: string;
  color?: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  assignees: { login: string }[];
  milestone: { title: string } | null;
  pull_request?: unknown; // present only on PRs
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Default label → status mapping (case-insensitive)
// ---------------------------------------------------------------------------

const DEFAULT_LABEL_MAP: Record<string, string> = {
  'in-progress': 'doing',
  'doing': 'doing',
  'blocked': 'blocked',
  'waiting': 'blocked',
  'review': 'review',
  'in-review': 'review',
};

// All OB statuses that correspond to labels (not state-derived)
const STATUS_LABELS = new Set(Object.keys(DEFAULT_LABEL_MAP));

function buildLabelMap(custom?: Record<string, string>): Record<string, string> {
  if (!custom) return DEFAULT_LABEL_MAP;
  // Merge custom on top of defaults, all keys lowercased
  const merged: Record<string, string> = { ...DEFAULT_LABEL_MAP };
  for (const [k, v] of Object.entries(custom)) {
    merged[k.toLowerCase()] = v;
  }
  return merged;
}

// Invert: OB status → list of label names that map to it
function invertMap(map: Record<string, string>): Record<string, string[]> {
  const inv: Record<string, string[]> = {};
  for (const [label, status] of Object.entries(map)) {
    (inv[status] ??= []).push(label);
  }
  return inv;
}

// ---------------------------------------------------------------------------
// Resolve token — supports $ENV_VAR / ${ENV_VAR} syntax
// ---------------------------------------------------------------------------

function resolveKey(raw: string): string {
  if (raw.startsWith('$')) {
    const name = raw.replace(/^\$\{?|\}?$/g, '');
    const val = process.env[name];
    if (!val) throw new Error(`GitHub: env var ${name} is not set`);
    return val;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class GitHubProvider implements TaskProvider {
  readonly id = 'github';
  readonly name = 'GitHub Issues';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,  // delete = close
    move: true,
    reorder: false,
  };

  private token: string;
  private owner: string;
  private repo: string;
  private maxItems: number;
  private labelMap: Record<string, string>;
  private invertedMap: Record<string, string[]>;

  constructor(config: {
    token: string;
    owner: string;
    repo: string;
    max_items?: number;
    label_mapping?: Record<string, string>;
  }) {
    this.token = resolveKey(config.token);
    this.owner = config.owner;
    this.repo = config.repo;
    this.maxItems = config.max_items ?? 100;
    this.labelMap = buildLabelMap(config.label_mapping);
    this.invertedMap = invertMap(this.labelMap);
  }

  // ---- internal fetch wrapper ----

  private async req<T = any>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  private repoPath(suffix: string = ''): string {
    return `/repos/${this.owner}/${this.repo}/issues${suffix}`;
  }

  // ---- mapping helpers ----

  private issueToStatus(issue: GitHubIssue): string {
    if (issue.state === 'closed') return 'done';
    // Check labels (first match wins, case-insensitive)
    for (const label of issue.labels) {
      const mapped = this.labelMap[label.name.toLowerCase()];
      if (mapped) return mapped;
    }
    return 'todo';
  }

  /** Get the set of label names that are status labels (so we can remove them on move). */
  private statusLabelNames(): Set<string> {
    return new Set(Object.keys(this.labelMap));
  }

  private mapToOB(issue: GitHubIssue): Record<string, any> {
    const status = this.issueToStatus(issue);
    const statusLabels = this.statusLabelNames();
    // Non-status labels become tags
    const tags = issue.labels
      .filter((l) => !statusLabels.has(l.name.toLowerCase()))
      .map((l) => l.name);

    return {
      id: String(issue.number),
      content: issue.title,
      status,
      tags,
      due: undefined, // GitHub issues don't have native due dates
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      meta: {
        body: issue.body,
        url: issue.html_url,
        assignees: issue.assignees.map((a) => a.login),
        milestone: issue.milestone?.title,
        closedAt: issue.closed_at,
        allLabels: issue.labels.map((l) => l.name),
      },
    };
  }

  // ---- TaskProvider implementation ----

  async list(opts?: { limit?: number; status?: string }): Promise<any[]> {
    const limit = opts?.limit ?? this.maxItems;
    // Fetch both open and closed if no status filter, otherwise optimize
    let state: 'open' | 'closed' | 'all' = 'all';
    if (opts?.status === 'done') state = 'closed';
    else if (opts?.status && opts.status !== 'done') state = 'open';

    const perPage = Math.min(limit, 100); // GitHub max per_page is 100
    let issues: GitHubIssue[] = [];
    let page = 1;

    // Paginate until we have enough
    while (issues.length < limit) {
      const batch = await this.req<GitHubIssue[]>(
        this.repoPath(`?state=${state}&per_page=${perPage}&sort=updated&direction=desc&page=${page}`),
      );
      if (batch.length === 0) break;
      issues.push(...batch);
      if (batch.length < perPage) break; // last page
      page++;
    }

    // Filter out pull requests
    issues = issues.filter((i) => !i.pull_request);

    // Map and apply status filter for non-trivial statuses (doing, blocked, etc.)
    let mapped = issues.map((i) => this.mapToOB(i));

    if (opts?.status) {
      mapped = mapped.filter((t) => t.status === opts.status);
    }

    return mapped.slice(0, limit);
  }

  async get(id: string): Promise<any | null> {
    try {
      const issue = await this.req<GitHubIssue>(this.repoPath(`/${id}`));
      if (issue.pull_request) return null; // it's a PR
      return this.mapToOB(issue);
    } catch (err: any) {
      if (err?.message?.includes('404')) return null;
      throw err;
    }
  }

  async stats(): Promise<TaskStats> {
    const tasks = await this.list();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let doneToday = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.status === 'done' && t.meta?.closedAt?.startsWith(todayStr)) {
        doneToday++;
      }
      if (t.status === 'todo' && t.due && t.due < todayStr) {
        overdue++;
      }
    }

    return {
      total: tasks.length,
      doneToday,
      overdue,
    };
  }

  async create(data: Partial<any>): Promise<any> {
    const labels: string[] = data.tags ? [...data.tags] : [];
    // Add status label if not 'todo' (todo = no status label)
    if (data.status && data.status !== 'todo') {
      const statusLabels = this.invertedMap[data.status];
      if (statusLabels?.[0]) labels.push(statusLabels[0]);
    }

    const issue = await this.req<GitHubIssue>(this.repoPath(), {
      method: 'POST',
      body: JSON.stringify({
        title: data.content,
        body: data.meta?.body ?? data.description ?? '',
        labels,
      }),
    });
    return this.mapToOB(issue);
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const body: Record<string, any> = {};
    if (data.content !== undefined) body.title = data.content;
    if (data.meta?.body !== undefined) body.body = data.meta.body;
    if (data.description !== undefined) body.body = data.description;

    if (data.tags !== undefined) {
      // Preserve status labels, replace non-status labels
      const current = await this.req<GitHubIssue>(this.repoPath(`/${id}`));
      const statusLabels = this.statusLabelNames();
      const currentStatusLabels = current.labels
        .filter((l) => statusLabels.has(l.name.toLowerCase()))
        .map((l) => l.name);
      body.labels = [...currentStatusLabels, ...data.tags];
    }

    const issue = await this.req<GitHubIssue>(this.repoPath(`/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return this.mapToOB(issue);
  }

  async delete(id: string): Promise<void> {
    // GitHub doesn't support deletion — close the issue instead
    await this.req(this.repoPath(`/${id}`), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  async move(id: string, status: string): Promise<any> {
    const statusLabels = this.statusLabelNames();

    // Fetch current issue to know existing labels
    const current = await this.req<GitHubIssue>(this.repoPath(`/${id}`));

    // Remove all status labels, keep non-status labels
    const nonStatusLabels = current.labels
      .filter((l) => !statusLabels.has(l.name.toLowerCase()))
      .map((l) => l.name);

    // Build patch
    const patch: Record<string, any> = {};

    if (status === 'done') {
      // Close the issue, remove status labels
      patch.state = 'closed';
      patch.labels = nonStatusLabels;
    } else {
      // (Re)open if currently closed
      if (current.state === 'closed') {
        patch.state = 'open';
      }
      // Add the new status label (if not 'todo', which means no status label)
      const newLabels = [...nonStatusLabels];
      if (status !== 'todo') {
        const candidates = this.invertedMap[status];
        if (candidates?.[0]) newLabels.push(candidates[0]);
      }
      patch.labels = newLabels;
    }

    const issue = await this.req<GitHubIssue>(this.repoPath(`/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return this.mapToOB(issue);
  }
}
