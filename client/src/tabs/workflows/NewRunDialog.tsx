import { useState } from 'react';
import type { WorkflowDef } from '../../types';
import { startWorkflowRun } from '../../api';
import { palette, accentAlpha, zincAlpha } from '../../theme';

export function NewRunDialog({ defs, onClose, onCreated, notify }: {
  defs: WorkflowDef[];
  onClose: () => void;
  onCreated: () => void;
  notify: (msg: string) => void;
}) {
  const [workflowId, setWorkflowId] = useState(defs[0]?.id || '');
  const [task, setTask] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!workflowId || !task.trim()) return;
    setSubmitting(true);
    try {
      await startWorkflowRun(workflowId, task.trim());
      notify('Run started');
      onCreated();
      onClose();
    } catch (e: any) {
      notify(`Failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card rounded-xl p-5 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="text-[14px] font-semibold">Start New Run</div>

        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Workflow</label>
          <select value={workflowId} onChange={e => setWorkflowId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px] bg-transparent border"
            style={{ borderColor: zincAlpha(0.2), color: palette.white }}>
            {defs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Task</label>
          <textarea value={task} onChange={e => setTask(e.target.value)}
            placeholder="Describe the task for this workflow run..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-[13px] bg-transparent border resize-none"
            style={{ borderColor: zincAlpha(0.2), color: palette.white }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-white/[0.03] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting || !task.trim()}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ background: accentAlpha(0.15), color: palette.accent }}>
            {submitting ? 'Starting...' : 'Start Run'}
          </button>
        </div>
      </div>
    </div>
  );
}
