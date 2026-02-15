import { useState, useEffect } from 'react';
import { fetchFeed } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { palette, accentAlpha, zincAlpha } from '../theme';

interface FeedItem {
  type: 'activity' | 'task' | 'lead' | 'content';
  title: string;
  detail: string;
  time: string;
  icon: string;
}

interface FeedData {
  items: FeedItem[];
  counts: { activity: number; task: number; lead: number; content: number };
}

type Filter = 'all' | 'activity' | 'task' | 'lead' | 'content';

const FILTER_OPTIONS: { id: Filter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '\u25C8' },
  { id: 'task', label: 'Tasks', icon: '\u2705' },
  { id: 'lead', label: 'Leads', icon: '\u{1F91D}' },
  { id: 'content', label: 'Content', icon: '\u{1F4E4}' },
  { id: 'activity', label: 'System', icon: '\u26A1' },
];

const TYPE_COLORS: Record<string, string> = {
  activity: palette.subtle,
  task: palette.accent,
  lead: palette.muted,
  content: palette.muted,
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function dateGroup(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

const TAB_FOR_TYPE: Record<string, string> = {
  task: 'tasks',
  lead: 'pipeline',
  content: 'content',
  activity: 'system',
};

export function FeedTab({ activity, onNavigate }: { activity: any; onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const load = () => fetchFeed().then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  // Activity chart data
  const events = activity?.activity?.events || [];
  const profile = activity?.activity?.profile;
  const patterns = activity?.patterns;

  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dayEvents: Record<string, any[]> = {};
  days.forEach(d => { dayEvents[d] = []; });
  events.forEach((e: any) => {
    const d = e.ts?.slice(0, 10);
    if (dayEvents[d]) dayEvents[d].push(e);
  });

  const maxHours = 16;
  const bars = days.map(d => {
    const evts = dayEvents[d];
    if (!evts.length) return { day: d, hours: 0 };
    const times = evts.map((e: any) => new Date(e.ts).getHours() + new Date(e.ts).getMinutes() / 60);
    const hours = Math.max(...times) - Math.min(...times) || 1;
    return { day: d, hours: Math.min(hours, maxHours) };
  });

  const dailyComp = patterns?.dailyCompletions || {};
  const compBars = days.map(d => ({ day: d, count: (dailyComp[d] as number) || 0 }));
  const maxComp = Math.max(...compBars.map(b => b.count), 1);

  const isToday = (d: string) => d === new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative">
        <div className="landing-orbit" style={{ inset: '-14px' }}>
          {[0, 1, 2].map(i => (
            <span key={i} className="landing-orbit-dot" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <span className="text-4xl block">🦞</span>
      </div>
      <p className="text-sm text-muted-foreground">Loading feed...</p>
    </div>
  );

  const items = data?.items || [];
  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);
  const counts = data?.counts || { activity: 0, task: 0, lead: 0, content: 0 };

  // Group by day
  const groups: Record<string, FeedItem[]> = {};
  for (const item of filtered) {
    const group = dateGroup(item.time);
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  }

  return (
    <div className="space-y-6 stagger-children">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold gradient-text">Feed</h2>
        <span className="text-[11px] text-muted-foreground font-mono">{items.length} events</span>
      </div>

      {/* Activity Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card rounded-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
              Daily Activity
              <span className="text-xs text-muted-foreground font-normal ml-1">last 14 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-28">
              {bars.map(b => (
                <div key={b.day} className="flex-1 flex flex-col items-center group">
                  <div className="w-full rounded-md transition-all duration-300 group-hover:opacity-100 bar-gradient"
                    style={{
                      height: `${Math.max((b.hours / maxHours) * 100, 2)}px`,
                      opacity: b.hours ? 0.75 : 0.08,
                    }}
                    title={`${b.hours.toFixed(1)}h`}
                  />
                  {isToday(b.day) && (
                    <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: palette.accent }} />
                  )}
                  <span className={`text-[8px] mt-1 font-mono ${isToday(b.day) ? 'font-bold' : 'text-muted-foreground'}`}
                    style={isToday(b.day) ? { color: palette.accent } : undefined}>{b.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.subtle }} />
              Task Completions
              <span className="text-xs text-muted-foreground font-normal ml-1">last 14 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-28">
              {compBars.map(b => (
                <div key={b.day} className="flex-1 flex flex-col items-center group">
                  <div className="w-full rounded-md transition-all duration-300 group-hover:opacity-100 bar-gradient-cyan"
                    style={{
                      height: `${Math.max((b.count / maxComp) * 100, 2)}px`,
                      opacity: b.count ? 0.75 : 0.08,
                    }}
                    title={`${b.count} tasks`}
                  />
                  <span className={`text-[8px] mt-1 font-mono ${isToday(b.day) ? 'font-bold' : 'text-muted-foreground'}`}
                    style={isToday(b.day) ? { color: palette.subtle } : undefined}>{b.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile stats */}
      {profile && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Avg Wake Time', value: profile.avgWake || '\u2014' },
            { label: 'Avg Active Hours', value: profile.avgActiveHours || '\u2014' },
            { label: 'Peak Hours', value: profile.peakHours || '\u2014' },
            { label: 'Confidence', value: `${profile.confidence || '\u2014'}%` },
          ].map(s => (
            <div key={s.label} className="glass-card stat-card rounded-xl p-4">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</div>
              <div className="text-lg font-bold mt-1 font-mono">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(opt => {
          const isActive = filter === opt.id;
          const count = opt.id === 'all' ? items.length : counts[opt.id as keyof typeof counts] || 0;
          return (
            <button key={opt.id} onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 flex items-center gap-1.5 ${
                isActive ? '' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
              }`}
              style={isActive ? {
                background: accentAlpha(0.1),
                color: palette.accent,
                boxShadow: `inset 0 0 0 1px ${accentAlpha(0.2)}`,
              } : undefined}>
              <span className="text-[11px]">{opt.icon}</span>
              {opt.label}
              <span className="text-[10px] opacity-60 font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Feed stream */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground text-sm">
          No activity to show
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group}>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-px flex-1" style={{ background: zincAlpha(0.08) }} />
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest shrink-0">{group}</span>
                <div className="h-px flex-1" style={{ background: zincAlpha(0.08) }} />
              </div>

              <div className="space-y-1.5">
                {groupItems.map((item, i) => {
                  const color = TYPE_COLORS[item.type] || palette.muted;
                  return (
                    <div key={i} onClick={() => onNavigate?.(TAB_FOR_TYPE[item.type] || 'dashboard')}
                      className="glass-card rounded-lg px-4 py-3 flex items-start gap-3 transition-colors hover:bg-white/[0.03] cursor-pointer">
                      <span className="text-sm mt-0.5 shrink-0">{item.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{item.title}</div>
                        {item.detail && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.detail}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{ background: `${color}15`, color }}>{item.type}</span>
                        <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{relativeTime(item.time)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
