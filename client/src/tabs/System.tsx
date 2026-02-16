import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { palette, colors, accentAlpha, zincAlpha } from '../theme';
import * as api from '../api';

/* ── Types ── */
interface CronJob {
  id: string;
  name?: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; tz?: string; everyMs?: number; at?: string };
  sessionTarget: string;
  payload: { kind: string; text?: string; message?: string };
  delivery?: { mode: string };
  state?: { nextRunAtMs?: number; lastRunAtMs?: number };
}

interface GatewaySession {
  key: string;
  displayName: string;
  channel?: string;
  chatType?: string;
  updatedAt: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
}

/* ── Helpers ── */
function cronToReadable(expr: string, tz?: string): string {
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, dom, _mon, dow] = parts;
  const dayNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  let dayPart = '';
  if (dow === '*' && dom === '*') dayPart = 'Daily';
  else if (dow === '1-5') dayPart = 'Mon\u2013Fri';
  else if (dow === '0,6' || dow === '6,0') dayPart = 'Weekends';
  else if (dow !== '*') dayPart = dow.split(',').map(d => dayNames[d] || d).join(', ');
  else if (dom !== '*') dayPart = `Day ${dom} of month`;
  const tzShort = tz ? ` (${tz.split('/').pop()})` : '';
  return `${dayPart} at ${time}${tzShort}`;
}

function formatSchedule(s: CronJob['schedule']): string {
  if (s.kind === 'cron' && s.expr) return cronToReadable(s.expr, s.tz);
  if (s.kind === 'every' && s.everyMs) {
    const mins = s.everyMs / 60000;
    if (mins >= 60) return `Every ${(mins / 60).toFixed(0)}h`;
    return `Every ${mins}m`;
  }
  if (s.kind === 'at' && s.at) return `Once: ${new Date(s.at).toLocaleString()}`;
  return JSON.stringify(s);
}

