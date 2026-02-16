import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { createTask, createLead, createContent, moveTask, fetchDaily, fetchRevenue, fetchAll as apiFetchAll } from '../api';
import type { Modules } from '../api';
import type { AppState, Lead } from '../types';
import { palette, accentAlpha, mutedAlpha, errorAlpha } from '../theme';

interface DailyData {
  reminders: { task: string; taskId: string; at: string; fired?: boolean }[];
  calendar: { summary: string; start: string; end: string; location?: string }[];
  followUps: { name: string; date: string; overdue: boolean; stage: string; value: number }[];
  cronJobs: { id: string; name: string; schedule: any; nextRun?: number; lastRun?: number }[];
  todoist: { content: string; due?: string; priority: number; url?: string }[];
  dueToday?: number;
  dueTomorrow?: number;
  overdue?: number;
}

interface QuickAction {
  id: string;
  icon: string;
  title: string;
  description: string;
  color: string;
  requires?: string; // module key, or undefined = always shown
}

const ACTIONS: QuickAction[] = [
  { id: 'task', icon: '\u25A3', title: 'Add Task', description: 'Create a new task with energy & due date', color: palette.accent, requires: 'taskpipe' },
  { id: 'lead', icon: '\u25C9', title: 'Add Lead', description: 'Add a new lead to the pipeline', color: palette.subtle, requires: 'leadpipe' },
  { id: 'content', icon: '\u2756', title: 'Draft Content', description: 'Create a content draft for a platform', color: palette.muted, requires: 'contentq' },
  { id: 'briefing', icon: '\u{1F4CB}', title: 'Morning Briefing', description: "Get today's overview in one click", color: palette.muted },
  { id: 'complete', icon: '\u2705', title: 'Complete Task', description: 'Mark an active task as done', color: palette.accent, requires: 'taskpipe' },
  { id: 'pipeline', icon: '\u{1F4CA}', title: 'Pipeline Report', description: 'Quick revenue & pipeline summary', color: palette.subtle, requires: 'leadpipe' },
];

function formatCalDate(s: string): string {
  try {
    const d = new Date(s);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = d.toDateString() === today.toDateString();
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    if (isTomorrow) return `Tomorrow, ${time}`;

    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const date = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    return `${day} ${date}, ${time}`;
  } catch { return s; }
}

const energyEmoji = (e?: string) => ({ high: '\u26A1', medium: '\u{1F50B}', low: '\u{1FAB6}' }[e || 'medium'] || '\u{1F50B}');

