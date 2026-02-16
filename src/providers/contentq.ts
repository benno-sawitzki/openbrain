import { randomUUID } from 'crypto';
import type { ContentProvider, ContentStats, ProviderCapabilities } from './types';

export class ContentqProvider implements ContentProvider {
  readonly id = 'contentq';
  readonly name = 'Content Queue';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,
    move: true,
    reorder: false,
  };

  private readData: () => Promise<any[]>;
  private writeData: (items: any[]) => Promise<void>;

  constructor(opts: {
    readData: () => Promise<any[]>;
    writeData: (items: any[]) => Promise<void>;
  }) {
    this.readData = opts.readData;
    this.writeData = opts.writeData;
  }

  private findById(items: any[], id: string): any | undefined {
    return id.length < 36
      ? items.find((c: any) => c.id.startsWith(id))
      : items.find((c: any) => c.id === id);
  }

  async list(opts?: { limit?: number; status?: string }): Promise<any[]> {
    let items = await this.readData();
    if (opts?.status) {
      items = items.filter((c: any) => c.status === opts.status);
    }
    if (opts?.limit) {
      items = items.slice(0, opts.limit);
    }
    return items;
  }

  async get(id: string): Promise<any | null> {
    const items = await this.readData();
    return this.findById(items, id) || null;
  }

  async stats(): Promise<ContentStats> {
    const items = await this.readData();
    return {
      drafts: items.filter((c: any) => c.status === 'draft').length,
      scheduled: items.filter((c: any) => c.status === 'scheduled').length,
      published: items.filter((c: any) => c.status === 'published').length,
    };
  }

  async create(data: Partial<any>): Promise<any> {
    const items = await this.readData();
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      text: data.text || '',
      platform: data.platform || 'linkedin',
      status: data.status || 'draft',
      tags: data.tags || [],
      scheduledFor: data.scheduledFor || null,
      createdAt: now,
      updatedAt: now,
    };

    items.push(item);
    await this.writeData(items);
    return item;
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const items = await this.readData();
    const item = this.findById(items, id);
    if (!item) throw new Error(`Content item not found: ${id}`);

    Object.assign(item, data, { updatedAt: new Date().toISOString() });
    await this.writeData(items);
    return item;
  }

  async delete(id: string): Promise<void> {
    const items = await this.readData();
    const idx = id.length < 36
      ? items.findIndex((c: any) => c.id.startsWith(id))
      : items.findIndex((c: any) => c.id === id);
    if (idx === -1) throw new Error(`Content item not found: ${id}`);

    items.splice(idx, 1);
    await this.writeData(items);
  }

  async move(id: string, status: string): Promise<any> {
    const items = await this.readData();
    const item = this.findById(items, id);
    if (!item) throw new Error(`Content item not found: ${id}`);

    item.status = status;
    item.updatedAt = new Date().toISOString();
    await this.writeData(items);
    return item;
  }
}