function formatTime(ms?: number): string {
  if (!ms) return '\u2014';
  return new Date(ms).toLocaleString('de-DE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTokens(n?: number): string {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function cronToHuman(expr?: string): string {
  if (!expr) return '';
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, _dom, _mon, dow] = parts;
  const dayNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
  const days = dow === '*' ? 'daily' : dow === '1-5' ? 'Mon\u2013Fri' : dow.split(',').map(d => dayNames[d] || d).join(', ');
  return `${hour}:${min.padStart(2, '0')} ${days}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  webchat: 'Web Chat',
  telegram: 'Telegram',
};

/* ── Main Component ── */
export function SystemTab({ agents, notify }: { agents: any; notify: (m: string) => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [gatewayInfo, setGatewayInfo] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [gatewayHealth, setGatewayHealth] = useState<any>(null);
  const [sessions, setSessions] = useState<GatewaySession[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newJob, setNewJob] = useState({ name: '', cronExpr: '0 9 * * 1-5', tz: 'Europe/Berlin', message: '', sessionTarget: 'isolated' as const });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [cronRes, gwInfo, gwHealth, gwSessions] = await Promise.allSettled([
      api.fetchCronJobs(),
      api.fetchGatewayInfo(),
      api.fetchGatewayHealth(),
      api.fetchGatewaySessions(),
    ]);
    if (cronRes.status === 'fulfilled') setJobs(cronRes.value?.jobs || (Array.isArray(cronRes.value) ? cronRes.value : []));
    if (gwInfo.status === 'fulfilled') setGatewayInfo(gwInfo.value);
    if (gwHealth.status === 'fulfilled') setGatewayHealth(gwHealth.value);
    if (gwSessions.status === 'fulfilled') setSessions(gwSessions.value?.sessions || []);
  };

  useEffect(() => {
    fetchData().then(() => setLoading(false));
  }, []);

  const toggleJob = async (id: string, enabled: boolean) => {
    try {
      await api.toggleCronJob(id, enabled);
      notify(enabled ? '\u2705 Job enabled' : '\u23F8\uFE0F Job paused');
      fetchData();
    } catch { notify('\u274C Failed'); }
  };

  const runJob = async (id: string) => {
    try {
      await api.runCronJob(id);
      notify('\u{1F680} Job triggered');
    } catch { notify('\u274C Failed to trigger'); }
  };

  const deleteJob = async (id: string) => {
    if (!confirm('Delete this cron job?')) return;
    try {
      await api.deleteCronJob(id);
      notify('\u{1F5D1}\uFE0F Job deleted');
      fetchData();
    } catch { notify('\u274C Failed to delete'); }
  };

  const createJob = async () => {
    try {
      await api.createCronJob({
        name: newJob.name,
        schedule: { kind: 'cron', expr: newJob.cronExpr, tz: newJob.tz },
        sessionTarget: newJob.sessionTarget,
        payload: newJob.sessionTarget === 'isolated'
          ? { kind: 'agentTurn', message: newJob.message }
          : { kind: 'systemEvent', text: newJob.message },
        ...(newJob.sessionTarget === 'isolated' ? { delivery: { mode: 'announce' } } : {}),
      });
      notify('\u2705 Cron job created');
      setDialogOpen(false);
      setNewJob({ name: '', cronExpr: '0 9 * * 1-5', tz: 'Europe/Berlin', message: '', sessionTarget: 'isolated' });
      fetchData();
    } catch { notify('\u274C Failed to create'); }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative">
        <div className="landing-orbit" style={{ inset: '-14px' }}>
          {[0, 1, 2].map(i => (
            <span key={i} className="landing-orbit-dot" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <span className="text-4xl block">🧠</span>
      </div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Scanning the lobster's nervous system...</p>
        <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">loading crons, sessions &amp; agents</p>
      </div>
    </div>
  );

  const gwConnected = gatewayInfo?.connected || false;
  const channels = gatewayHealth?.channels || {};
  const channelOrder: string[] = gatewayHealth?.channelOrder || Object.keys(channels);

  const checkInNames = ['morning', 'midday', 'pulse', 'briefing', 'end of day', 'wrap', 'afternoon'];
  const checkIns = jobs.filter(j => checkInNames.some(n => (j.name || '').toLowerCase().includes(n)));
  const otherJobs = jobs.filter(j => !checkIns.includes(j));

  // Gateway agents
  const gwAgents: { id: string; name: string }[] = agents?.source === 'gateway' ? (agents?.agents?.agents || []) : [];
  // Sort sessions by most recent activity
  const sortedSessions = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);

  return (
    <div className="space-y-8">
      {/* Gateway Status Bar */}
      <div className="glass-card rounded-xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${gwConnected ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            <span className="text-sm font-semibold">Gateway</span>
          </div>
          <span className="text-xs text-muted-foreground">{gwConnected ? 'Connected' : 'Not connected'}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {gwConnected && (
            <>
              {channelOrder.map((ch: string) => {
                const info = channels[ch];
                const isLinked = info?.linked || info?.running;
                return (
                  <span key={ch} className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${isLinked ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    {CHANNEL_LABELS[ch] || ch}
                  </span>
                );
              })}
              <span className="font-mono tabular-nums">{sessions.length} sessions</span>
            </>
          )}
        </div>
      </div>

      {/* SECTION 1: AUTOMATIONS */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-balance">Automations</h2>
            <span className="text-[10px] text-muted-foreground font-mono">cron</span>
          </div>
          <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => setDialogOpen(true)}>+ New Cron Job</Button>
        </div>

        {/* Daily Check-ins */}
        {checkIns.length > 0 && (
          <div className="glass-card rounded-xl p-5 mb-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
              Daily Check-ins
            </h3>
            <div className="space-y-2">
              {checkIns.map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleJob(job.id, !job.enabled)}
                      className={`w-9 h-5 rounded-full transition-all relative ${job.enabled ? '' : 'opacity-50'}`}
                      style={{ background: job.enabled ? accentAlpha(0.3) : zincAlpha(0.2) }}
                      aria-label={job.enabled ? 'Disable job' : 'Enable job'}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${job.enabled ? 'left-4' : 'left-0.5'}`}
                        style={{ background: job.enabled ? palette.accent : palette.muted }} />
                    </button>
                    <div>
                      <span className="text-sm font-semibold">{job.name || 'Unnamed'}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">{cronToHuman(job.schedule.expr)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">Next: {formatTime(job.state?.nextRunAtMs)}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs rounded-lg" onClick={() => runJob(job.id)} aria-label="Run now">{'\u25B6\uFE0F'}</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Cron Jobs */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full" style={{ background: palette.muted }} />
            All Cron Jobs
            <span className="text-muted-foreground font-normal text-xs ml-1">({(otherJobs.length > 0 ? otherJobs : jobs).length})</span>
          </h3>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-pretty">No cron jobs configured.</p>
          ) : (
            <div className="space-y-2">
              {(otherJobs.length > 0 ? otherJobs : jobs).map(job => (
                <div key={job.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-white/[0.03] ${job.enabled ? 'bg-white/[0.02]' : 'bg-white/[0.01] opacity-50'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => toggleJob(job.id, !job.enabled)}
                      className="w-9 h-5 rounded-full transition-all relative shrink-0"
                      style={{ background: job.enabled ? accentAlpha(0.3) : zincAlpha(0.2) }}
                      aria-label={job.enabled ? 'Disable job' : 'Enable job'}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${job.enabled ? 'left-4' : 'left-0.5'}`}
                        style={{ background: job.enabled ? palette.accent : palette.muted }} />
                    </button>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{job.name || `Job ${job.id.slice(0, 8)}`}</div>
                      <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap font-mono">
                        <span>{formatSchedule(job.schedule)}</span>
                        <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{job.sessionTarget}</span>
                        <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{job.payload.kind}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground mr-2 font-mono tabular-nums">
                      {job.state?.lastRunAtMs ? `Last: ${formatTime(job.state.lastRunAtMs)}` : ''}
                      {job.state?.nextRunAtMs ? ` \u00B7 Next: ${formatTime(job.state.nextRunAtMs)}` : ''}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => runJob(job.id)} aria-label="Run now">{'\u25B6\uFE0F'}</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => deleteJob(job.id)} aria-label="Delete job">{'\u{1F5D1}\uFE0F'}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="glass-card border-border/50 max-w-lg rounded-xl" style={{ background: colors.bgDialog }}>
            <DialogHeader><DialogTitle className="font-semibold">New Cron Job</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label className="text-xs text-muted-foreground uppercase">Name</Label><Input value={newJob.name} onChange={e => setNewJob({ ...newJob, name: e.target.value })} placeholder="e.g. Weekly LinkedIn Audit" className="mt-1.5" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground uppercase">Cron Expression</Label><Input value={newJob.cronExpr} onChange={e => setNewJob({ ...newJob, cronExpr: e.target.value })} placeholder="0 9 * * 1-5" className="mt-1.5" />
                  <span className="text-[10px] text-muted-foreground/50 font-mono">min hour dom mon dow</span>
                </div>
                <div><Label className="text-xs text-muted-foreground uppercase">Timezone</Label><Input value={newJob.tz} onChange={e => setNewJob({ ...newJob, tz: e.target.value })} className="mt-1.5" /></div>
              </div>
              <div><Label className="text-xs text-muted-foreground uppercase">Session Target</Label>
                <select value={newJob.sessionTarget} onChange={e => setNewJob({ ...newJob, sessionTarget: e.target.value as any })}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="isolated">Isolated (sub-agent, announced)</option>
                  <option value="main">Main (system event in main session)</option>
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground uppercase">{newJob.sessionTarget === 'isolated' ? 'Agent Prompt' : 'System Event Text'}</Label>
                <textarea value={newJob.message} onChange={e => setNewJob({ ...newJob, message: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] font-mono"
                  placeholder={newJob.sessionTarget === 'isolated' ? 'Check LinkedIn inbox and summarize new messages...' : 'Reminder: Check email inbox'} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={createJob}
                  disabled={!newJob.message.trim()}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* Divider */}
      <div className="h-px bg-border/30" />

      {/* SECTION 2: SESSIONS */}
      {gwConnected && sessions.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold text-balance">Sessions</h2>
            <span className="text-[10px] text-muted-foreground font-mono">{sessions.length} active</span>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{formatTokens(totalTokens)} tokens</span>
          </div>

          <div className="glass-card rounded-xl p-5">
            <div className="space-y-1.5">
              {sortedSessions.map(s => (
                <div key={s.key} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`size-2 rounded-full shrink-0 ${s.channel ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.displayName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono flex gap-2 flex-wrap">
                        {s.channel && <span>{CHANNEL_LABELS[s.channel] || s.channel}</span>}
                        {s.model && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{s.model}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono tabular-nums shrink-0">
                    {s.totalTokens ? <span>{formatTokens(s.totalTokens)} tok</span> : null}
                    <span>{formatAge(Date.now() - s.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Divider */}
      {gwConnected && sessions.length > 0 && <div className="h-px bg-border/30" />}

      {/* SECTION 3: AGENTS */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-xl font-bold text-balance">Agents</h2>
          <span className="text-[10px] text-muted-foreground font-mono">{gwAgents.length > 0 ? `${gwAgents.length} registered` : 'antfarm'}</span>
        </div>

        {gwAgents.length > 0 ? (
          <div className="glass-card rounded-xl p-5">
            <div className="flex flex-wrap gap-2">
              {gwAgents.map(a => (
                <span key={a.id} className="px-3 py-1.5 rounded-lg text-sm bg-white/[0.04] hover:bg-white/[0.06] transition-colors">
                  {a.name || a.id}
                </span>
              ))}
            </div>
          </div>
        ) : !agents?.available ? (
          <div className="glass-card rounded-xl flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-bold mb-1">Agents Not Available</h3>
            <p className="text-muted-foreground text-sm text-pretty">Connect the Gateway or set up Antfarm to see agents</p>
          </div>
        ) : (
          <>
            <div className="mb-5 text-sm font-medium flex items-center gap-2" style={{ color: palette.accent }}>
              <span className="size-2 rounded-full" style={{ background: palette.accent }} />
              Antfarm Connected
            </div>

            <Card className="glass-card rounded-xl border-border/50 mb-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
                  Workflows
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {(agents.workflows || []).length ? (agents.workflows || []).map((w: any) => (
                  <div key={w.id || w.name} className="rounded-xl border border-border/30 p-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{w.name || w.id || 'Workflow'}</span>
                    </div>
                    {w.task && <div className="text-xs text-muted-foreground mt-1.5 text-pretty">{w.task}</div>}
                  </div>
                )) : <p className="text-sm text-muted-foreground py-4 text-center text-pretty">No active workflows</p>}
              </CardContent>
            </Card>

            {agents.logs && (
              <Card className="glass-card rounded-xl border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-red-500" />
                    Recent Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs text-muted-foreground/70 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed">{agents.logs}</pre>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
