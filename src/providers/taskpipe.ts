import { randomUUID } from 'crypto';
import type { TaskProvider, TaskStats, ProviderCapabilities } from './types';

export class TaskpipeProvider implements TaskProvider {
  readonly id = 'taskpipe';
  readonly name = 'Taskpipe';
  readonly capabilities: ProviderCapabilities = {
    create: true,
    update: true,
    delete: true,
    move: true,
    reorder: true,
  };

  private readData: () => Promise<any[]>;
  private writeData: (tasks: any[]) => Promise<void>;
  private readPatterns?: () => Promise<any>;

  constructor(opts: {
    readData: () => Promise<any[]>;
    writeData: (tasks: any[]) => Promise<void>;
    readPatterns?: () => Promise<any>;
  }) {
    this.readData = opts.readData;
    this.writeData = opts.writeData;
    this.readPatterns = opts.readPatterns;
  }

  private findById(items: any[], id: string): any | undefined {
    return id.length < 36
      ? items.find((t: any) => t.id.startsWith(id))
      : items.find((t: any) => t.id === id);
  }

  async list(opts?: { limit?: number; status?: string }): Promise<any[]> {
    let tasks = await this.readData();
    if (opts?.status) {
      tasks = tasks.filter((t: any) => t.status === opts.status);
    }
    if (opts?.limit) {
      tasks = tasks.slice(0, opts.limit);
    }
    return tasks;
  }

  async get(id: string): Promise<any | null> {
    const tasks = await this.readData();
    return this.findById(tasks, id) || null;
  }

  async stats(): Promise<TaskStats> {
    const tasks = await this.readData();
    const patterns = this.readPatterns
      ? await this.readPatterns()
      : { completions: [], dailyCompletions: {} };

    const today = new Date().toISOString().slice(0, 10);
    const doneToday = tasks.filter(
      (t: any) => t.status === 'done' && t.completedAt?.startsWith(today)
    ).length;

    const overdue = tasks.filter(
      (t: any) => t.status !== 'done' && t.due && t.due < today
    ).length;

    // Calculate streak from dailyCompletions
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      if ((patterns.dailyCompletions?.[key] || 0) > 0) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (i === 0) {
        d.setDate(d.getDate() - 1); // today might not have completions yet
      } else break;
    }

    // Stakes at risk
    const overdueTasks = tasks.filter(
      (t: any) => t.stake && t.status !== 'done' && t.due && t.due < today
    );
    const stakeRisk = overdueTasks.reduce((s: number, t: any) => {
      const m = t.stake?.match(/€([\d,]+)/);
      return s + (m ? parseInt(m[1].replace(',', '')) : 0);
    }, 0);

    return {
      total: tasks.length,
      doneToday,
      overdue,
      streak,
      stakeRisk,
      overdueStakes: overdueTasks.length,
    };
  }

  async create(data: Partial<any>): Promise<any> {
    const tasks = await this.readData();
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      content: data.content || '',
      status: 'todo',
      energy: data.energy || null,
      estimate: data.estimate || null,
      due: data.due || null,
      tags: data.tags || [],
      campaign: data.campaign || null,
      stake: data.stake || null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    tasks.push(task);
    await this.writeData(tasks);
    return task;
  }

  async update(id: string, data: Partial<any>): Promise<any> {
    const tasks = await this.readData();
    const task = this.findById(tasks, id);
    if (!task) throw new Error(`Task not found: ${id}`);

    Object.assign(task, data, { updatedAt: new Date().toISOString() });
    await this.writeData(tasks);
    return task;
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.readData();
    const idx = id.length < 36
      ? tasks.findIndex((t: any) => t.id.startsWith(id))
      : tasks.findIndex((t: any) => t.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);

    tasks.splice(idx, 1);
    await this.writeData(tasks);
  }

  async move(id: string, status: string): Promise<any> {
    const tasks = await this.readData();
    const task = this.findById(tasks, id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (status === 'done') {
      task.completedAt = new Date().toISOString();
    }
    await this.writeData(tasks);
    return task;
  }

  async reorder(ids: string[]): Promise<void> {
    const tasks = await this.readData();
    const taskMap = new Map(tasks.map((t: any) => [t.id, t]));
    const reordered: any[] = [];

    for (const id of ids) {
      const task = taskMap.get(id);
      if (task) {
        reordered.push(task);
        taskMap.delete(id);
      }
    }
    // Append any tasks not in the ids list
    for (const task of taskMap.values()) {
      reordered.push(task);
    }

    await this.writeData(reordered);
  }
}
