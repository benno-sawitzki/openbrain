import { useState, useEffect, useMemo } from 'react';
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

/* ── Cron helpers ── */

/** Turn cron expression into truly plain English */
function cronToPlainEnglish(expr?: string, tz?: string): string {
  if (!expr) return '';
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  // Time formatting
  const formatTime = (h: string, m: string): string => {
    if (h === '*') return '';
    const hr = parseInt(h, 10);
    const mn = m.padStart(2, '0');
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    return `${hr12}:${mn} ${ampm}`;
  };

  // Day of week
  const dayNames: Record<string, string> = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', '7': 'Sunday' };
  const monthNames: Record<string, string> = { '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec' };

  const time = formatTime(hour, min);
  const tzLabel = tz ? tz.split('/').pop()?.replace(/_/g, ' ') : '';

  // Every N minutes/hours
  if (hour.startsWith('*/')) {
    const n = parseInt(hour.slice(2), 10);
    return `Every ${n} hour${n > 1 ? 's' : ''}${tzLabel ? ` (${tzLabel})` : ''}`;
  }
  if (min.startsWith('*/')) {
    const n = parseInt(min.slice(2), 10);
    return `Every ${n} minute${n > 1 ? 's' : ''}${tzLabel ? ` (${tzLabel})` : ''}`;
  }

  let when = '';

  if (dow === '*' && dom === '*' && mon === '*') {
    when = 'Every day';
  } else if (dow === '1-5') {
    when = 'Weekdays (Mon\u2013Fri)';
  } else if (dow === '0,6' || dow === '6,0') {
    when = 'Weekends (Sat\u2013Sun)';
  } else if (dow !== '*') {
    const days = dow.split(',').map(d => dayNames[d] || d);
    when = `Every ${days.join(', ')}`;
  } else if (dom !== '*' && mon !== '*') {
    const ordinal = (n: string) => {
      const num = parseInt(n, 10);
      const s = ['th', 'st', 'nd', 'rd'];
      const v = num % 100;
      return num + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    when = `${monthNames[mon] || mon} ${ordinal(dom)}`;
  } else if (dom !== '*') {
    const ordinal = (n: string) => {
      const num = parseInt(n, 10);
      const s = ['th', 'st', 'nd', 'rd'];
      const v = num % 100;
      return num + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    when = `${ordinal(dom)} of every month`;
  }

  return `${when}${time ? ` at ${time}` : ''}${tzLabel ? ` (${tzLabel})` : ''}`;
}

function formatSchedule(s: CronJob['schedule']): string {
  if (s.kind === 'cron' && s.expr) return cronToPlainEnglish(s.expr, s.tz);
  if (s.kind === 'every' && s.everyMs) {
    const mins = s.everyMs / 60000;
    if (mins >= 60) return `Every ${(mins / 60).toFixed(0)} hours`;
    return `Every ${mins} minutes`;
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
  if (mins < 1) return 'just now';
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

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  webchat: 'Web Chat',
  telegram: 'Telegram',
};

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '\uD83D\uDCAC',
  slack: '\uD83D\uDCE8',
  webchat: '\uD83C\uDF10',
  telegram: '\u2708\uFE0F',
};

const CRON_PRESETS = [
  { label: 'Weekdays at 9 AM', expr: '0 9 * * 1-5' },
  { label: 'Every day at 9 AM', expr: '0 9 * * *' },
  { label: 'Weekdays at 2 PM', expr: '0 14 * * 1-5' },
  { label: 'Every Monday at 9 AM', expr: '0 9 * * 1' },
  { label: 'Every 2 hours', expr: '0 */2 * * *' },
  { label: 'Every 30 minutes', expr: '*/30 * * * *' },
  { label: '1st of month at 10 AM', expr: '0 10 1 * *' },
];

/* ── Main Component ── */
export function SystemTab({ agents, notify }: { agents: any; notify: (m: string) => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [gatewayInfo, setGatewayInfo] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [gatewayHealth, setGatewayHealth] = useState<any>(null);
  const [sessions, setSessions] = useState<GatewaySession[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [newJob, setNewJob] = useState({ name: '', cronExpr: '0 9 * * 1-5', tz: 'Europe/Berlin', message: '', sessionTarget: 'isolated' as const });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [cronRes, gwInfo, gwHealth, gwSessions, gwSkills] = await Promise.allSettled([
      api.fetchCronJobs(),
      api.fetchGatewayInfo(),
      api.fetchGatewayHealth(),
      api.fetchGatewaySessions(),
      api.fetchGatewaySkills(),
    ]);
    if (cronRes.status === 'fulfilled') setJobs(cronRes.value?.jobs || (Array.isArray(cronRes.value) ? cronRes.value : []));
    if (gwInfo.status === 'fulfilled') setGatewayInfo(gwInfo.value);
    if (gwHealth.status === 'fulfilled') setGatewayHealth(gwHealth.value);
    if (gwSessions.status === 'fulfilled') setSessions(gwSessions.value?.sessions || []);
    if (gwSkills.status === 'fulfilled') setSkills(gwSkills.value?.skills || []);
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

  // Derived data
  const gwConnected = gatewayInfo?.connected || false;
  const channels = gatewayHealth?.channels || {};
  const channelOrder: string[] = gatewayHealth?.channelOrder || Object.keys(channels);
  const gwAgents: any[] = agents?.source === 'gateway' ? (agents?.agents?.agents || []) : [];
  const sortedSessions = useMemo(() => [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [sessions]);
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);

  // Live preview of new cron expression
  const cronPreview = cronToPlainEnglish(newJob.cronExpr, newJob.tz);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative">
        <div className="landing-orbit" style={{ inset: '-14px' }}>
          {[0, 1, 2].map(i => (
            <span key={i} className="landing-orbit-dot" style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <span className="text-4xl block">{'\uD83E\uDDE0'}</span>
      </div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Scanning the lobster's nervous system...</p>
        <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">loading gateway, agents, crons & sessions</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">

      {/* ━━━ SECTION 1: GATEWAY ━━━ */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-xl font-bold">Gateway</h2>
          <span className={`size-2 rounded-full ${gwConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="text-xs text-muted-foreground">{gwConnected ? 'Connected' : 'Offline'}</span>
        </div>

        {!gwConnected ? (
          <div className="glass-card rounded-xl flex flex-col items-center justify-center py-12">
            <span className="text-3xl mb-3 opacity-40">{'\uD83D\uDD0C'}</span>
            <h3 className="text-sm font-semibold mb-1">Gateway Not Connected</h3>
            <p className="text-muted-foreground text-xs text-pretty max-w-sm text-center">Configure gateway credentials in Settings to enable channels, agents, and skills.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Channels */}
            <div className="glass-card rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
                Channels
                <span className="text-muted-foreground font-normal text-xs ml-1">({channelOrder.length})</span>
              </h3>
              {channelOrder.length === 0 ? (
                <p className="text-xs text-muted-foreground">No channels configured</p>
              ) : (
                <div className="space-y-2">
                  {channelOrder.map((ch: string) => {
                    const info = channels[ch] || {};
                    const isLinked = info.linked || info.running;
                    return (
                      <div key={ch} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{CHANNEL_ICONS[ch] || '\uD83D\uDCE1'}</span>
                          <div>
                            <span className="text-sm font-semibold">{CHANNEL_LABELS[ch] || ch}</span>
                            <div className="text-[11px] text-muted-foreground font-mono flex gap-2 flex-wrap">
                              {info.phoneNumber && <span>{info.phoneNumber}</span>}
                              {info.botName && <span>@{info.botName}</span>}
                              {info.teamName && <span>{info.teamName}</span>}
                              {info.type && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{info.type}</span>}
                            </div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isLinked ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500'}`}>
                          {isLinked ? 'active' : 'inactive'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="glass-card rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
                Skills
                <span className="text-muted-foreground font-normal text-xs ml-1">({skills.length})</span>
              </h3>
              {skills.length === 0 ? (
                <p className="text-xs text-muted-foreground">No skills registered</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {skills.map((sk: any, i: number) => (
                    <div key={sk.id || sk.name || i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{sk.name || sk.id || `Skill ${i + 1}`}</span>
                        {sk.description && <p className="text-[11px] text-muted-foreground truncate">{sk.description}</p>}
                      </div>
                      {sk.enabled !== undefined && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${sk.enabled ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500'}`}>
                          {sk.enabled ? 'on' : 'off'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick stats bar */}
        {gwConnected && (
          <div className="flex items-center gap-6 mt-3 px-2 text-[11px] text-muted-foreground font-mono tabular-nums">
            <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
            <span>{formatTokens(totalTokens)} total tokens</span>
            <span>{gwAgents.length} agent{gwAgents.length !== 1 ? 's' : ''}</span>
            <span>{skills.length} skill{skills.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </section>

      <div className="h-px bg-border/30" />

      {/* ━━━ SECTION 2: AGENTS ━━━ */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-xl font-bold">Agents</h2>
          <span className="text-[10px] text-muted-foreground font-mono">
            {gwAgents.length > 0 ? `${gwAgents.length} registered` : agents?.source === 'antfarm' ? 'antfarm' : ''}
          </span>
        </div>

        {gwAgents.length > 0 ? (
          <div className="glass-card rounded-xl p-5">
            <div className="space-y-2">
              {gwAgents.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="size-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style={{ background: accentAlpha(0.1), color: palette.accent }}>
                      {(a.name || a.id || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{a.name || a.id}</div>
                      <div className="text-[11px] text-muted-foreground font-mono flex gap-2 flex-wrap">
                        {a.id && a.name && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{a.id}</span>}
                        {a.model && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{a.model}</span>}
                        {a.provider && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{a.provider}</span>}
                        {a.type && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{a.type}</span>}
                      </div>
                      {a.description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.status && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        a.status === 'active' || a.status === 'running' ? 'bg-emerald-400/10 text-emerald-400'
                        : a.status === 'error' ? 'bg-red-400/10 text-red-400'
                        : 'bg-zinc-500/10 text-zinc-500'
                      }`}>{a.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !agents?.available ? (
          <div className="glass-card rounded-xl flex flex-col items-center justify-center py-12">
            <span className="text-3xl mb-3 opacity-40">{'\uD83E\uDD16'}</span>
            <h3 className="text-sm font-semibold mb-1">No Agents Available</h3>
            <p className="text-muted-foreground text-xs text-pretty max-w-sm text-center">Connect the Gateway or set up Antfarm to see agents</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm font-medium flex items-center gap-2" style={{ color: palette.accent }}>
              <span className="size-2 rounded-full" style={{ background: palette.accent }} />
              Antfarm Connected
            </div>

            <Card className="glass-card rounded-xl border-border/50 mb-4">
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
                      {w.status && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          w.status === 'running' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500'
                        }`}>{w.status}</span>
                      )}
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

      <div className="h-px bg-border/30" />

      {/* ━━━ SECTION 3: SESSIONS ━━━ */}
      {gwConnected && sessions.length > 0 && (
        <>
          <section>
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xl font-bold">Sessions</h2>
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
                          {s.chatType && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{s.chatType}</span>}
                          {s.model && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{s.model}</span>}
                          {s.modelProvider && <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{s.modelProvider}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono tabular-nums shrink-0">
                      {(s.inputTokens || s.outputTokens) ? (
                        <span className="flex gap-1.5">
                          <span title="Input tokens">{'\u2B06'} {formatTokens(s.inputTokens)}</span>
                          <span title="Output tokens">{'\u2B07'} {formatTokens(s.outputTokens)}</span>
                        </span>
                      ) : s.totalTokens ? (
                        <span>{formatTokens(s.totalTokens)} tok</span>
                      ) : null}
                      {s.contextTokens ? <span title="Context window">{'\uD83D\uDCCB'} {formatTokens(s.contextTokens)}</span> : null}
                      <span>{formatAge(Date.now() - s.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="h-px bg-border/30" />
        </>
      )}

      {/* ━━━ SECTION 4: AUTOMATIONS (CRON) ━━━ */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Automations</h2>
            <span className="text-[10px] text-muted-foreground font-mono">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          </div>
          <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => setDialogOpen(true)}>+ New Job</Button>
        </div>

        {jobs.length === 0 ? (
          <div className="glass-card rounded-xl flex flex-col items-center justify-center py-12">
            <span className="text-3xl mb-3 opacity-40">{'\u23F0'}</span>
            <h3 className="text-sm font-semibold mb-1">No Automations</h3>
            <p className="text-muted-foreground text-xs text-pretty max-w-sm text-center">Create a cron job to schedule automated agent tasks.</p>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5">
            <div className="space-y-2">
              {jobs.map(job => {
                const isExpanded = expandedJob === job.id;
                const message = job.payload?.message || job.payload?.text || '';
                return (
                  <div key={job.id} className={`rounded-lg transition-colors ${job.enabled ? 'bg-white/[0.02] hover:bg-white/[0.04]' : 'bg-white/[0.01] opacity-50'}`}>
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button onClick={() => toggleJob(job.id, !job.enabled)}
                          className="w-9 h-5 rounded-full transition-all relative shrink-0"
                          style={{ background: job.enabled ? accentAlpha(0.3) : zincAlpha(0.2) }}
                          aria-label={job.enabled ? 'Disable job' : 'Enable job'}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${job.enabled ? 'left-4' : 'left-0.5'}`}
                            style={{ background: job.enabled ? palette.accent : palette.muted }} />
                        </button>
                        <button className="min-w-0 text-left flex-1" onClick={() => setExpandedJob(isExpanded ? null : job.id)}>
                          <div className="text-sm font-semibold truncate">{job.name || `Job ${job.id.slice(0, 8)}`}</div>
                          <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap">
                            <span>{formatSchedule(job.schedule)}</span>
                            <span className="px-1.5 py-0 rounded bg-white/[0.04] text-[10px]">{job.sessionTarget}</span>
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-[10px] text-muted-foreground mr-2 font-mono tabular-nums text-right">
                          {job.state?.lastRunAtMs && <div>Last: {formatTime(job.state.lastRunAtMs)}</div>}
                          {job.state?.nextRunAtMs && <div>Next: {formatTime(job.state.nextRunAtMs)}</div>}
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => runJob(job.id)} aria-label="Run now">{'\u25B6\uFE0F'}</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg" onClick={() => deleteJob(job.id)} aria-label="Delete job">{'\u{1F5D1}\uFE0F'}</Button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && message && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="rounded-lg bg-white/[0.02] border border-border/20 p-3">
                          <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-1.5">
                            {job.payload?.kind === 'agentTurn' ? 'Agent Prompt' : 'System Event'}
                          </div>
                          <p className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">{message}</p>
                          {job.delivery?.mode && (
                            <div className="mt-2 text-[10px] text-muted-foreground/50">Delivery: {job.delivery.mode}</div>
                          )}
                          {job.schedule.expr && (
                            <div className="mt-2 text-[10px] text-muted-foreground/50 font-mono">Raw: {job.schedule.expr}{job.schedule.tz ? ` (${job.schedule.tz})` : ''}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="glass-card border-border/50 max-w-lg rounded-xl" style={{ background: colors.bgDialog }}>
            <DialogHeader><DialogTitle className="font-semibold">New Automation</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Name</Label>
                <Input value={newJob.name} onChange={e => setNewJob({ ...newJob, name: e.target.value })} placeholder="e.g. Morning Briefing" className="mt-1.5" />
              </div>

              {/* Schedule with presets */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Schedule</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                  {CRON_PRESETS.map(p => (
                    <button key={p.expr}
                      className={`text-[11px] px-2.5 py-1 rounded-lg transition-colors ${newJob.cronExpr === p.expr ? 'text-white' : 'bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]'}`}
                      style={newJob.cronExpr === p.expr ? { background: palette.accent } : undefined}
                      onClick={() => setNewJob({ ...newJob, cronExpr: p.expr })}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input value={newJob.cronExpr} onChange={e => setNewJob({ ...newJob, cronExpr: e.target.value })} placeholder="0 9 * * 1-5" className="font-mono" />
                    <div className="text-[10px] text-muted-foreground/50 mt-1 flex gap-3">
                      <span>min</span><span>hour</span><span>day</span><span>month</span><span>weekday</span>
                    </div>
                  </div>
                  <div>
                    <Input value={newJob.tz} onChange={e => setNewJob({ ...newJob, tz: e.target.value })} placeholder="Europe/Berlin" />
                    <div className="text-[10px] text-muted-foreground/50 mt-1">Timezone</div>
                  </div>
                </div>
                {/* Live preview */}
                {cronPreview && (
                  <div className="mt-2 text-xs font-medium px-3 py-2 rounded-lg" style={{ background: accentAlpha(0.06), color: palette.accent }}>
                    {'\u{1F552}'} {cronPreview}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase">Session Target</Label>
                <select value={newJob.sessionTarget} onChange={e => setNewJob({ ...newJob, sessionTarget: e.target.value as any })}
                  className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="isolated">Isolated (sub-agent, announced)</option>
                  <option value="main">Main (system event in main session)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase">
                  {newJob.sessionTarget === 'isolated' ? 'Agent Prompt' : 'System Event Text'}
                </Label>
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
    </div>
  );
}
