import { useState, useEffect, useMemo } from 'react';
import { fetchBrain, fetchMemoryTimeline } from '../api';
import { palette, status, accentAlpha, errorAlpha, mutedAlpha, subtleAlpha, zincAlpha } from '../theme';

interface Connection {
  name: string;
  icon: string;
  category: string;
  status: 'active' | 'configured' | 'inactive' | 'needs-setup' | 'error';
  detail: string;
  apiKeys?: { label: string; masked: string }[];
}

interface BrainData {
  soul: string | null;
  user: string | null;
  memory: string | null;
  tools: string | null;
  identity: string | null;
  heartbeat: string | null;
  model: { primary?: string; fallbacks?: string[] };
  channels: Record<string, { enabled: boolean; dmPolicy?: string; groupPolicy?: string }>;
  skills: string[];
  connections: Connection[];
  memoryFiles: string[];
  recentMemory: { name: string; content: string }[];
}

interface MemoryFile {
  name: string;
  modified: string;
  preview: string;
  lines: number;
}

interface MergedSkill {
  name: string;
  icon: string;
  status: string;
  detail: string;
}

const STATUS_COLORS: Record<string, { dot: string; border: string; bg: string; label: string }> = {
  active: { dot: status.success.color, border: status.success.border, bg: status.success.bg, label: 'Active' },
  configured: { dot: palette.subtle, border: subtleAlpha(0.2), bg: subtleAlpha(0.04), label: 'Configured' },
  inactive: { dot: palette.muted, border: mutedAlpha(0.15), bg: 'transparent', label: 'Inactive' },
  'needs-setup': { dot: palette.muted, border: mutedAlpha(0.2), bg: mutedAlpha(0.04), label: 'Needs Setup' },
  error: { dot: status.error.color, border: errorAlpha(0.2), bg: errorAlpha(0.04), label: 'Error' },
};

function relativeDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MarkdownCard({ title, icon, content, defaultOpen = false, badge }: {
  title: string; icon: string; content: string | null; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;
  const lines = content.split('\n').length;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">{icon}</span>
          <span className="font-semibold text-[13px] truncate">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 rounded-md text-[9px] font-medium shrink-0"
              style={{ background: accentAlpha(0.1), color: palette.accent }}>{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono shrink-0 ml-2">
          <span>{lines}L</span>
          <span className="transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border/30 animate-fade-up">
          <pre className="px-4 py-3 text-[11px] text-muted-foreground/80 overflow-auto max-h-[400px] whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
        </div>
      )}
    </div>
  );
}

