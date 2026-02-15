import type { WorkflowStory } from '../../types';
import { palette, accentAlpha, zincAlpha } from '../../theme';

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: 'transparent', border: zincAlpha(0.15), text: palette.muted },
  running: { bg: accentAlpha(0.06), border: accentAlpha(0.2), text: palette.accent },
  done: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)', text: 'rgb(34,197,94)' },
  failed: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: 'rgb(239,68,68)' },
};

export function StoryGrid({ stories }: { stories: WorkflowStory[] }) {
  if (stories.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">
        Stories ({stories.filter(s => s.status === 'done').length}/{stories.length})
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {stories.map(story => {
          const colors = STATUS_COLORS[story.status] || STATUS_COLORS.pending;
          return (
            <div key={story.id}
              className="rounded-lg px-3 py-2 transition-all"
              style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-mono" style={{ color: colors.text }}>{story.storyId}</span>
                <span className="text-[9px] font-medium uppercase" style={{ color: colors.text }}>{story.status}</span>
              </div>
              <div className="text-[12px] text-foreground/80 truncate">{story.title}</div>
              {story.retryCount > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">retry {story.retryCount}/{story.maxRetries}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
