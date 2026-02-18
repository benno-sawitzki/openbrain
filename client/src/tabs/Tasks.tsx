import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Task, AppState } from '../types';
import * as api from '../api';
import { palette, colors, accentAlpha, zincAlpha } from '../theme';

const DISPLAY_COLUMNS = [
  { key: 'todo', label: 'To Do', color: palette.muted },
  { key: 'in_progress', label: 'In Progress', also: ['doing'], color: palette.accent },
  { key: 'done', label: 'Done', color: palette.subtle },
  { key: 'hyperfokus', label: 'HyperFokus', color: '#6366F1', isExternal: true },
];

const energyEmoji = (e?: string) => ({ high: '⚡', medium: '🔋', low: '🪫' }[e || 'medium'] || '🔋');
const today = () => new Date().toISOString().slice(0, 10);

const DIFFICULTY_TO_IMPAKT: Record<string, string> = { hard: 'high', medium: 'medium', easy: 'low' };

function transformTaskForHyperFokus(task: Task): Record<string, any> {
  // Build description from tags, campaign, stake, notes
  const descParts: string[] = [];
  if (task.campaign) descParts.push(`Campaign: ${task.campaign}`);
  if (task.stake) descParts.push(`Stakes: ${task.stake}`);
  if (task.tags?.length) descParts.push(`Tags: ${task.tags.join(', ')}`);
  if ((task as any).notes?.length) descParts.push((task as any).notes.join('\n'));

  return {
    title: task.content,
    description: descParts.join('\n') || undefined,
    energy_required: task.energy || 'medium',
    duration: task.estimate || 30,
    scheduled_date: task.due || undefined,
    impakt: DIFFICULTY_TO_IMPAKT[(task as any).difficulty || ''] || 'medium',
    priority: 2,
    status: 'next',
  };
}