function ConnectionRow({ conn }: { conn: Connection }) {
  const [expanded, setExpanded] = useState(false);
  const colors = STATUS_COLORS[conn.status] || STATUS_COLORS.inactive;

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left rounded-lg px-3 py-2 transition-all duration-150 hover:bg-white/[0.03] group"
      style={{ background: expanded ? colors.bg : undefined }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-sm shrink-0">{conn.icon}</span>
        <span className="text-[13px] font-medium truncate flex-1">{conn.name}</span>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.dot }} />
      </div>
      {expanded && (
        <div className="mt-1.5 pl-7 space-y-1 animate-fade-up">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium" style={{ color: colors.dot }}>{colors.label}</span>
            <span className="text-[10px] text-muted-foreground/50">{'\u00B7'}</span>
            <span className="text-[10px] text-muted-foreground">{conn.category}</span>
          </div>
          {conn.detail && <div className="text-[10px] text-muted-foreground/60 font-mono">{conn.detail}</div>}
          {conn.apiKeys && conn.apiKeys.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {conn.apiKeys.map((k, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground/40">{k.label}:</span>
                  <code className="font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/70 select-all">{k.masked}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function SkillItem({ skill, selected, onSelect }: { skill: MergedSkill; selected: boolean; onSelect: () => void }) {
  const colors = STATUS_COLORS[skill.status] || STATUS_COLORS.inactive;

  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-lg px-2.5 py-1.5 transition-all duration-150 hover:bg-white/[0.04] flex items-center gap-2 min-w-0"
      style={selected
        ? { background: accentAlpha(0.06), boxShadow: `inset 0 0 0 1px ${accentAlpha(0.2)}` }
        : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colors.dot }} />
      <span className="text-[11px] font-mono truncate" style={{ color: selected ? palette.white : zincAlpha(0.75) }}>{skill.name}</span>
    </button>
  );
}

export function BrainTab() {
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  // Memory timeline state
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [expandedMemFile, setExpandedMemFile] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchBrain().catch(() => null),
      fetchMemoryTimeline().catch(() => ({ files: [] })),
    ]).then(([brain, mem]) => {
      if (brain) setData(brain);
      setMemoryFiles(mem.files || []);
      setLoading(false);
    });
  }, []);

  const mergedSkills = useMemo(() => {
    if (!data) return [];
    const skillConns = new Map<string, Connection>();
    for (const c of (data.connections || [])) {
      if (c.category === 'Skills') skillConns.set(c.name.toLowerCase(), c);
    }
    const seen = new Set<string>();
    const result: MergedSkill[] = [];
    for (const s of (data.skills || [])) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const conn = skillConns.get(key);
      result.push({
        name: s,
        icon: conn?.icon || '\u{1F527}',
        status: conn?.status || 'active',
        detail: conn?.detail || 'OpenClaw skill',
      });
    }
    for (const c of (data.connections || [])) {
      if (c.category === 'Skills' && !seen.has(c.name.toLowerCase())) {
        seen.add(c.name.toLowerCase());
        result.push({ name: c.name, icon: c.icon, status: c.status, detail: c.detail });
      }
    }
    return result;
  }, [data?.skills, data?.connections]);

  const nonSkillConnections = useMemo(() => {
    if (!data) return {};
    return (data.connections || [])
      .filter(c => c.category !== 'Skills')
      .reduce<Record<string, Connection[]>>((acc, c) => {
        (acc[c.category] = acc[c.category] || []).push(c);
        return acc;
      }, {});
  }, [data?.connections]);

  const filteredSkills = useMemo(() => {
    const q = skillSearch.toLowerCase();
    return q ? mergedSkills.filter(s => s.name.toLowerCase().includes(q)) : mergedSkills;
  }, [mergedSkills, skillSearch]);

  const nonSkillConnectionCount = useMemo(() => {
    if (!data) return 0;
    return (data.connections || []).filter(c => c.category !== 'Skills').length;
  }, [data?.connections]);

  if (loading) return <div className="text-muted-foreground animate-fade-in">Loading agent brain...</div>;
  if (!data) return <div className="text-red-400">Failed to load agent data</div>;

  const name = data.identity?.match(/Name:\*?\*?\s*(.+)/)?.[1]?.trim() || 'A.M.A.';
  const creature = data.identity?.match(/Creature:\*?\*?\s*(.+)/)?.[1]?.trim() || '';
  const emoji = data.identity?.match(/Emoji:\*?\*?\s*(.+)/)?.[1]?.trim() || '\u{1F47B}\u26A1';
  const activeNonSkillConns = (data.connections || []).filter(c => c.category !== 'Skills' && c.status === 'active').length;
  const activeSkills = mergedSkills.filter(s => s.status === 'active').length;
  const selectedSkillData = selectedSkill ? mergedSkills.find(s => s.name === selectedSkill) : null;

  return (
    <div className="stagger-children">
      {/* Identity Header */}
      <div className="glow-border rounded-2xl p-5 mb-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30"
          style={{ background: `radial-gradient(ellipse at 20% 50%, ${accentAlpha(0.06)}, transparent 60%)` }} />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-3xl animate-glow-pulse">{emoji}</span>
            <div>
              <h2 className="text-xl font-bold gradient-text text-glow-green leading-tight">{name}</h2>
              {creature && <p className="text-xs text-muted-foreground mt-0.5">{creature}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1.5">
              {Object.entries(data.channels).map(([ch, info]) => (
                <span key={ch} className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                  style={{
                    background: info.enabled ? accentAlpha(0.08) : errorAlpha(0.08),
                    color: info.enabled ? palette.accent : status.error.color,
                  }}>
                  {ch === 'whatsapp' ? '\u{1F4AC}' : ch === 'slack' ? '\u{1F4BC}' : ch === 'telegram' ? '\u2708\uFE0F' : '\u{1F4E1}'} {ch}
                </span>
              ))}
            </div>
            <code className="px-2.5 py-1 rounded-lg text-[11px] font-mono" style={{ background: accentAlpha(0.08), color: palette.accent }}>
              {data.model.primary || 'unknown'}
            </code>
          </div>
        </div>
      </div>

      {/* Integrations + Skills — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        {/* Integrations */}
        {nonSkillConnectionCount > 0 && (
          <div className="glass-card rounded-xl overflow-hidden">
            <button
              onClick={() => setIntegrationsOpen(!integrationsOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
            >
              <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
                <span className="w-1 h-4 rounded-full" style={{ background: palette.subtle }} />
                Integrations
                <span className="font-normal text-muted-foreground/60 text-xs">{nonSkillConnectionCount}</span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-medium"
                  style={{ background: status.success.bg, color: status.success.color }}>{activeNonSkillConns} active</span>
              </h3>
              <span className="text-muted-foreground/40 text-xs transition-transform duration-200"
                style={{ transform: integrationsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
            </button>
            {integrationsOpen && (
              <div className="px-4 pb-4 space-y-1 animate-fade-up">
                {Object.entries(nonSkillConnections).map(([category, conns]) => (
                  <div key={category}>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold px-3 pt-2 pb-1">{category}</div>
                    {conns.map(c => <ConnectionRow key={c.name} conn={c} />)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        <div className="glass-card rounded-xl overflow-hidden">
          <button
            onClick={() => setSkillsOpen(!skillsOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
          >
            <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.muted }} />
              Skills
              <span className="font-normal text-muted-foreground/60 text-xs">{mergedSkills.length}</span>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-medium"
                style={{ background: status.success.bg, color: status.success.color }}>{activeSkills} active</span>
            </h3>
            <span className="text-muted-foreground/40 text-xs transition-transform duration-200"
              style={{ transform: skillsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
          </button>

          {skillsOpen && (
            <div className="px-4 pb-4 animate-fade-up">
              <div className="relative mb-3">
                <input
                  type="text"
                  value={skillSearch}
                  onChange={e => { setSkillSearch(e.target.value); setSelectedSkill(null); }}
                  placeholder={`Search ${mergedSkills.length} skills...`}
                  className="w-full text-[11px] font-mono bg-white/[0.04] border border-border/30 rounded-lg px-3 py-1.5 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[rgba(220,38,38,0.4)] transition-colors"
                />
                {skillSearch && (
                  <button onClick={() => setSkillSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground text-xs">x</button>
                )}
              </div>

              {selectedSkillData && (
                <div className="mb-3 px-3 py-2.5 rounded-lg animate-fade-up"
                  style={{ background: accentAlpha(0.06), border: `1px solid ${accentAlpha(0.15)}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{selectedSkillData.icon}</span>
                      <span className="text-[13px] font-semibold">{selectedSkillData.name}</span>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-medium"
                        style={{ background: (STATUS_COLORS[selectedSkillData.status] || STATUS_COLORS.inactive).bg, color: (STATUS_COLORS[selectedSkillData.status] || STATUS_COLORS.inactive).dot }}>
                        {(STATUS_COLORS[selectedSkillData.status] || STATUS_COLORS.inactive).label}
                      </span>
                    </div>
                    <button onClick={() => setSelectedSkill(null)}
                      className="text-muted-foreground/40 hover:text-muted-foreground text-xs px-1">x</button>
                  </div>
                  <div className="mt-1.5 pl-7 text-[10px] text-muted-foreground/60 font-mono space-y-0.5">
                    <div>Path: ~/clawd/skills/{selectedSkillData.name}/</div>
                    <div>Detail: {selectedSkillData.detail}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-1 gap-y-0">
                {filteredSkills.map(s => (
                  <SkillItem
                    key={s.name}
                    skill={s}
                    selected={selectedSkill === s.name}
                    onSelect={() => setSelectedSkill(selectedSkill === s.name ? null : s.name)}
                  />
                ))}
              </div>

              {skillSearch && filteredSkills.length === 0 && (
                <div className="text-[11px] text-muted-foreground/40 py-4 text-center font-mono">No skills matching "{skillSearch}"</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Workspace Files — compact grid */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
          <h3 className="text-sm font-semibold tracking-wide">Workspace Files</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <MarkdownCard icon={'\u{1F47B}'} title="SOUL.md" content={data.soul} badge="personality" />
          <MarkdownCard icon={'\u{1F464}'} title="USER.md" content={data.user} badge="about you" />
          <MarkdownCard icon={'\u{1F9E0}'} title="MEMORY.md" content={data.memory} badge={`${data.memory?.split('\n').length || 0}L`} />
          <MarkdownCard icon={'\u{1F527}'} title="TOOLS.md" content={data.tools} />
          <MarkdownCard icon={'\u{1F493}'} title="HEARTBEAT.md" content={data.heartbeat} />
        </div>
      </div>

      {/* Memory Timeline — full width, compact */}
      {memoryFiles.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 tracking-wide flex items-center gap-2">
            <span className="w-1 h-4 rounded-full" style={{ background: palette.muted }} />
            Memory Timeline
            <span className="text-muted-foreground/60 font-normal text-xs">{memoryFiles.length} files</span>
          </h3>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: accentAlpha(0.15) }} />
            <div className="space-y-1.5">
              {memoryFiles.slice(0, 8).map((f, i) => {
                const isExpanded = expandedMemFile === f.name;
                return (
                  <button key={f.name} onClick={() => setExpandedMemFile(isExpanded ? null : f.name)}
                    className="w-full text-left relative pl-10 group">
                    <div className="absolute left-[12px] top-3 w-2.5 h-2.5 rounded-full border-2 transition-colors"
                      style={{
                        borderColor: i === 0 ? palette.accent : accentAlpha(0.3),
                        background: i === 0 ? palette.accent : 'transparent',
                      }} />
                    <div className={`rounded-lg px-4 py-2.5 transition-all hover:bg-white/[0.03] ${
                      isExpanded ? 'bg-white/[0.02] ring-1 ring-[rgba(220,38,38,0.2)]' : ''
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium font-mono">{f.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground font-mono">{f.lines}L</span>
                          <span className="text-[10px] text-muted-foreground">{relativeDate(f.modified)}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 text-[11px] text-muted-foreground/70 font-mono whitespace-pre-wrap leading-relaxed animate-fade-up">
                          {f.preview}...
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              {memoryFiles.length > 8 && (
                <div className="text-[11px] text-muted-foreground/50 text-center py-1 font-mono">
                  + {memoryFiles.length - 8} more files
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
