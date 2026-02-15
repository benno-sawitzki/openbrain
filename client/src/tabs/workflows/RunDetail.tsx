import { useState, useEffect } from 'react';
import type { WorkflowRun } from '../../types';
import { StoryGrid } from './StoryGrid';
import { fetchWorkflowRun, resumeWorkflowRun, pauseWorkflowRun, cancelWorkflowRun } from '../../api';
import { palette, accentAlpha, zincAlpha, mutedAlpha } from '../../theme';

const STEP_COLORS: Record<string, { dot: string; bg: string; border: string }> = {
  waiting: { dot: palette.muted, bg: 'transparent', border: zincAlpha(0.1) },
  pending: { dot: palette.subtle, bg: mutedAlpha(0.04), border: mutedAlpha(0.15) },
  running: { dot: palette.accent, bg: accentAlpha(0.06), border: accentAlpha(0.2) },
  done: { dot: 'rgb(34,197,94)', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)' },
  failed: { dot: 'rgb(239,68,68)', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
};

export function RunDetail({ runId, onBack, notify }: {
  runId: string;
  onBack: () => void;
  notify: (msg: string) => void;
}) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  useEffect(() => {
    const load = () => fetchWorkflowRun(runId).then(setRun).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [runId]);

  if (!run) return <div className="text-center text-muted-foreground py-8">Loading...</div>;

  const handleResume = async () => {
    await resumeWorkflowRun(runId);
    notify('Run resumed');
    fetchWorkflowRun(runId).then(setRun);
  };
  const handlePause = async () => {
    await pauseWorkflowRun(runId);
    notify('Run paused');
    fetchWorkflowRun(runId).then(setRun);
  };
  const handleCancel = async () => {
    await cancelWorkflowRun(runId);
    notify('Run cancelled');
    onBack();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            &larr; Back
          </button>
          <div>
            <div className="text-[14px] font-medium">{run.task.slice(0, 80)}</div>
            <div className="text-[11px] text-muted-foreground">{run.workflowName} &middot; {run.status}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {run.status === 'failed' && (
            <button onClick={handleResume} className="px-3 py-1 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: accentAlpha(0.1), color: palette.accent }}>Resume</button>
          )}
          {run.status === 'running' && (
            <button onClick={handlePause} className="px-3 py-1 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: mutedAlpha(0.1), color: palette.muted }}>Pause</button>
          )}
          {run.status !== 'completed' && run.status !== 'cancelled' && (
            <button onClick={handleCancel} className="px-3 py-1 rounded-lg text-[12px] font-medium text-red-400 hover:bg-red-500/10 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">Steps</div>
        {run.steps.map(step => {
          const colors = STEP_COLORS[step.status] || STEP_COLORS.waiting;
          return (
            <button key={step.id} onClick={() => setSelectedStep(step.id === selectedStep ? null : step.id)}
              className="w-full text-left rounded-lg px-3 py-2 transition-all hover:bg-white/[0.03]"
              style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: colors.dot }} />
                  <span className="text-[12px] font-medium">{step.stepId}</span>
                  <span className="text-[10px] text-muted-foreground">({step.agentId})</span>
                </div>
                <span className="text-[10px] font-medium uppercase" style={{ color: colors.dot }}>{step.status}</span>
              </div>
              {step.id === selectedStep && step.output && (
                <pre className="mt-2 text-[10px] text-muted-foreground/70 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono">
                  {step.output.slice(0, 2000)}
                </pre>
              )}
            </button>
          );
        })}
      </div>

      {/* Stories */}
      {run.stories.length > 0 && <StoryGrid stories={run.stories} />}
    </div>
  );
}
