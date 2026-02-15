import type { WorkflowRunSummary } from '../../types';
import { palette, accentAlpha, zincAlpha, mutedAlpha } from '../../theme';

const STATUS_ORDER = ['running', 'paused', 'completed', 'failed', 'cancelled'] as const;

const STATUS_COLORS: Record<string, { dot: string; bg: string }> = {
  running: { dot: palette.accent, bg: accentAlpha(0.06) },
  paused: { dot: palette.muted, bg: mutedAlpha(0.06) },
  completed: { dot: 'rgb(34,197,94)', bg: 'rgba(34,197,94,0.06)' },
  failed: { dot: 'rgb(239,68,68)', bg: 'rgba(239,68,68,0.06)' },
  cancelled: { dot: palette.muted, bg: 'transparent' },
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RunKanban({ runs, onSelectRun }: {
  runs: WorkflowRunSummary[];
  onSelectRun: (id: string) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STATUS_ORDER.map(status => {
        const statusRuns = runs.filter(r => r.status === status);
        const colors = STATUS_COLORS[status];
        return (
          <div key={status} className="min-w-[260px] flex-1">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-2 h-2 rounded-full" style={{ background: colors.dot }} />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {status}
              </span>
              <span className="text-[10px] text-muted-foreground/50">{statusRuns.length}</span>
            </div>
            <div className="space-y-2">
              {statusRuns.map(run => (
                <button key={run.id} onClick={() => onSelectRun(run.id)}
                  className="w-full text-left glass-card rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-all group">
                  <div className="text-[12px] font-medium text-foreground/90 truncate mb-1">
                    {run.task.slice(0, 60)}{run.task.length > 60 ? '...' : ''}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{run.workflowName}</span>
                    <span>{relativeTime(run.updatedAt)}</span>
                  </div>
                  {run.storyProgress && (
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: zincAlpha(0.1) }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${(run.storyProgress.done / run.storyProgress.total) * 100}%`,
                        background: palette.accent,
                      }} />
                    </div>
                  )}
                </button>
              ))}
              {statusRuns.length === 0 && (
                <div className="text-center text-[11px] text-muted-foreground/40 py-4">No runs</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
