import fs from 'fs';
import path from 'path';
import os from 'os';
import type { WorkflowDef, WorkflowRun, WorkflowRunSummary } from './types';

const WF_DIR = path.join(os.homedir(), '.openbrain', 'workflows');
const DEFS_FILE = path.join(WF_DIR, 'definitions.json');
const RUNS_DIR = path.join(WF_DIR, 'runs');

function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }

function readJSON(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function writeJSON(filePath: string, data: any) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Storage Interface ---
export interface WorkflowStorage {
  // Definitions
  listDefs(): Promise<WorkflowDef[]>;
  getDef(id: string): Promise<WorkflowDef | null>;
  saveDef(def: WorkflowDef): Promise<void>;
  deleteDef(id: string): Promise<void>;

  // Runs
  listRuns(filter?: { workflowId?: string; status?: string }): Promise<WorkflowRunSummary[]>;
  getRun(id: string): Promise<WorkflowRun | null>;
  saveRun(run: WorkflowRun): Promise<void>;
  deleteRun(id: string): Promise<void>;
}

// --- Local Storage (JSON files) ---
export class LocalWorkflowStorage implements WorkflowStorage {
  async listDefs(): Promise<WorkflowDef[]> {
    return readJSON(DEFS_FILE) || [];
  }

  async getDef(id: string): Promise<WorkflowDef | null> {
    const defs = await this.listDefs();
    return defs.find(d => d.id === id) || null;
  }

  async saveDef(def: WorkflowDef): Promise<void> {
    const defs = await this.listDefs();
    const idx = defs.findIndex(d => d.id === def.id);
    if (idx >= 0) defs[idx] = def; else defs.push(def);
    writeJSON(DEFS_FILE, defs);
  }

  async deleteDef(id: string): Promise<void> {
    const defs = (await this.listDefs()).filter(d => d.id !== id);
    writeJSON(DEFS_FILE, defs);
  }

  async listRuns(filter?: { workflowId?: string; status?: string }): Promise<WorkflowRunSummary[]> {
    ensureDir(RUNS_DIR);
    const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.json'));
    const summaries: WorkflowRunSummary[] = [];
    for (const f of files) {
      const run = readJSON(path.join(RUNS_DIR, f)) as WorkflowRun | null;
      if (!run) continue;
      if (filter?.workflowId && run.workflowId !== filter.workflowId) continue;
      if (filter?.status && run.status !== filter.status) continue;
      const currentStep = run.steps.find(s => s.status === 'running' || s.status === 'pending');
      const stories = run.stories || [];
      summaries.push({
        id: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        task: run.task,
        status: run.status,
        stepCount: run.steps.length,
        currentStep: currentStep?.stepId,
        storyProgress: stories.length > 0 ? { done: stories.filter(s => s.status === 'done').length, total: stories.length } : undefined,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      });
    }
    return summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return readJSON(path.join(RUNS_DIR, `${id}.json`));
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    writeJSON(path.join(RUNS_DIR, `${run.id}.json`), run);
  }

  async deleteRun(id: string): Promise<void> {
    try { fs.unlinkSync(path.join(RUNS_DIR, `${id}.json`)); } catch {}
  }
}

// --- Cloud Storage (Supabase workspace_data) ---
export class CloudWorkflowStorage implements WorkflowStorage {
  constructor(
    private supabase: any,
    private workspaceId: string,
  ) {}

  private async readData(dataType: string): Promise<any> {
    const { data } = await this.supabase
      .from('workspace_data')
      .select('data')
      .eq('workspace_id', this.workspaceId)
      .eq('data_type', dataType)
      .single();
    return data?.data ?? null;
  }

  private async writeData(dataType: string, payload: any): Promise<void> {
    await this.supabase.from('workspace_data').upsert({
      workspace_id: this.workspaceId,
      data_type: dataType,
      data: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,data_type' });
  }

  async listDefs(): Promise<WorkflowDef[]> {
    return (await this.readData('workflow_defs')) || [];
  }

  async getDef(id: string): Promise<WorkflowDef | null> {
    const defs = await this.listDefs();
    return defs.find(d => d.id === id) || null;
  }

  async saveDef(def: WorkflowDef): Promise<void> {
    const defs = await this.listDefs();
    const idx = defs.findIndex(d => d.id === def.id);
    if (idx >= 0) defs[idx] = def; else defs.push(def);
    await this.writeData('workflow_defs', defs);
  }

  async deleteDef(id: string): Promise<void> {
    const defs = (await this.listDefs()).filter(d => d.id !== id);
    await this.writeData('workflow_defs', defs);
  }

  async listRuns(filter?: { workflowId?: string; status?: string }): Promise<WorkflowRunSummary[]> {
    let runs: WorkflowRun[] = (await this.readData('workflow_runs')) || [];
    if (filter?.workflowId) runs = runs.filter(r => r.workflowId === filter.workflowId);
    if (filter?.status) runs = runs.filter(r => r.status === filter.status);
    return runs.map(run => {
      const currentStep = run.steps.find(s => s.status === 'running' || s.status === 'pending');
      const stories = run.stories || [];
      return {
        id: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        task: run.task,
        status: run.status,
        stepCount: run.steps.length,
        currentStep: currentStep?.stepId,
        storyProgress: stories.length > 0 ? { done: stories.filter(s => s.status === 'done').length, total: stories.length } : undefined,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const runs: WorkflowRun[] = (await this.readData('workflow_runs')) || [];
    return runs.find(r => r.id === id) || null;
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    const runs: WorkflowRun[] = (await this.readData('workflow_runs')) || [];
    const idx = runs.findIndex(r => r.id === run.id);
    if (idx >= 0) runs[idx] = run; else runs.push(run);
    await this.writeData('workflow_runs', runs);
  }

  async deleteRun(id: string): Promise<void> {
    const runs = ((await this.readData('workflow_runs')) || []).filter((r: WorkflowRun) => r.id !== id);
    await this.writeData('workflow_runs', runs);
  }
}