function TaskCard({ task, onClick, hfSent }: { task: Task; onClick: () => void; hfSent?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const overdue = task.due && task.due < today() && task.status !== 'done';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="glass-card rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.01]"
      onClick={onClick}
    >
      <div className="flex items-start gap-2 text-sm">
        <span className="font-medium leading-snug">{task.content}</span>
        {hfSent && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
            HF
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5 text-[11px] text-muted-foreground">
        <span>{energyEmoji(task.energy)} {task.energy || 'medium'}</span>
        {task.estimate && <span className="font-mono">{task.estimate}m</span>}
        {task.due && <span className={overdue ? 'text-red-400' : ''}>📅 {task.due}</span>}
        {task.stake && <span>💰</span>}
        {task.links && Object.keys(task.links).length > 0 && <span>📎</span>}
        {task.campaign && <span className="px-2 py-0.5 rounded-md bg-zinc-500/10 text-zinc-400">{task.campaign}</span>}
        {task.tags?.map(tag => <span key={tag} className="px-2 py-0.5 rounded-md bg-white/[0.05] text-muted-foreground">{tag}</span>)}
      </div>
    </div>
  );
}

function TaskDialog({ task, open, onClose, onSave, onDelete }: {
  task: Task | null; open: boolean; onClose: () => void;
  onSave: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [content, setContent] = useState('');
  const [energy, setEnergy] = useState('medium');
  const [estimate, setEstimate] = useState('');
  const [due, setDue] = useState('');
  const [tags, setTags] = useState('');
  const [campaign, setCampaign] = useState('');
  const [stake, setStake] = useState('');
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [specLoading, setSpecLoading] = useState(false);
  const [showSpec, setShowSpec] = useState<string | null>(null);

  const resetForm = (t: Task | null) => {
    setContent(t?.content || '');
    setEnergy(t?.energy || 'medium');
    setEstimate(t?.estimate?.toString() || '');
    setDue(t?.due || '');
    setTags(t?.tags?.join(', ') || '');
    setCampaign(t?.campaign || '');
    setStake(t?.stake || '');
    setSpecs({});
    setShowSpec(null);
  };

  useEffect(() => {
    if (open && task?.links && Object.keys(task.links).length > 0) {
      setSpecLoading(true);
      api.fetchTaskSpec(task.id).then(data => {
        setSpecs(data.specs || {});
        setSpecLoading(false);
      }).catch(() => setSpecLoading(false));
    }
  }, [open, task?.id]);

  if (open && task && content === '' && task.content !== '') {
    resetForm(task);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setContent(''); } }}>
      <DialogContent className="glass-card border-border/50 max-w-lg rounded-xl" style={{ background: colors.bgDialog }}>
        <DialogHeader>
          <DialogTitle className="font-semibold tracking-wide">{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Description</Label><Input value={content} onChange={e => setContent(e.target.value)} className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Energy</Label>
              <select value={energy} onChange={e => setEnergy(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="high">⚡ High</option>
                <option value="medium">🔋 Medium</option>
                <option value="low">🪫 Low</option>
              </select>
            </div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Estimate (min)</Label><Input type="number" value={estimate} onChange={e => setEstimate(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Due</Label><Input type="date" value={due} onChange={e => setDue(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Tags</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="comma separated" className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Campaign</Label><Input value={campaign} onChange={e => setCampaign(e.target.value)} className="mt-1.5" /></div>
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Stakes</Label><Input value={stake} onChange={e => setStake(e.target.value)} className="mt-1.5" /></div>
          </div>
          {task && (
            <div className="text-xs text-muted-foreground space-y-2 pt-2 border-t border-border/50">
              {task.notes && task.notes.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-foreground/70 uppercase tracking-wider" style={{ fontSize: '10px' }}>Notes</div>
                  {task.notes.map((n, i) => <div key={i}>• {n}</div>)}
                </div>
              )}
              {task.links && Object.keys(task.links).length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-foreground/70 uppercase tracking-wider" style={{ fontSize: '10px' }}>Attachments</div>
                  {Object.entries(task.links).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-zinc-400">📎 {key}</span>
                      <span className="text-muted-foreground/60 truncate">{val}</span>
                      {specs[key] && (
                        <button className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400"
                          onClick={() => setShowSpec(showSpec === key ? null : key)}>
                          {showSpec === key ? 'Hide' : 'View'}
                        </button>
                      )}
                      {specLoading && !specs[key] && <span className="text-muted-foreground/40">loading…</span>}
                    </div>
                  ))}
                  {showSpec && specs[showSpec] && (
                    <pre className="mt-2 p-3 rounded-lg bg-black/40 text-xs text-foreground/80 whitespace-pre-wrap max-h-[300px] overflow-auto border border-border/30">
                      {specs[showSpec]}
                    </pre>
                  )}
                </div>
              )}
              <div className="font-mono">Created: {task.createdAt?.slice(0, 10)} · Updated: {task.updatedAt?.slice(0, 10)}</div>
              {task.completedAt && <div className="font-mono">Completed: {task.completedAt.slice(0, 10)}</div>}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            {task && <Button variant="destructive" size="sm" className="rounded-lg" onClick={() => { onDelete(task.id); onClose(); setContent(''); }}>Delete</Button>}
            <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => { onClose(); setContent(''); }}>Cancel</Button>
            <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => {
              onSave(task?.id || '', {
                content, energy: energy as Task['energy'],
                estimate: estimate ? parseInt(estimate) : undefined,
                due: due || undefined,
                tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
                campaign: campaign || undefined,
                stake: stake || undefined,
              });
              onClose(); setContent('');
            }}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DroppableColumn({ id, label, count, color, children }: { id: string; label: string; count: number; color: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-xl p-3 min-h-[300px] transition-all duration-200 ${isOver ? 'ring-1' : ''}`}
      style={{
        background: isOver ? accentAlpha(0.04) : zincAlpha(0.03),
        ...(isOver ? { ringColor: accentAlpha(0.2) } : {}),
      }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold text-muted-foreground tracking-wide">{label}</span>
        </div>
        <span className="text-[11px] bg-white/[0.06] px-2 py-0.5 rounded-full text-muted-foreground font-mono">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function TasksTab({ tasks, onRefresh, notify, setState }: { tasks: Task[]; onRefresh: () => void; notify: (m: string) => void; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sentToHf, setSentToHf] = useState<Map<string, { timestamp: string; title: string }>>(new Map());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const findColumn = (id: string): string | null => {
    if (DISPLAY_COLUMNS.find(c => c.key === id)) return id;
    const task = tasks.find(t => t.id === id);
    if (task) {
      const col = DISPLAY_COLUMNS.find(c => c.key === task.status || ((c as any).also || []).includes(task.status));
      return col?.key || null;
    }
    return null;
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const taskId = active.id as string;
    const targetColumn = findColumn(over.id as string);
    if (!targetColumn) return;

    const task = tasks.find(t => t.id === taskId);
    const currentCol = task ? DISPLAY_COLUMNS.find(c => c.key === task.status || ((c as any).also || []).includes(task.status))?.key : null;

    // HyperFokus column: send task via API, don't move in kanban
    if (task && targetColumn === 'hyperfokus') {
      notify('⏳ Sending to HyperFokus…');
      try {
        const hfPayload = transformTaskForHyperFokus(task);
        await api.sendToHyperFokus(hfPayload);
        setSentToHf(prev => {
          const next = new Map(prev);
          next.set(taskId, { timestamp: new Date().toISOString(), title: task.content });
          return next;
        });
        notify(`✅ "${task.content}" sent to HyperFokus`);
      } catch (err: any) {
        const msg = err?.message || 'unknown error';
        notify(`❌ Failed to send to HyperFokus: ${msg}`);
      }
      return;
    }

    if (task && currentCol !== targetColumn) {
      setState(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: targetColumn as Task['status'] } : t),
      }));
      const colLabel = DISPLAY_COLUMNS.find(c => c.key === targetColumn)?.label || targetColumn;
      notify(`✅ Task moved to ${colLabel}`);
      try {
        await api.moveTask(taskId, targetColumn);
        onRefresh();
      } catch {
        notify('❌ Failed to move task — reverting');
        onRefresh();
      }
    }
  };

  const handleSave = async (id: string, data: Partial<Task>) => {
    try {
      if (id) {
        await api.updateTask(id, data);
        notify(`✅ Updated: ${data.content}`);
      } else {
        await api.createTask(data);
        notify(`✅ Added: ${data.content}`);
      }
      onRefresh();
    } catch { notify('❌ Failed to save task'); }
  };

  const handleDelete = async (id: string) => {
    // Optimistic: remove from UI immediately
    setState((prev: AppState) => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
    notify('🗑️ Task deleted');
    try {
      await api.deleteTask(id);
    } catch { notify('❌ Failed to delete task'); onRefresh(); }
  };

  const activeTask = tasks.find(t => t.id === activeId);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">Tasks</h2>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">taskpipe</span>
        </div>
        <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => { setEditTask(null); setDialogOpen(true); }}>+ Add</Button>
      </div>

      <TaskDialog task={editTask} open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSave} onDelete={handleDelete} />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {DISPLAY_COLUMNS.map(col => {
            const isHf = (col as any).isExternal;
            if (isHf) {
              // HyperFokus column: shows recently sent tasks
              const hfEntries = Array.from(sentToHf.entries())
                .sort(([, a], [, b]) => b.timestamp.localeCompare(a.timestamp));
              return (
                <DroppableColumn key={col.key} id={col.key} label={col.label} count={hfEntries.length} color={col.color}>
                  <SortableContext items={[]} strategy={verticalListSortingStrategy}>
                    {hfEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 text-center py-6">
                        Drag tasks here to send to HyperFokus
                      </p>
                    ) : (
                      hfEntries.map(([id, info]) => (
                        <div key={id} className="rounded-xl p-3 text-sm opacity-60" style={{ background: 'rgba(99,102,241,0.05)' }}>
                          <div className="font-medium text-muted-foreground">{info.title}</div>
                          <div className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                            Sent {info.timestamp.slice(11, 16)}
                          </div>
                        </div>
                      ))
                    )}
                  </SortableContext>
                </DroppableColumn>
              );
            }
            const colTasks = tasks.filter(t => t.status === col.key || ((col as any).also || []).includes(t.status));
            return (
              <DroppableColumn key={col.key} id={col.key} label={col.label} count={colTasks.length} color={col.color}>
                <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} hfSent={sentToHf.has(task.id)} onClick={() => { setEditTask(task); setDialogOpen(true); }} />
                  ))}
                </SortableContext>
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="glass-card glow-green-sm rounded-xl p-3.5 opacity-90">
              <div className="text-sm font-medium">{activeTask.content}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
