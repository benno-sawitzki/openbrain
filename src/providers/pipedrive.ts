// Pipedrive provider — implements CrmProvider via Pipedrive REST API v1.

import type { CrmProvider, CrmStats, ProviderCapabilities } from './types';

// ---------------------------------------------------------------------------
// Pipedrive API types
// ---------------------------------------------------------------------------

interface PipedrivePerson {
  value: number;
  name: string;
  email: Array<{ value: string; primary: boolean }>;
}

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: 'open' | 'won' | 'lost' | 'deleted';
  stage_id: number;
  pipeline_id: number;
  person_id: PipedrivePerson | number | null;
  person_name: string | null;
  org_id: number | { value: number; name: string } | null;
  org_name: string | null;
  add_time: string;
  update_time: string;
  next_activity_date: string | null;
  activities_count: number;
  won_time: string | null;
  lost_time: string | null;
  [key: string]: unknown;
}

interface PipedriveStage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr: number;
}

interface PipedriveResponse<T> {
  success: boolean;
  data: T;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractEmail(person: PipedrivePerson | number | null): string | null {
  if (!person || typeof person === 'number') return null;
  const primary = person.email?.find(e => e.primary);
  return primary?.value ?? person.email?.[0]?.value ?? null;
}

function extractCompany(deal: PipedriveDeal): string | null {
  if (deal.org_name) return deal.org_name;
  if (deal.org_id && typeof deal.org_id === 'object') return deal.org_id.name;
  return null;
}

function resolveKey(raw: string): string {
  if (raw.startsWith('$')) {
    const name = raw.replace(/^\$\{?|\}?$/g, '');
    const val = process.env[name];
    if (!val) throw new Error(`Pipedrive: env var ${name} is not set`);
    return val;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class PipedriveProvider implements CrmProvider {
  readonly id = 'pipedrive';
  readonly name = 'Pipedrive';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,
    move: true,
    reorder: false,
  };

  private apiToken: string;
  private baseUrl: string;
  private pipelineId?: number;

  // Bidirectional stage mapping: stage_id ↔ OB stage name
  private stageToOB = new Map<number, string>();
  private obToStage = new Map<string, number>();
  private stagesLoaded: boolean;
  private stagesPromise: Promise<void> | null = null;

  constructor(config: {
    api_key: string;
    domain?: string;
    pipeline_id?: number;
    stage_mapping?: Record<number | string, string>;
  }) {
    this.apiToken = resolveKey(config.api_key);
    this.baseUrl = config.domain
      ? `https://${config.domain}.pipedrive.com/api/v1`
      : 'https://api.pipedrive.com/api/v1';
    this.pipelineId = config.pipeline_id;

    if (config.stage_mapping) {
      for (const [stageId, obName] of Object.entries(config.stage_mapping)) {
        const id = Number(stageId);
        this.stageToOB.set(id, obName);
        this.obToStage.set(obName, id);
      }
      this.stagesLoaded = true;
    } else {
      this.stagesLoaded = false;
    }
  }

  // ---- Internal fetch wrapper ----

  private async req<T = any>(path: string, init?: RequestInit): Promise<T> {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${sep}api_token=${this.apiToken}`;

    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pipedrive API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ---- Lazy stage loading (when no stage_mapping in config) ----

  private async ensureStages(): Promise<void> {
    if (this.stagesLoaded) return;
    if (!this.stagesPromise) {
      this.stagesPromise = this.loadStages();
    }
    return this.stagesPromise;
  }

  private async loadStages(): Promise<void> {
    try {
      const path = this.pipelineId
        ? `/stages?pipeline_id=${this.pipelineId}`
        : '/stages';
      const res = await this.req<PipedriveResponse<PipedriveStage[] | null>>(path);

      for (const s of res.data ?? []) {
        const name = s.name.toLowerCase().replace(/\s+/g, '-');
        this.stageToOB.set(s.id, name);
        if (!this.obToStage.has(name)) {
          this.obToStage.set(name, s.id);
        }
      }
    } catch (err) {
      console.warn('[pipedrive] Failed to load stages:', err);
    }
    this.stagesLoaded = true;
  }

  // ---- Map Pipedrive deal → OB lead ----

  private mapToOB(deal: PipedriveDeal): Record<string, any> {
    let stage: string;
    if (deal.status === 'won') {
      stage = 'won';
    } else if (deal.status === 'lost') {
      stage = 'lost';
    } else {
      stage = this.stageToOB.get(deal.stage_id) ?? `stage-${deal.stage_id}`;
    }

    return {
      id: String(deal.id),
      name: deal.title,
      email: extractEmail(deal.person_id),
      company: extractCompany(deal),
      source: null,
      value: deal.value ?? 0,
      stage,
      score: 0,
      tags: [],
      touches: deal.activities_count
        ? [{ type: 'activities', count: deal.activities_count }]
        : [],
      followUp: deal.next_activity_date ?? null,
      createdAt: deal.add_time,
      updatedAt: deal.update_time,
      meta: {
        currency: deal.currency,
        pipeline_id: deal.pipeline_id,
        stage_id: deal.stage_id,
        won_time: deal.won_time,
        lost_time: deal.lost_time,
      },
    };
  }

  // ---- Map OB lead fields → Pipedrive deal body ----

  private mapToPipedrive(data: Record<string, any>): Record<string, any> {
    const body: Record<string, any> = {};
    if (data.name !== undefined) body.title = data.name;
    if (data.value !== undefined) body.value = data.value;
    if (data.stage !== undefined) {
      if (data.stage === 'won') {
        body.status = 'won';
      } else if (data.stage === 'lost') {
        body.status = 'lost';
      } else {
        const stageId = this.obToStage.get(data.stage);
        if (stageId !== undefined) body.stage_id = stageId;
        body.status = 'open';
      }
    }
    return body;
  }

  // ---- CrmProvider implementation ----

  async list(opts?: { limit?: number; stage?: string }): Promise<any[]> {
    await this.ensureStages();

    const limit = opts?.limit ?? 100;
    const res = await this.req<PipedriveResponse<PipedriveDeal[] | null>>(
      `/deals?status=all_not_deleted&limit=${limit}`,
    );
    let deals = res.data ?? [];

    // Filter to configured pipeline
    if (this.pipelineId) {
      deals = deals.filter(d => d.pipeline_id === this.pipelineId);
    }

    // Filter by OB stage if requested
    if (opts?.stage) {
      deals = deals.filter(d => {
        if (opts.stage === 'won') return d.status === 'won';
        if (opts.stage === 'lost') return d.status === 'lost';
        return this.stageToOB.get(d.stage_id) === opts.stage && d.status === 'open';
      });
    }

    return deals.map(d => this.mapToOB(d));
  }

  async get(id: string): Promise<any | null> {
    await this.ensureStages();
    try {
      const res = await this.req<PipedriveResponse<PipedriveDeal>>(`/deals/${id}`);
      return res.data ? this.mapToOB(res.data) : null;
    } catch (err: any) {
      if (err?.message?.includes('404')) return null;
      throw err;
    }
  }

  async stats(): Promise<CrmStats> {
    const leads = await this.list();

    const nonLost = leads.filter((l: any) => l.stage !== 'lost');
    const pipelineValue = nonLost.reduce((s: number, l: any) => s + (l.value || 0), 0);
    const totalLeads = leads.length;

    const won = leads.filter((l: any) => l.stage === 'won');
    const wonValue = won.reduce((s: number, l: any) => s + (l.value || 0), 0);
    const conversionRate = totalLeads > 0 ? won.length / totalLeads : 0;

    return { pipelineValue, totalLeads, wonValue, conversionRate };
  }

  async create(data: Partial<any>): Promise<any> {
    await this.ensureStages();
    const body = this.mapToPipedrive(data);
    if (!body.title) body.title = data.name || 'New Deal';

    const res = await this.req<PipedriveResponse<PipedriveDeal>>('/deals', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.mapToOB(res.data);
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    await this.ensureStages();
    const body = this.mapToPipedrive(data);

    const res = await this.req<PipedriveResponse<PipedriveDeal>>(`/deals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return this.mapToOB(res.data);
  }

  async delete(id: string): Promise<void> {
    await this.req(`/deals/${id}`, { method: 'DELETE' });
  }

  async move(id: string, stage: string): Promise<any> {
    return this.update(id, { stage });
  }
}
