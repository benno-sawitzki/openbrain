import { randomUUID } from 'crypto';
import type { CrmProvider, CrmStats, ProviderCapabilities } from './types';

export class LeadpipeProvider implements CrmProvider {
  readonly id = 'leadpipe';
  readonly name = 'Leadpipe';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,
    move: true,
    reorder: false,
  };

  private readData: () => Promise<any[]>;
  private writeData: (leads: any[]) => Promise<void>;

  constructor(opts: {
    readData: () => Promise<any[]>;
    writeData: (leads: any[]) => Promise<void>;
  }) {
    this.readData = opts.readData;
    this.writeData = opts.writeData;
  }

  private findById(items: any[], id: string): any | undefined {
    return id.length < 36
      ? items.find((l: any) => l.id.startsWith(id))
      : items.find((l: any) => l.id === id);
  }

  async list(opts?: { limit?: number; stage?: string }): Promise<any[]> {
    let leads = await this.readData();
    if (opts?.stage) {
      leads = leads.filter((l: any) => l.stage === opts.stage);
    }
    if (opts?.limit) {
      leads = leads.slice(0, opts.limit);
    }
    return leads;
  }

  async get(id: string): Promise<any | null> {
    const leads = await this.readData();
    return this.findById(leads, id) || null;
  }

  async stats(): Promise<CrmStats> {
    const leads = await this.readData();

    const pipelineValue = leads
      .filter((l: any) => l.stage !== 'lost')
      .reduce((s: number, l: any) => s + (l.value || 0), 0);

    const totalLeads = leads.length;

    const wonLeads = leads.filter((l: any) => l.stage === 'won');
    const wonValue = wonLeads.reduce(
      (s: number, l: any) => s + (l.value || 0),
      0
    );

    const conversionRate =
      totalLeads > 0 ? wonLeads.length / totalLeads : 0;

    return { pipelineValue, totalLeads, wonValue, conversionRate };
  }

  async create(data: Partial<any>): Promise<any> {
    const leads = await this.readData();
    const now = new Date().toISOString();
    const lead = {
      id: randomUUID(),
      name: data.name || '',
      email: data.email || null,
      company: data.company || null,
      source: data.source || null,
      value: data.value || 0,
      stage: data.stage || 'cold',
      score: data.score || 0,
      tags: data.tags || [],
      touches: data.touches || [],
      followUp: data.followUp || null,
      createdAt: now,
      updatedAt: now,
    };

    leads.push(lead);
    await this.writeData(leads);
    return lead;
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const leads = await this.readData();
    const lead = this.findById(leads, id);
    if (!lead) throw new Error(`Lead not found: ${id}`);

    Object.assign(lead, data, { updatedAt: new Date().toISOString() });
    await this.writeData(leads);
    return lead;
  }

  async delete(id: string): Promise<void> {
    const leads = await this.readData();
    const idx = id.length < 36
      ? leads.findIndex((l: any) => l.id.startsWith(id))
      : leads.findIndex((l: any) => l.id === id);
    if (idx === -1) throw new Error(`Lead not found: ${id}`);

    leads.splice(idx, 1);
    await this.writeData(leads);
  }

  async move(id: string, stage: string): Promise<any> {
    const leads = await this.readData();
    const lead = this.findById(leads, id);
    if (!lead) throw new Error(`Lead not found: ${id}`);

    lead.stage = stage;
    lead.updatedAt = new Date().toISOString();
    await this.writeData(leads);
    return lead;
  }
}
