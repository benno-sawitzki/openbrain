// Provider interfaces for the three Open Brain slots: tasks, CRM, content.
// Each external service (Todoist, Pipedrive, etc.) implements one of these.

export interface ProviderCapabilities {
  create: boolean;
  update: boolean;
  delete: boolean;
  move: boolean;
  reorder: boolean;
}

// --- Task Provider ---

export interface TaskStats {
  total: number;
  doneToday: number;
  overdue: number;
  streak?: number;
  stakeRisk?: number;
  overdueStakes?: number;
}

export interface TaskProvider {
  readonly id: string;       // 'todoist', 'taskpipe', 'github'
  readonly name: string;     // 'Todoist', 'Taskpipe'
  readonly capabilities: ProviderCapabilities;

  list(opts?: { limit?: number; status?: string }): Promise<any[]>;
  get(id: string): Promise<any | null>;
  stats(): Promise<TaskStats>;

  create(data: Partial<any>): Promise<any>;
  update(id: string, data: Partial<any>): Promise<any>;
  delete(id: string): Promise<void>;
  move(id: string, status: string): Promise<any>;
  reorder?(ids: string[]): Promise<void>;
}

// --- CRM Provider ---

export interface CrmStats {
  pipelineValue: number;
  totalLeads: number;
  wonValue: number;
  conversionRate: number;
}

export interface CrmProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  list(opts?: { limit?: number; stage?: string }): Promise<any[]>;
  get(id: string): Promise<any | null>;
  stats(): Promise<CrmStats>;

  create(data: Partial<any>): Promise<any>;
  update(id: string, data: Partial<any>): Promise<any>;
  delete(id: string): Promise<void>;
  move(id: string, stage: string): Promise<any>;
}

// --- Content Provider ---

export interface ContentStats {
  drafts: number;
  scheduled: number;
  published: number;
}

export interface ContentProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  list(opts?: { limit?: number; status?: string }): Promise<any[]>;
  get(id: string): Promise<any | null>;
  stats(): Promise<ContentStats>;

  create(data: Partial<any>): Promise<any>;
  update(id: string, data: Partial<any>): Promise<any>;
  delete(id: string): Promise<void>;
  move(id: string, status: string): Promise<any>;
}

// --- Module info returned by /api/modules ---

export interface ModuleInfo {
  provider: string;     // e.g. 'todoist', 'taskpipe'
  name: string;         // e.g. 'Todoist', 'Taskpipe'
  writable: boolean;    // can the dashboard create/update items?
}

export interface ModulesResponse {
  tasks: ModuleInfo | false;
  crm: ModuleInfo | false;
  content: ModuleInfo | false;
}

// --- Provider config from openbrain.yaml ---

export interface ProviderConfig {
  providers?: {
    tasks?: string;
    crm?: string;
    content?: string;
  };
  todoist?: {
    api_key?: string;
    project_ids?: number[];
    max_items?: number;
  };
  pipedrive?: {
    api_key?: string;
    domain?: string;
    pipeline_id?: number;
    stage_mapping?: Record<number, string>;
  };
  github?: {
    token?: string;
    owner?: string;
    repo?: string;
    max_items?: number;
  };
  [key: string]: unknown;
}
