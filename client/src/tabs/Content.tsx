import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ContentItem, InboxItem } from '../types';
import * as api from '../api';
import { palette, colors, accentAlpha } from '../theme';

const statusStyle = (s: string) => ({
  draft: 'bg-yellow-500/15 text-yellow-400',
  scheduled: 'bg-zinc-500/15 text-zinc-400',
  published: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
}[s] || 'bg-white/[0.05] text-muted-foreground');

const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', twitter: 'Twitter', email: 'Email' };
const TYPE_EMOJI: Record<string, string> = { social: '\u{1F4F1}', inspo: '\u{1F4A1}', idea: '\u{1F4AD}', general: '\u{1F4E5}' };
const INBOX_FILTERS = ['all', 'social', 'inspo', 'idea', 'general'] as const;

export function ContentTab({ content, inbox, onRefresh, notify }: { content: ContentItem[]; inbox: InboxItem[]; onRefresh: () => void; notify: (m: string) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('linkedin');
  const [tags, setTags] = useState('');

  const [inboxFilter, setInboxFilter] = useState<string>('all');
  const [expandedInbox, setExpandedInbox] = useState<string | null>(null);

  const openEdit = (item: ContentItem | null) => {
    setEditItem(item);
    setText(item?.text || '');
    setPlatform(item?.platform || 'linkedin');
    setTags(item?.tags?.join(', ') || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const body = { text, platform, tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [] };
    try {
      if (editItem) { await api.updateContent(editItem.id, body); notify('\u2705 Updated'); }
      else { await api.createContent(body); notify(`\u2705 Queued: ${text.slice(0, 40)}`); }
      setDialogOpen(false);
      onRefresh();
    } catch { notify('\u274C Failed'); }
  };

  const sorted = [...content].sort((a, b) => {
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (b.status === 'scheduled' && a.status !== 'scheduled') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const sortedInbox = [...inbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredInbox = inboxFilter === 'all' ? sortedInbox : sortedInbox.filter(i => i.type === inboxFilter);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-balance">Content</h2>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">contentq</span>
        </div>
        <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => openEdit(null)}>+ Add</Button>
      </div>

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="glass-card border-border/50 max-w-lg rounded-xl" style={{ background: colors.bgDialog }}>
          <DialogHeader><DialogTitle className="font-semibold tracking-wide">{editItem ? 'Edit Content' : 'New Content'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Text</Label><Textarea rows={4} value={text} onChange={e => setText(e.target.value)} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Platform</Label>
                <select value={platform} onChange={e => setPlatform(e.target.value)} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="linkedin">LinkedIn</option><option value="twitter">Twitter</option><option value="email">Email</option>
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground uppercase tracking-wider">Tags</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="comma separated" className="mt-1.5" /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" className="rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={handleSave}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-5 gap-5">
        {/* Queue — left column (3/5) */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-1.5 rounded-full" style={{ background: palette.accent }} />
            <h3 className="text-sm font-semibold">Queue</h3>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{sorted.length}</span>
          </div>

          {sorted.length === 0 ? (
            <div className="glass-card rounded-xl p-10 text-center">
              <p className="text-muted-foreground text-sm">No content queued</p>
              <Button size="sm" className="mt-3 rounded-lg font-semibold" style={{ background: palette.accent, color: palette.black }} onClick={() => openEdit(null)}>+ Create first draft</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(c => (
                <div key={c.id}
                  className="glass-card rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => openEdit(c)}
                >
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium ${statusStyle(c.status)}`}>{c.status}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 text-pretty leading-relaxed">{c.text}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{PLATFORM_LABEL[c.platform] || c.platform}</span>
                        <span className="text-border">\u00B7</span>
                        <span className="font-mono tabular-nums">{c.createdAt?.slice(0, 10)}</span>
                        {c.scheduledFor && (
                          <>
                            <span className="text-border">\u00B7</span>
                            <span className="font-mono tabular-nums" style={{ color: palette.accent }}>{c.scheduledFor}</span>
                          </>
                        )}
                        {c.tags?.length ? (
                          <>
                            <span className="text-border">\u00B7</span>
                            <span className="truncate">{c.tags.join(', ')}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inbox — right column (2/5) */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-1.5 rounded-full" style={{ background: palette.subtle }} />
            <h3 className="text-sm font-semibold">Inbox</h3>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{inbox.length}</span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1 mb-3">
            {INBOX_FILTERS.map(f => {
              const isActive = inboxFilter === f;
              return (
                <button key={f} onClick={() => setInboxFilter(f)}
                  className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.03]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 rounded-md"
                      style={{ background: accentAlpha(0.08), boxShadow: `inset 0 0 0 1px ${accentAlpha(0.12)}` }} />
                  )}
                  <span className="relative">
                    {f === 'all' ? 'All' : `${TYPE_EMOJI[f] || ''} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Inbox items */}
          {filteredInbox.length === 0 ? (
            <div className="glass-card rounded-xl p-10 text-center">
              <p className="text-muted-foreground text-sm">No inbox items</p>
              <p className="text-muted-foreground/50 text-xs mt-1.5">Forward content via WhatsApp or API</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredInbox.map(item => (
                <div key={item.id}
                  className="glass-card rounded-xl p-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedInbox(expandedInbox === item.id ? null : item.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0">{TYPE_EMOJI[item.type] || '\u{1F4E5}'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title || item.note || item.text || item.url || '(empty)'}</p>
                      {item.note && item.title && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 text-pretty leading-relaxed">{item.note}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular-nums">{item.createdAt?.slice(0, 10)}</span>
                        {item.tags?.length ? <span>\u00B7 {item.tags.join(', ')}</span> : null}
                        {item.promoted && <span className="px-1.5 py-0.5 rounded-full" style={{ background: accentAlpha(0.1), color: palette.accent }}>promoted</span>}
                      </div>
                    </div>
                  </div>
                  {expandedInbox === item.id && (
                    <div className="mt-2.5 pt-2.5 border-t border-border/30 text-xs text-muted-foreground space-y-1.5">
                      {item.text && <p className="whitespace-pre-wrap text-pretty leading-relaxed">{item.text}</p>}
                      {item.url && <p>{'\u{1F517}'} <a href={item.url} target="_blank" className="underline hover:no-underline" style={{ color: palette.accent }}>{item.url}</a></p>}
                      {item.media && <p>{'\u{1F4CE}'} {item.media}</p>}
                      <p className="font-mono text-muted-foreground/50">ID: {item.id} \u00B7 Source: {item.source}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
