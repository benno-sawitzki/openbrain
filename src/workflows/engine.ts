import crypto from 'crypto';
import type { WorkflowDef, WorkflowRun, WorkflowRunStep } from './types';
import type { WorkflowStorage } from './storage';

function resolveTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
    if (key in context) return context[key];
    const lower = key.toLowerCase();
    if (lower in context) return context[lower];
    return `[missing: ${key}]`;
  });
}

export class WorkflowEngine {
  constructor(private storage: WorkflowStorage) {}

  async startRun(def: WorkflowDef, task: string): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    const runToken = crypto.randomBytes(32).toString('base64url');

    const steps: WorkflowRunStep[] = def.steps.map((s, i) => ({
      id: crypto.randomUUID(),
      runId: '',  // filled below
      stepId: s.id,
      agentId: s.agentId,
      stepIndex: i,
      inputTemplate: s.inputTemplate,
      expects: s.expects,
      type: s.type,
      loopConfig: s.loopConfig ? JSON.stringify(s.loopConfig) : undefined,
      status: i === 0 ? 'pending' : 'waiting',
      retryCount: 0,
      maxRetries: s.maxRetries ?? 2,
      createdAt: now,
      updatedAt: now,
    }));

    const run: WorkflowRun = {
      id: crypto.randomUUID(),
      workflowId: def.id,
      workflowName: def.name,
      task,
      status: 'running',
      context: { task },
      runToken,
      steps: steps.map(s => ({ ...s, runId: '' })),
      stories: [],
      createdAt: now,
      updatedAt: now,
    };

    // Set runId on all steps
    run.steps = run.steps.map(s => ({ ...s, runId: run.id }));

