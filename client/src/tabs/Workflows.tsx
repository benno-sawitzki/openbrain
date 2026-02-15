import { useState, useEffect } from 'react';
import { fetchWorkflowDefs, fetchWorkflowRuns } from '../api';
import type { WorkflowDef, WorkflowRunSummary } from '../types';
import { WorkflowSelector } from './workflows/WorkflowSelector';
import { RunKanban } from './workflows/RunKanban';
import { RunDetail } from './workflows/RunDetail';
import { NewRunDialog } from './workflows/NewRunDialog';
import { ImportWorkflowDialog } from './workflows/ImportWorkflowDialog';
import { palette, accentAlpha, zincAlpha } from '../theme';

export function WorkflowsTab({ notify }: { notify: (msg: string) => void }) {
  const [defs, setDefs] = useState<WorkflowDef[]>([]);
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [showNewRun, setShowNewRun] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [d, r] = await Promise.all([
        fetchWorkflowDefs(),
        fetchWorkflowRuns(selectedWorkflow ? { workflowId: selectedWorkflow } : undefined),
      ]);
      setDefs(d);
      setRuns(r);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [selectedWorkflow]);

  if (selectedRun) {
    return <RunDetail runId={selectedRun} onBack={() => { setSelectedRun(null); loadData(); }} notify={notify} />;
  }

  const activeRuns = runs.filter(r => r.status === 'running').length;
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const failedRuns = runs.filter(r => r.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Workflows</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {defs.length} definition{defs.length !== 1 ? 's' : ''} · {runs.length} run{runs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WorkflowSelector defs={defs} selected={selectedWorkflow} onSelect={setSelectedWorkflow} />
          <button onClick={() => setShowImport(true)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-white/[0.03]"
            style={{ border: `1px solid ${zincAlpha(0.2)}`, color: palette.muted }}>
            Import
          </button>
          <button onClick={() => setShowNewRun(true)} disabled={defs.length === 0}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ background: accentAlpha(0.15), color: palette.accent }}>
            + New Run
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4">
        {[
          { label: 'Active', value: activeRuns, color: palette.accent },
          { label: 'Completed', value: completedRuns, color: 'rgb(34,197,94)' },
          { label: 'Failed', value: failedRuns, color: 'rgb(239,68,68)' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-lg px-4 py-2.5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            <div>
              <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading workflows...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground/50 text-[13px]">No workflow runs yet</div>
          <div className="text-muted-foreground/30 text-[11px] mt-1">
            {defs.length === 0 ? 'Import a workflow definition to get started' : 'Start a new run to begin'}
          </div>
        </div>
      ) : (
        <RunKanban runs={runs} onSelectRun={setSelectedRun} />
      )}

      {/* Dialogs */}
      {showNewRun && <NewRunDialog defs={defs} onClose={() => setShowNewRun(false)} onCreated={loadData} notify={notify} />}
      {showImport && <ImportWorkflowDialog onClose={() => setShowImport(false)} onImported={loadData} notify={notify} />}
    </div>
  );
}