function daysSince(d?: string) {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function staleColor(lead: Lead) {
  const last = lead.touches?.length ? lead.touches[lead.touches.length - 1].date : lead.updatedAt;
  const d = daysSince(last);
  if (d >= 7) return 'border-red-500/30';
  if (d >= 3) return 'border-yellow-500/30';
  return 'border-border';
}

const STAGES = ['cold', 'warm', 'hot', 'proposal', 'won'] as const;

export function DashboardTab({ state, modules = {} }: { state: AppState; onRefresh: () => void; notify: (m: string) => void; modules?: Modules }) {
  const { stats: s, tasks, leads, content, inbox } = state;
  const [daily, setDaily] = useState<DailyData | null>(null);

  const has = useMemo(() => ({
    taskpipe: modules.taskpipe !== false,
    leadpipe: modules.leadpipe !== false,
    contentq: modules.contentq !== false,
    any: Object.values(modules).some(Boolean),
  }), [modules]);

  // Quick Actions state
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [taskContent, setTaskContent] = useState('');
  const [taskEnergy, setTaskEnergy] = useState('medium');
  const [taskDue, setTaskDue] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadValue, setLeadValue] = useState('');
  const [leadStage, setLeadStage] = useState('cold');
  const [contentText, setContentText] = useState('');
  const [contentPlatform, setContentPlatform] = useState('linkedin');
  const [briefing, setBriefing] = useState<any>(null);
  const [pipelineReport, setPipelineReport] = useState<any>(null);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);

  useEffect(() => {
    fetchDaily().then(setDaily).catch(() => {});
  }, []);

  useEffect(() => {
    if (expanded === 'complete') {
      apiFetchAll().then(data => {
        setActiveTasks((data.tasks || []).filter((t: any) => t.status !== 'done').slice(0, 10));
      }).catch(() => {});
    }
  }, [expanded]);

  const handleAction = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (id === 'briefing') {
      setLoading('briefing');
      try { setBriefing(await fetchDaily()); }
      catch { toast.error('Failed to load briefing'); }
      setLoading(null);
    } else if (id === 'pipeline') {
      setLoading('pipeline');
      try { setPipelineReport(await fetchRevenue()); }
      catch { toast.error('Failed to load pipeline report'); }
      setLoading(null);
    }
  };

  const submitTask = async () => {
    if (!taskContent.trim()) return;
    setLoading('task');
    try {
      await createTask({ content: taskContent, energy: taskEnergy as any, due: taskDue || undefined });
      toast.success('Task created');
      setTaskContent(''); setTaskDue(''); setExpanded(null);
    } catch { toast.error('Failed to create task'); }
    setLoading(null);
  };

  const submitLead = async () => {
    if (!leadName.trim()) return;
    setLoading('lead');
    try {
      await createLead({ name: leadName, email: leadEmail || undefined, value: leadValue ? parseInt(leadValue) : 0, stage: leadStage });
      toast.success('Lead added');
      setLeadName(''); setLeadEmail(''); setLeadValue(''); setExpanded(null);
    } catch { toast.error('Failed to add lead'); }
    setLoading(null);
  };

  const submitContent = async () => {
    if (!contentText.trim()) return;
    setLoading('content');
    try {
      await createContent({ text: contentText, platform: contentPlatform });
      toast.success('Content drafted');
      setContentText(''); setExpanded(null);
    } catch { toast.error('Failed to create content'); }
    setLoading(null);
  };

  const completeTask = async (id: string) => {
    setLoading('complete');
    try {
      await moveTask(id, 'done');
      toast.success('Task completed');
      setActiveTasks(prev => prev.filter(t => t.id !== id));
    } catch { toast.error('Failed to complete task'); }
    setLoading(null);
  };

  const inputClass = "w-full text-[12px] font-mono bg-white/[0.04] border border-border/30 rounded-lg px-3 py-2 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[rgba(220,38,38,0.4)] transition-colors";
  const btnClass = "px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-200";

  const stageCounts = Object.fromEntries(STAGES.map(st => [st, leads.filter(l => l.stage === st)]));

  const attentionLeads = leads
    .filter(l => !['won', 'lost'].includes(l.stage))
    .sort((a, b) => daysSince(a.updatedAt) - daysSince(b.updatedAt))
    .reverse()
    .slice(0, 3);

  // Alerts: only show module-relevant ones
  const showOverdue = has.taskpipe && daily?.overdue && daily.overdue > 0;
  const showFollowUps = has.leadpipe && daily?.followUps.filter(f => f.overdue).length;
  const showStakeRisk = has.taskpipe && s.stakeRisk && s.stakeRisk > 0;
  const hasAlerts = showOverdue || showFollowUps || showStakeRisk;

  // Stats entries to show
  const statEntries: { label: string; icon: string; value: React.ReactNode }[] = [];
  if (has.taskpipe) {
    statEntries.push({ label: 'Streak', icon: '\u{1F525}', value: <>{s.streak || 0} <span className="text-sm text-muted-foreground font-normal">days</span></> });
    statEntries.push({ label: 'Done Today', icon: '\u2705', value: <>{s.doneToday || 0}</> });
  }
  if (has.leadpipe) {
    statEntries.push({ label: 'Pipeline', icon: '\u25C9', value: <>{'\u20AC'}{(s.pipelineValue || 0).toLocaleString()}</> });
  }
  if (has.contentq) {
    statEntries.push({ label: 'Drafts', icon: '\u2756', value: <>{s.drafts || 0}</> });
  }
  if (daily && daily.todoist.length > 0) {
    statEntries.push({ label: 'Todoist', icon: '\u2611\uFE0F', value: <span style={{ color: palette.accent }}>{daily.todoist.length}</span> });
  }

  // Module cards for the main grid
  const moduleCardCount = [has.taskpipe, has.leadpipe, has.contentq].filter(Boolean).length;
  const gridClass = moduleCardCount === 3 ? 'md:grid-cols-3' : moduleCardCount === 2 ? 'md:grid-cols-2' : '';

  // Filtered quick actions
  const visibleActions = ACTIONS.filter(a => !a.requires || (modules[a.requires] !== false));

  return (
    <div className="space-y-5 stagger-children">
      {/* Alerts — only when something needs attention */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-3">
          {showOverdue ? (
            <div className="glass-card rounded-xl border border-red-500/20 px-4 py-2.5 text-sm flex items-center gap-2" style={{ background: errorAlpha(0.06) }}>
              <span className="text-[11px] font-medium text-red-400/80 tracking-wide uppercase">Overdue</span>
              <span className="font-bold text-red-400">{daily!.overdue} tasks</span>
            </div>
          ) : null}
          {showFollowUps ? (
            <div className="glass-card rounded-xl border border-amber-500/20 px-4 py-2.5 text-sm flex items-center gap-2" style={{ background: mutedAlpha(0.04) }}>
              <span className="text-[11px] font-medium text-amber-400/80 tracking-wide uppercase">Follow-ups</span>
              <span className="font-semibold">{daily!.followUps.filter(f => f.overdue).map(f => f.name).join(', ')}</span>
            </div>
          ) : null}
          {showStakeRisk ? (
            <div className="glass-card rounded-xl border border-red-500/20 px-4 py-2.5 text-sm flex items-center gap-2" style={{ background: errorAlpha(0.05) }}>
              <span className="text-red-400">{'\u26A0\uFE0F'}</span>
              <span><span className="font-semibold text-red-400">{'\u20AC'}{s.stakeRisk!.toLocaleString()}</span> at risk</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Stats bar — only if there are stats to show */}
      {statEntries.length > 0 && (
        <div className={`grid gap-3 ${
          statEntries.length >= 5 ? 'grid-cols-3 md:grid-cols-5' :
          statEntries.length >= 3 ? 'grid-cols-3 md:grid-cols-4' :
          statEntries.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
        }`}>
          {!daily ? (
            <>
              {statEntries.map((_, i) => (
                <div key={i} className="glass-card rounded-xl px-4 py-3 animate-pulse">
                  <div className="h-3 w-16 rounded bg-white/[0.06] mb-2" />
                  <div className="h-5 w-12 rounded bg-white/[0.04]" />
                </div>
              ))}
            </>
          ) : (
            <>
              {statEntries.map(stat => (
                <div key={stat.label} className="glass-card stat-card rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">{stat.label}</span>
                    <span className="text-sm opacity-50">{stat.icon}</span>
                  </div>
                  <div className="text-xl font-bold mt-1 gradient-text">{stat.value}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Welcome card — shown when no modules are installed */}
      {!has.any && (
        <Card className="glass-card rounded-xl border-border/50">
          <CardContent className="py-8 text-center space-y-4">
            <div className="text-3xl">{'\u{1F9E0}'}</div>
            <div>
              <h2 className="text-lg font-bold gradient-text">Welcome to Open Brain</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                Your agent control panel is ready. Install CLI modules to unlock more capabilities:
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span style={{ color: palette.accent }}>{'\u25A3'}</span> taskpipe
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Task management with energy tracking & stakes</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span style={{ color: palette.subtle }}>{'\u25C9'}</span> leadpipe
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">CRM pipeline for leads & revenue tracking</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span style={{ color: palette.muted }}>{'\u2756'}</span> contentq
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Content queue for drafts & publishing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content — Tasks, Pipeline, Content (only visible modules) */}
      {moduleCardCount > 0 && (
        <div className={`grid ${gridClass} gap-5`}>
          {/* Today's Tasks */}
          {has.taskpipe && (
            <Card className="glass-card rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
                    Today's Tasks
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground font-mono tracking-wider">taskpipe</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {tasks.slice(0, 5).map((t, i) => (
                  <div key={t.id} className={`rounded-lg border border-border/50 p-3 transition-all hover:bg-white/[0.02] ${t.status === 'done' ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 text-sm">
                      {i === 0 && t.status !== 'done' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide" style={{ background: palette.accent, color: palette.black }}>NOW</span>
                      )}
                      {t.status === 'done' && <span className="text-xs">{'\u2705'}</span>}
                      <span className="font-medium">{t.content}</span>
                    </div>
                    <div className="flex gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span>{energyEmoji(t.energy)} {t.energy || 'medium'}</span>
                      {t.estimate && <span className="font-mono">{t.estimate}m</span>}
                      {t.due && <span>{'\u{1F4C5}'} {t.due}</span>}
                      {t.stake && <span>{'\u{1F4B0}'}</span>}
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No tasks</p>}
              </CardContent>
            </Card>
          )}

          {/* Pipeline Overview */}
          {has.leadpipe && (
            <Card className="glass-card rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full" style={{ background: palette.subtle }} />
                    Pipeline
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground font-mono tracking-wider">leadpipe</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2 mb-5">
                  {STAGES.map(st => (
                    <div key={st} className="text-center p-2 rounded-lg bg-white/[0.02]">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{st}</div>
                      <div className="text-lg font-bold mt-0.5">{stageCounts[st]?.length || 0}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{'\u20AC'}{(stageCounts[st]?.reduce((s: number, l: Lead) => s + (l.value || 0), 0) || 0).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] font-semibold text-muted-foreground mb-2 tracking-wide uppercase">Needs Attention</div>
                <div className="space-y-2">
                  {attentionLeads.map(l => (
                    <div key={l.id} className={`rounded-lg border p-2.5 transition-colors hover:bg-white/[0.02] ${staleColor(l)}`}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{l.name}</span>
                        <span className="font-mono" style={{ color: palette.accent }}>{'\u20AC'}{(l.value || 0).toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{l.stage} \u00B7 {l.source}{l.followUp ? ` \u00B7 follow-up ${l.followUp}` : ''}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content Queue */}
          {has.contentq && (
            <Card className="glass-card rounded-xl border-border/50">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full" style={{ background: palette.muted }} />
                    Content Queue
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground font-mono tracking-wider">contentq</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.map(c => (
                  <div key={c.id} className="rounded-lg border border-border/50 p-2.5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                        c.status === 'draft' ? 'bg-yellow-500/15 text-yellow-400' :
                        c.status === 'scheduled' ? 'bg-zinc-500/15 text-zinc-400' :
                        c.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>{c.status}</span>
                      <span className="text-muted-foreground text-xs">{c.platform}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{c.text?.slice(0, 100)}</p>
                    {c.scheduledFor && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{'\u{1F4C5}'} {c.scheduledFor}</div>}
                  </div>
                ))}
                {content.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No content queued</p>}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Upcoming — only if there's content */}
      {daily && (daily.calendar.length > 0 || daily.reminders.some(r => !r.fired) || daily.followUps.length > 0) && (
        <Card className="glass-card rounded-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {daily.calendar.map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <span className="text-zinc-400 text-xs shrink-0">{'\u{1F4C5}'}</span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{formatCalDate(e.start)}</span>
                  <span className="font-medium truncate">{e.summary}</span>
                  {e.location && <span className="text-xs text-muted-foreground ml-auto shrink-0">{'\u{1F4CD}'} {e.location}</span>}
                </div>
              ))}
              {daily.reminders.filter(r => !r.fired).map((r, i) => (
                <div key={`r-${i}`} className="flex items-center gap-3 text-sm p-2.5 rounded-lg" style={{ background: mutedAlpha(0.04) }}>
                  <span className="text-xs">{'\u23F0'}</span>
                  <span className="text-xs text-muted-foreground font-mono w-12">{new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{r.task}</span>
                </div>
              ))}
              {daily.followUps.map((f, i) => (
                <div key={`f-${i}`} className={`flex items-center gap-3 text-sm p-2.5 rounded-lg ${f.overdue ? '' : 'bg-white/[0.02]'}`}
                  style={f.overdue ? { background: errorAlpha(0.04) } : undefined}>
                  <span className="text-xs">{f.overdue ? '\u{1F6A8}' : '\u{1F4DE}'}</span>
                  <span className="text-xs text-muted-foreground font-mono w-12">{f.date}</span>
                  <span className="font-medium">{f.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground">{f.stage}</span>
                  <span className="text-sm font-mono ml-auto" style={{ color: palette.accent }}>{'\u20AC'}{f.value?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions — discovery UI, at the bottom */}
      {visibleActions.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <button onClick={() => setActionsOpen(!actionsOpen)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm">{'\u2318'}</span>
              <span className="text-sm font-semibold tracking-wide">Quick Actions</span>
            </div>
            <span className="text-muted-foreground/40 text-xs transition-transform duration-200"
              style={{ transform: actionsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
          </button>
          {actionsOpen && (
            <div className="px-5 pb-5 animate-fade-up">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {visibleActions.map(action => {
                  const isExpanded = expanded === action.id;
                  const isLoading = loading === action.id;
                  return (
                    <div key={action.id} className={`glass-card rounded-xl overflow-hidden transition-all duration-300 ${
                      isExpanded ? 'col-span-2' : ''
                    }`}>
                      <button onClick={() => handleAction(action.id)}
                        className="w-full text-left p-3.5 hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{action.icon}</span>
                          <div>
                            <div className="text-sm font-semibold" style={{ color: action.color }}>{action.title}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{action.description}</div>
                          </div>
                          {isLoading && <span className="ml-auto text-[11px] text-muted-foreground animate-pulse">Loading...</span>}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 animate-fade-up border-t border-border/30 pt-3">
                          {action.id === 'task' && (
                            <div className="space-y-3">
                              <input type="text" placeholder="What needs to be done?" value={taskContent}
                                onChange={e => setTaskContent(e.target.value)} className={inputClass} autoFocus />
                              <div className="flex gap-2">
                                <select value={taskEnergy} onChange={e => setTaskEnergy(e.target.value)} className={inputClass + ' w-auto'}>
                                  <option value="low">{'\u{1FAB6}'} Low</option>
                                  <option value="medium">{'\u{1F50B}'} Medium</option>
                                  <option value="high">{'\u26A1'} High</option>
                                </select>
                                <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className={inputClass + ' w-auto'} />
                              </div>
                              <button onClick={submitTask} disabled={!taskContent.trim() || isLoading}
                                className={btnClass} style={{ background: palette.accent, color: palette.black }}>
                                {isLoading ? 'Creating...' : 'Create Task'}
                              </button>
                            </div>
                          )}
                          {action.id === 'lead' && (
                            <div className="space-y-3">
                              <input type="text" placeholder="Lead name" value={leadName}
                                onChange={e => setLeadName(e.target.value)} className={inputClass} autoFocus />
                              <input type="email" placeholder="Email (optional)" value={leadEmail}
                                onChange={e => setLeadEmail(e.target.value)} className={inputClass} />
                              <div className="flex gap-2">
                                <input type="number" placeholder="Value (\u20AC)" value={leadValue}
                                  onChange={e => setLeadValue(e.target.value)} className={inputClass + ' w-auto'} />
                                <select value={leadStage} onChange={e => setLeadStage(e.target.value)} className={inputClass + ' w-auto'}>
                                  {['cold', 'warm', 'hot', 'proposal'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <button onClick={submitLead} disabled={!leadName.trim() || isLoading}
                                className={btnClass} style={{ background: palette.subtle, color: palette.black }}>
                                {isLoading ? 'Adding...' : 'Add Lead'}
                              </button>
                            </div>
                          )}
                          {action.id === 'content' && (
                            <div className="space-y-3">
                              <textarea placeholder="Write your content..." value={contentText}
                                onChange={e => setContentText(e.target.value)} rows={4}
                                className={inputClass + ' resize-none'} autoFocus />
                              <div className="flex items-center gap-2">
                                <select value={contentPlatform} onChange={e => setContentPlatform(e.target.value)} className={inputClass + ' w-auto'}>
                                  {['linkedin', 'twitter', 'blog', 'newsletter'].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <button onClick={submitContent} disabled={!contentText.trim() || isLoading}
                                  className={btnClass} style={{ background: palette.muted, color: palette.black }}>
                                  {isLoading ? 'Drafting...' : 'Save Draft'}
                                </button>
                              </div>
                            </div>
                          )}
                          {action.id === 'briefing' && briefing && (
                            <div className="space-y-3">
                              {briefing.overdue > 0 && (
                                <div className="rounded-lg p-3" style={{ background: errorAlpha(0.06) }}>
                                  <span className="text-red-400 font-semibold text-sm">{'\u26A0\uFE0F'} {briefing.overdue} overdue tasks</span>
                                </div>
                              )}
                              {briefing.dueToday > 0 && (
                                <div className="rounded-lg p-3 bg-white/[0.03]">
                                  <span className="text-sm">{'\u{1F4CB}'} <strong>{briefing.dueToday}</strong> tasks due today</span>
                                </div>
                              )}
                              {briefing.calendar?.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Today's Events</div>
                                  {briefing.calendar.slice(0, 5).map((e: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg bg-white/[0.02]">
                                      <span className="text-xs">{'\u{1F4C5}'}</span>
                                      <span className="font-medium truncate">{e.summary}</span>
                                      <span className="text-[10px] text-muted-foreground font-mono ml-auto shrink-0">
                                        {new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {briefing.followUps?.filter((f: any) => f.overdue).length > 0 && (
                                <div className="rounded-lg p-3" style={{ background: mutedAlpha(0.06) }}>
                                  <span className="text-sm text-amber-400">{'\u{1F4DE}'} {briefing.followUps.filter((f: any) => f.overdue).length} overdue follow-ups</span>
                                </div>
                              )}
                              {!briefing.overdue && !briefing.dueToday && !briefing.calendar?.length && (
                                <div className="text-sm text-muted-foreground text-center py-2">Clear schedule \u2014 nice!</div>
                              )}
                            </div>
                          )}
                          {action.id === 'complete' && (
                            <div className="space-y-1.5">
                              {activeTasks.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-2">No active tasks</div>
                              ) : activeTasks.map(t => (
                                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                                  <span className="text-[12px] font-medium truncate">{t.content}</span>
                                  <button onClick={() => completeTask(t.id)}
                                    className="px-3 py-1 rounded-md text-[11px] font-medium shrink-0 ml-2 transition-colors"
                                    style={{ background: accentAlpha(0.1), color: palette.accent }}>
                                    Done
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {action.id === 'pipeline' && pipelineReport && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-lg p-3 bg-white/[0.03]">
                                  <div className="text-[10px] text-muted-foreground uppercase">Pipeline</div>
                                  <div className="text-sm font-bold mt-1 gradient-text">{'\u20AC'}{pipelineReport.totalPipeline?.toLocaleString()}</div>
                                </div>
                                <div className="rounded-lg p-3 bg-white/[0.03]">
                                  <div className="text-[10px] text-muted-foreground uppercase">Won</div>
                                  <div className="text-sm font-bold mt-1" style={{ color: palette.accent }}>{'\u20AC'}{pipelineReport.totalWon?.toLocaleString()}</div>
                                </div>
                                <div className="rounded-lg p-3 bg-white/[0.03]">
                                  <div className="text-[10px] text-muted-foreground uppercase">Rate</div>
                                  <div className="text-sm font-bold mt-1" style={{ color: palette.subtle }}>{pipelineReport.conversionRate}%</div>
                                </div>
                              </div>
                              {pipelineReport.recentWins?.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Wins</div>
                                  {pipelineReport.recentWins.map((w: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg bg-white/[0.02]">
                                      <span>{'\u{1F3C6}'} {w.name}</span>
                                      <span className="font-mono" style={{ color: palette.accent }}>{'\u20AC'}{w.value?.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inbox preview */}
      {has.contentq && inbox.length > 0 && (
        <Card className="glass-card rounded-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide flex items-center gap-3">
              <span className="w-1 h-4 rounded-full bg-red-500" />
              Inbox
              <span className="text-muted-foreground font-normal text-xs ml-1">{inbox.length} items</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {inbox.slice(0, 6).map(item => (
                <div key={item.id} className="rounded-lg border border-border/50 p-3 hover:bg-white/[0.02] transition-colors">
                  <span className="text-sm">{{ social: '\u{1F4F1}', inspo: '\u{1F4A1}', idea: '\u{1F4AD}', general: '\u{1F4E5}' }[item.type] || '\u{1F4E5}'}</span>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{item.title || item.note || item.text || item.url || '(empty)'}</p>
                  <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">{item.createdAt?.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
