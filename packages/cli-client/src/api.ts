import { resolveApiKey, resolveApiUrl } from './auth';

export class OpenBrainClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || resolveApiKey() || '';
    this.baseUrl = (baseUrl || resolveApiUrl()).replace(/\/$/, '');
    if (!this.apiKey) throw new Error('No API key configured. Run `<tool> init --cloud` or set OPENBRAIN_API_KEY.');
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`API error ${res.status}: ${(err as any).error || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  // --- Tasks ---
  async listTasks(): Promise<any[]> { return this.request('GET', '/api/tasks'); }
  async bulkWriteTasks(tasks: any[]): Promise<void> { await this.request('PUT', '/api/tasks/bulk', tasks); }
  async createTask(task: any): Promise<any> { return this.request('POST', '/api/tasks', task); }
  async updateTask(id: string, updates: any): Promise<any> { return this.request('PUT', `/api/tasks/${id}`, updates); }
  async deleteTask(id: string): Promise<void> { await this.request('DELETE', `/api/tasks/${id}`); }
  async moveTask(id: string, status: string): Promise<any> { return this.request('POST', `/api/tasks/${id}/move`, { status }); }
  async reorderTasks(ids: string[]): Promise<void> { await this.request('POST', '/api/tasks/reorder', { ids }); }

  // --- Leads ---
  async listLeads(): Promise<any[]> { return this.request('GET', '/api/leads'); }
  async bulkWriteLeads(leads: any[]): Promise<void> { await this.request('PUT', '/api/leads/bulk', leads); }
  async createLead(lead: any): Promise<any> { return this.request('POST', '/api/leads', lead); }
  async updateLead(id: string, updates: any): Promise<any> { return this.request('PUT', `/api/leads/${id}`, updates); }
  async deleteLead(id: string): Promise<void> { await this.request('DELETE', `/api/leads/${id}`); }
  async moveLead(id: string, stage: string): Promise<any> { return this.request('POST', `/api/leads/${id}/move`, { stage }); }

  // --- Content ---
  async listContent(): Promise<any[]> { return this.request('GET', '/api/content'); }
  async bulkWriteContent(content: any[]): Promise<void> { await this.request('PUT', '/api/content/bulk', content); }
  async createContent(item: any): Promise<any> { return this.request('POST', '/api/content', item); }
  async updateContent(id: string, updates: any): Promise<any> { return this.request('PUT', `/api/content/${id}`, updates); }
  async deleteContent(id: string): Promise<void> { await this.request('DELETE', `/api/content/${id}`); }

  // --- Other data ---
  async getStats(): Promise<any> { return this.request('GET', '/api/stats'); }
  async getActivity(): Promise<any> { return this.request('GET', '/api/activity'); }
  async getPatterns(): Promise<any> { return this.request('GET', '/api/patterns'); }
  async writePatterns(patterns: any): Promise<void> { await this.request('PUT', '/api/patterns', patterns); }
  async getConfig(tool: string): Promise<any> { return this.request('GET', `/api/config/${tool}`); }
  async writeConfig(tool: string, config: any): Promise<void> { await this.request('PUT', `/api/config/${tool}`, config); }
  async getInbox(): Promise<any[]> { return this.request('GET', '/api/inbox'); }
  async writeInbox(items: any[]): Promise<void> { await this.request('PUT', '/api/inbox', items); }

  // --- Keys ---
  async generateKey(): Promise<{ key: string }> { return this.request('POST', '/api/keys'); }
  async getKeyStatus(): Promise<{ exists: boolean; masked?: string }> { return this.request('GET', '/api/keys'); }
  async revokeKey(): Promise<void> { await this.request('DELETE', '/api/keys'); }

  // --- Health ---
  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/api/stats');
      return true;
    } catch { return false; }
  }
}