    await this.storage.saveRun(run);
    return run;
  }

  async claimStep(agentId: string, runToken?: string): Promise<{ found: boolean; stepId?: string; runId?: string; resolvedInput?: string }> {
    // Find runs with pending steps for this agent
    const allRuns = await this.storage.listRuns({ status: 'running' });
    for (const summary of allRuns) {
      const run = await this.storage.getRun(summary.id);
      if (!run || run.status !== 'running') continue;
      if (runToken && run.runToken !== runToken) continue;

      const step = run.steps.find(s => s.agentId === agentId && s.status === 'pending');
      if (!step) continue;

      const context = { ...run.context };

      // Loop step with stories
      if (step.type === 'loop' && step.loopConfig) {
        const loopConfig = JSON.parse(step.loopConfig);
        if (loopConfig.over === 'stories') {
          const nextStory = run.stories.find(s => s.status === 'pending');
          if (!nextStory) {
            // No more stories — mark step done and advance
            step.status = 'done';
            step.updatedAt = new Date().toISOString();
            this.advancePipeline(run);
            await this.storage.saveRun(run);
            continue; // Don't return this step, look for next
          }

          // Claim the story
          nextStory.status = 'running';
          nextStory.updatedAt = new Date().toISOString();
          step.status = 'running';
          step.currentStoryId = nextStory.id;
          step.updatedAt = new Date().toISOString();

          // Build template vars
          const doneStories = run.stories.filter(s => s.status === 'done');
          const pendingCount = run.stories.filter(s => s.status === 'pending' || s.status === 'running').length;
          context['current_story'] = `Story ${nextStory.storyId}: ${nextStory.title}\n\n${nextStory.description}\n\nAcceptance Criteria:\n${nextStory.acceptanceCriteria.map((c, i) => `  ${i+1}. ${c}`).join('\n')}`;
          context['current_story_id'] = nextStory.storyId;
          context['current_story_title'] = nextStory.title;
          context['completed_stories'] = doneStories.length > 0 ? doneStories.map(s => `- ${s.storyId}: ${s.title}`).join('\n') : '(none yet)';
          context['stories_remaining'] = String(pendingCount);

          await this.storage.saveRun(run);
          return { found: true, stepId: step.id, runId: run.id, resolvedInput: resolveTemplate(step.inputTemplate, context) };
        }
      }

      // Single step
      step.status = 'running';
      step.updatedAt = new Date().toISOString();
      await this.storage.saveRun(run);
      return { found: true, stepId: step.id, runId: run.id, resolvedInput: resolveTemplate(step.inputTemplate, context) };
    }

    return { found: false };
  }

  async completeStep(stepId: string, output: string): Promise<{ advanced: boolean; runCompleted: boolean }> {
    const run = await this.findRunByStepId(stepId);
    if (!run) throw new Error(`Step not found: ${stepId}`);

    const step = run.steps.find(s => s.id === stepId)!;
    const now = new Date().toISOString();

    // Merge KEY: value lines into context
    for (const line of output.split('\n')) {
      const match = line.match(/^([A-Z_]+):\s*(.+)$/);
      if (match && !match[1].startsWith('STORIES_JSON')) {
        run.context[match[1].toLowerCase()] = match[2].trim();
      }
    }

    // Parse STORIES_JSON
    try {
      this.parseAndInsertStories(output, run);
    } catch (e: any) {
      // Graceful failure — mark step and run as failed
      step.status = 'failed';
      step.output = `STORIES_JSON parse error: ${e.message}`;
      step.updatedAt = now;
      run.status = 'failed';
      run.updatedAt = now;
      await this.storage.saveRun(run);
      return { advanced: false, runCompleted: false };
    }

    // Loop step completion with current story
    if (step.type === 'loop' && step.currentStoryId) {
      const story = run.stories.find(s => s.id === step.currentStoryId);
      if (story) {
        story.status = 'done';
        story.output = output;
        story.updatedAt = now;
      }
      step.currentStoryId = undefined;
      step.output = output;
      step.updatedAt = now;

      // Check for verify_each
      if (step.loopConfig) {
        const lc = JSON.parse(step.loopConfig);
        if (lc.verifyEach && lc.verifyStep) {
          const verifyStep = run.steps.find(s => s.stepId === lc.verifyStep);
          if (verifyStep) {
            verifyStep.status = 'pending';
            verifyStep.updatedAt = now;
            step.status = 'running'; // Keep loop step running
            await this.storage.saveRun(run);
            return { advanced: false, runCompleted: false };
          }
        }
      }

      // Check for more stories
      const hasPending = run.stories.some(s => s.status === 'pending');
      if (hasPending) {
        step.status = 'pending';
        step.updatedAt = now;
        await this.storage.saveRun(run);
        return { advanced: false, runCompleted: false };
      }

      // All stories done
      step.status = 'done';
      step.updatedAt = now;
      const result = this.advancePipeline(run);
      await this.storage.saveRun(run);
      return result;
    }

    // Check if this is a verify step triggered by verify_each
    const loopStep = run.steps.find(s => s.type === 'loop' && s.status === 'running');
    if (loopStep?.loopConfig) {
      const lc = JSON.parse(loopStep.loopConfig);
      if (lc.verifyEach && lc.verifyStep === step.stepId) {
        const status = run.context['status']?.toLowerCase();
        step.status = 'waiting';
        step.output = output;
        step.updatedAt = now;

        if (status === 'retry') {
          // Find last done story and retry it
          const doneStories = run.stories.filter(s => s.status === 'done').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          if (doneStories.length > 0) {
            const lastDone = doneStories[0];
            lastDone.retryCount++;
            if (lastDone.retryCount >= lastDone.maxRetries) {
              lastDone.status = 'failed';
              loopStep.status = 'failed';
              run.status = 'failed';
              run.updatedAt = now;
              await this.storage.saveRun(run);
              return { advanced: false, runCompleted: false };
            }
            lastDone.status = 'pending';
            lastDone.updatedAt = now;
          }
          loopStep.status = 'pending';
          loopStep.updatedAt = now;
          await this.storage.saveRun(run);
          return { advanced: false, runCompleted: false };
        }

        // Verify passed — check for more stories
        delete run.context['verify_feedback'];
        const hasPending = run.stories.some(s => s.status === 'pending');
        if (hasPending) {
          loopStep.status = 'pending';
          loopStep.updatedAt = now;
          await this.storage.saveRun(run);
          return { advanced: false, runCompleted: false };
        }

        // All done
        loopStep.status = 'done';
        loopStep.updatedAt = now;
        const result = this.advancePipeline(run);
        await this.storage.saveRun(run);
        return result;
      }
    }

    // Single step: mark done and advance
    step.status = 'done';
    step.output = output;
    step.updatedAt = now;
    const result = this.advancePipeline(run);
    await this.storage.saveRun(run);
    return result;
  }

  async failStep(stepId: string, error: string): Promise<{ retrying: boolean; runFailed: boolean }> {
    const run = await this.findRunByStepId(stepId);
    if (!run) throw new Error(`Step not found: ${stepId}`);

    const step = run.steps.find(s => s.id === stepId)!;
    const now = new Date().toISOString();

    // Loop step failure — per-story retry
    if (step.type === 'loop' && step.currentStoryId) {
      const story = run.stories.find(s => s.id === step.currentStoryId);
      if (story) {
        story.retryCount++;
        if (story.retryCount >= story.maxRetries) {
          story.status = 'failed';
          step.status = 'failed';
          step.output = error;
          step.currentStoryId = undefined;
          run.status = 'failed';
          run.updatedAt = now;
          await this.storage.saveRun(run);
          return { retrying: false, runFailed: true };
        }
        story.status = 'pending';
        story.updatedAt = now;
      }
      step.status = 'pending';
      step.currentStoryId = undefined;
      step.updatedAt = now;
      await this.storage.saveRun(run);
      return { retrying: true, runFailed: false };
    }

    // Single step retry
    step.retryCount++;
    if (step.retryCount >= step.maxRetries) {
      step.status = 'failed';
      step.output = error;
      step.updatedAt = now;
      run.status = 'failed';
      run.updatedAt = now;
      await this.storage.saveRun(run);
      return { retrying: false, runFailed: true };
    }

    step.status = 'pending';
    step.updatedAt = now;
    await this.storage.saveRun(run);
    return { retrying: true, runFailed: false };
  }

  async pauseRun(runId: string): Promise<void> {
    const run = await this.storage.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.status = 'paused';
    run.updatedAt = new Date().toISOString();
    await this.storage.saveRun(run);
  }

  async resumeRun(runId: string): Promise<void> {
    const run = await this.storage.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status !== 'failed' && run.status !== 'paused') throw new Error(`Run is ${run.status}, not failed/paused`);

    const now = new Date().toISOString();

    // Find failed step and reset it
    const failedStep = run.steps.find(s => s.status === 'failed');
    if (failedStep) {
      failedStep.status = 'pending';
      failedStep.currentStoryId = undefined;
      failedStep.updatedAt = now;

      // Reset failed stories
      for (const story of run.stories) {
        if (story.status === 'failed') {
          story.status = 'pending';
          story.updatedAt = now;
          break; // Only reset the first failed story
        }
      }
    }

    run.status = 'running';
    run.updatedAt = now;
    await this.storage.saveRun(run);
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.storage.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.status = 'cancelled';
    run.updatedAt = new Date().toISOString();
    await this.storage.saveRun(run);
  }

  // --- Private helpers ---

  private advancePipeline(run: WorkflowRun): { advanced: boolean; runCompleted: boolean } {
    const next = run.steps.find(s => s.status === 'waiting');
    if (next) {
      next.status = 'pending';
      next.updatedAt = new Date().toISOString();
      return { advanced: true, runCompleted: false };
    }
    run.status = 'completed';
    run.updatedAt = new Date().toISOString();
    return { advanced: false, runCompleted: true };
  }

  private parseAndInsertStories(output: string, run: WorkflowRun): void {
    const lines = output.split('\n');
    const startIdx = lines.findIndex(l => l.startsWith('STORIES_JSON:'));
    if (startIdx === -1) return;

    const firstLine = lines[startIdx].slice('STORIES_JSON:'.length).trim();
    const jsonLines = [firstLine];
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^[A-Z_]+:\s/.test(lines[i])) break;
      jsonLines.push(lines[i]);
    }

    const jsonText = jsonLines.join('\n').trim();
    const stories = JSON.parse(jsonText);
    if (!Array.isArray(stories)) throw new Error('STORIES_JSON must be an array');
    if (stories.length > 20) throw new Error(`Too many stories: ${stories.length}`);

    const now = new Date().toISOString();
    for (let i = 0; i < stories.length; i++) {
      const s = stories[i];
      const ac = s.acceptanceCriteria ?? s.acceptance_criteria;
      if (!s.id || !s.title || !s.description || !Array.isArray(ac)) {
        throw new Error(`Story ${i} missing fields`);
      }
      run.stories.push({
        id: crypto.randomUUID(),
        runId: run.id,
        storyIndex: i,
        storyId: s.id,
        title: s.title,
        description: s.description,
        acceptanceCriteria: ac,
        status: 'pending',
        retryCount: 0,
        maxRetries: 2,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async findRunByStepId(stepId: string): Promise<WorkflowRun | null> {
    const allRuns = await this.storage.listRuns();
    for (const summary of allRuns) {
      const run = await this.storage.getRun(summary.id);
      if (run?.steps.some(s => s.id === stepId)) return run;
    }
    return null;
  }
}
