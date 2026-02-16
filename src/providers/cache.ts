// Generic caching wrapper for providers.
// Caches read operations (list, get, stats) with configurable TTL.
// Write operations (create, update, delete, move) pass through and invalidate the cache.

import type { TaskProvider, CrmProvider, ContentProvider } from './types';

interface CacheEntry {
  data: any;
  ts: number;
}

type AnyProvider = TaskProvider | CrmProvider | ContentProvider;

export class CachedProvider<T extends AnyProvider> {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private inner: T,
    private ttl = 300_000, // 5 minutes default
  ) {}

  get id() { return this.inner.id; }
  get name() { return this.inner.name; }
  get capabilities() { return this.inner.capabilities; }

  private getCached(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.ts < this.ttl) return entry.data;
    if (entry) this.cache.delete(key);
    return undefined;
  }

  private setCached(key: string, data: any) {
    this.cache.set(key, { data, ts: Date.now() });
  }

  invalidate() {
    this.cache.clear();
  }

  async list(opts?: Record<string, any>): Promise<any[]> {
    const key = `list:${JSON.stringify(opts || {})}`;
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;
    const data = await this.inner.list(opts);
    this.setCached(key, data);
    return data;
  }

  async get(id: string): Promise<any | null> {
    const key = `get:${id}`;
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;
    const data = await this.inner.get(id);
    this.setCached(key, data);
    return data;
  }

  async stats(): Promise<any> {
    const key = 'stats';
    const cached = this.getCached(key);
    if (cached !== undefined) return cached;
    const data = await this.inner.stats();
    this.setCached(key, data);
    return data;
  }

  // Write-through: execute then invalidate
  async create(data: Partial<any>): Promise<any> {
    const result = await this.inner.create(data);
    this.invalidate();
    return result;
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const result = await this.inner.update(id, data);
    this.invalidate();
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.inner.delete(id);
    this.invalidate();
  }

  async move(id: string, target: string): Promise<any> {
    const result = await this.inner.move(id, target);
    this.invalidate();
    return result;
  }

  async reorder(ids: string[]): Promise<void> {
    if ('reorder' in this.inner && typeof this.inner.reorder === 'function') {
      await this.inner.reorder(ids);
      this.invalidate();
    }
  }
}
