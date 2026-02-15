import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Lead, AppState } from '../types';
import * as api from '../api';
import { palette, colors, status, accentAlpha, zincAlpha } from '../theme';

interface RevenueData {
  totalWon: number;
  totalPipeline: number;
  byStage: Record<string, { count: number; value: number }>;
  bySource: Record<string, { count: number; value: number }>;
  recentWins: { name: string; value: number; date: string }[];
  conversionRate: number;
  totalLeads: number;
}

const STAGES = ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'] as const;
const STAGE_COLORS: Record<string, string> = { cold: palette.muted, warm: palette.muted, hot: status.error.color, proposal: palette.subtle, won: palette.accent, lost: palette.mid };
const REVENUE_STAGES = ['cold', 'warm', 'hot', 'proposal', 'won'];

function daysSince(d?: string) {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function staleStyle(lead: Lead) {
  const last = lead.touches?.length ? lead.touches[lead.touches.length - 1].date : lead.updatedAt;
  const d = daysSince(last);
  if (d >= 7) return 'border-red-500/20';
  if (d >= 3) return 'border-yellow-500/20';
  return '';
}

function relativeDate(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`glass-card rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.01] ${staleStyle(lead)}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <span className="text-sm font-semibold">{lead.name}</span>
        <span className="text-sm font-bold font-mono" style={{ color: palette.accent }}>{'\u20AC'}{(lead.value || 0).toLocaleString()}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5">
        {lead.source}{lead.score ? ` \u00B7 Score: ${lead.score}` : ''}{lead.tags?.length ? ` \u00B7 ${lead.tags.join(', ')}` : ''}
      </div>
    </div>
  );
}

function LeadDialog({ lead, open, onClose, onSave, onDelete }: {
  lead: Lead | null; open: boolean; onClose: () => void;
  onSave: (id: string, data: Partial<Lead>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(lead?.name || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [company, setCompany] = useState(lead?.company || '');
  const [source, setSource] = useState(lead?.source || 'other');
  const [value, setValue] = useState(lead?.value?.toString() || '');
  const [stage, setStage] = useState(lead?.stage || 'cold');
  const [tags, setTags] = useState(lead?.tags?.join(', ') || '');

  if (open && lead && name === '' && lead.name !== '') {
    setName(lead.name); setEmail(lead.email || ''); setCompany(lead.company || '');
    setSource(lead.source || 'other'); setValue(lead.value?.toString() || '');
    setStage(lead.stage); setTags(lead.tags?.join(', ') || '');
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setName(''); } }}>
      <DialogContent className="glass-card border-border/50 max-w-lg rounded-xl" style={{ background: colors.bgDialog }}>
        <DialogHeader><DialogTitle className="font-semibold tracking-wide">{lead ? 'Edit Lead' : 'New Lead'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Company</Label><Input value={company} onChange={e => setCompany(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Source</Label>
              <select value={source} onChange={e => setSource(e.target.value)} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {['linkedin', 'referral', 'website', 'cold', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Value ({'\u20AC'})</Label><Input type="number" value={value} onChange={e => setValue(e.target.value)} className="mt-1.5" /></div>
            {!lead && <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Stage</Label>
              <select value={stage} onChange={e => setStage(e.target.value)} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>}
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Tags</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="comma separated" className="mt-1.5" /></div>
          </div>
          {lead?.touches?.length ? (
            <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              <div className="font-semibold mb-1.5 uppercase tracking-wider text-[10px]">Touches:</div>
              {lead.touches.map((t, i) => <div key={i}>{'\u2022'} {t.date?.slice(0, 10)} <span className="text-muted-foreground/60">[{t.type}]</span> {t.note}</div>)}
            </div>
          ) : null}
          {lead && <div className="text-xs text-muted-foreground font-mono">
            {lead.followUp && <div>Follow-up: {lead.followUp}</div>}
            <div>Created: {lead.createdAt?.slice(0, 10)} \u00B7 Updated: {lead.updatedAt?.slice(0, 10)}</div>
          </div>}
          <div className="flex gap-2 justify-end pt-2">
            {lead && <Button variant="destructive" size="sm" className="rounded-lg" onClick={() => { onDelete(lead.id); onClose(); setName(''); }}>Delete</Button>}
            <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => { onClose(); setName(''); }}>Cancel</Button>
            <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => {
              onSave(lead?.id || '', {
                name, email: email || undefined, company: company || undefined,
                source, value: value ? parseInt(value) : 0,
                stage: lead ? undefined : stage,
                tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
              });
              onClose(); setName('');
            }}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DroppableStage({ id, count, total, children }: { id: string; count: number; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const color = STAGE_COLORS[id] || palette.muted;
  return (
    <div ref={setNodeRef} className={`rounded-xl p-3 min-h-[300px] transition-all duration-200 ${isOver ? 'ring-1' : ''}`}
      style={{
        background: isOver ? accentAlpha(0.04) : zincAlpha(0.03),
      }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-semibold text-muted-foreground capitalize tracking-wide">{id}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{count} \u00B7 {'\u20AC'}{total.toLocaleString()}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function PipelineTab({ leads, onRefresh, notify, setState }: { leads: Lead[]; onRefresh: () => void; notify: (m: string) => void; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revenueOpen, setRevenueOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    api.fetchRevenue().then(setRevenue).catch(() => {});
  }, []);

  const maxStageValue = revenue ? Math.max(...REVENUE_STAGES.map(s => revenue.byStage[s]?.value || 0), 1) : 1;

  const findStage = (id: string): string | null => {
    if (STAGES.includes(id as any)) return id;
    const lead = leads.find(l => l.id === id);
    return lead?.stage || null;
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const leadId = active.id as string;
    const targetStage = findStage(over.id as string);
    if (!targetStage) return;

    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage !== targetStage) {
      setState(prev => ({
        ...prev,
        leads: prev.leads.map(l => l.id === leadId ? { ...l, stage: targetStage } : l),
      }));
      notify(`\u2705 ${lead.name} moved to ${targetStage}`);
      try { await api.moveLead(leadId, targetStage); onRefresh(); }
      catch { notify('\u274C Failed \u2014 reverting'); onRefresh(); }
    }
  };

  const handleSave = async (id: string, data: Partial<Lead>) => {
    try {
      if (id) { await api.updateLead(id, data); notify(`\u2705 Updated: ${data.name}`); }
      else { await api.createLead(data); notify(`\u2705 Added: ${data.name}`); }
      onRefresh();
    } catch { notify('\u274C Failed to save lead'); }
  };

  const handleDelete = async (id: string) => {
    try { await api.deleteLead(id); notify('\u{1F5D1}\uFE0F Lead deleted'); onRefresh(); }
    catch { notify('\u274C Failed to delete'); }
  };

  const activeLead = leads.find(l => l.id === activeId);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">Pipeline</h2>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">leadpipe</span>
        </div>
        <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => { setEditLead(null); setDialogOpen(true); }}>+ Add</Button>
      </div>

      {/* Revenue Attribution Section */}
      {revenue && (
        <div className="glass-card rounded-xl overflow-hidden mb-5">
          <button onClick={() => setRevenueOpen(!revenueOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors text-left">
            <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
              Revenue Attribution
            </h3>
            <span className="text-muted-foreground/40 text-xs transition-transform duration-200"
              style={{ transform: revenueOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{'\u25B6'}</span>
          </button>
          {revenueOpen && (
            <div className="px-5 pb-5 animate-fade-up space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl p-4 bg-white/[0.03]">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pipeline</div>
                  <div className="text-lg font-bold mt-1 gradient-text">{'\u20AC'}{revenue.totalPipeline.toLocaleString()}</div>
                </div>
                <div className="rounded-xl p-4 bg-white/[0.03]">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Won</div>
                  <div className="text-lg font-bold mt-1" style={{ color: palette.accent }}>{'\u20AC'}{revenue.totalWon.toLocaleString()}</div>
                </div>
                <div className="rounded-xl p-4 bg-white/[0.03]">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Conversion</div>
                  <div className="text-lg font-bold mt-1" style={{ color: palette.subtle }}>{revenue.conversionRate}%</div>
                </div>
                <div className="rounded-xl p-4 bg-white/[0.03]">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Leads</div>
                  <div className="text-lg font-bold mt-1">{revenue.totalLeads}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Funnel */}
                <div className="rounded-xl p-4 bg-white/[0.02]">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Pipeline Funnel</div>
                  <div className="space-y-2">
                    {REVENUE_STAGES.map(stage => {
                      const d = revenue.byStage[stage] || { count: 0, value: 0 };
                      const width = maxStageValue > 0 ? Math.max((d.value / maxStageValue) * 100, 4) : 4;
                      const color = STAGE_COLORS[stage] || palette.muted;
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <span className="text-[10px] uppercase tracking-wider font-medium w-16 text-right text-muted-foreground">{stage}</span>
                          <div className="flex-1 h-5 rounded-md bg-white/[0.03] relative overflow-hidden">
                            <div className="h-full rounded-md transition-all duration-500" style={{ width: `${width}%`, background: color }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{d.count}</span>
                          <span className="text-[10px] font-mono w-20 text-right" style={{ color }}>{'\u20AC'}{d.value.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Source breakdown + recent wins */}
                <div className="space-y-4">
                  <div className="rounded-xl p-4 bg-white/[0.02]">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">By Source</div>
                    <div className="space-y-1.5">
                      {Object.entries(revenue.bySource).map(([source, d]) => (
                        <div key={source} className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: palette.subtle }} />
                            <span className="text-[12px] font-medium capitalize">{source}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-muted-foreground font-mono">{d.count} leads</span>
                            <span className="text-[10px] font-mono" style={{ color: palette.accent }}>{'\u20AC'}{d.value.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {revenue.recentWins.length > 0 && (
                    <div className="rounded-xl p-4 bg-white/[0.02]">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Recent Wins</div>
                      <div className="space-y-1.5">
                        {revenue.recentWins.map((w, i) => (
                          <div key={i} className="flex items-center justify-between py-1 px-2 rounded-lg bg-white/[0.02]">
                            <span className="text-[12px] font-medium">{'\u{1F3C6}'} {w.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-mono">{relativeDate(w.date)}</span>
                              <span className="text-sm font-mono font-bold" style={{ color: palette.accent }}>{'\u20AC'}{w.value.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <LeadDialog lead={editLead} open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSave} onDelete={handleDelete} />

      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-6 gap-3">
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            const total = stageLeads.reduce((s, l) => s + (l.value || 0), 0);
            return (
              <DroppableStage key={stage} id={stage} count={stageLeads.length} total={total}>
                <SortableContext items={stageLeads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onClick={() => { setEditLead(lead); setDialogOpen(true); }} />
                  ))}
                </SortableContext>
              </DroppableStage>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead ? (
            <div className="glass-card glow-green-sm rounded-xl p-3 opacity-90">
              <div className="text-sm font-semibold">{activeLead.name}</div>
              <div className="text-sm font-mono" style={{ color: palette.accent }}>{'\u20AC'}{(activeLead.value || 0).toLocaleString()}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
