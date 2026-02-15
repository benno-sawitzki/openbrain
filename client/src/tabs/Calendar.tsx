import { useState, useEffect, useMemo } from 'react';
import { fetchCalendar } from '../api';
import { palette, accentAlpha, mutedAlpha, subtleAlpha } from '../theme';

interface CalEvent {
  type: 'calendar' | 'task' | 'followup';
  title: string;
  start: string;
  end?: string;
  location?: string;
  taskId?: string;
  leadId?: string;
  energy?: string;
  value?: number;
  stage?: string;
}

const TYPE_STYLES: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  calendar: { color: palette.subtle, bg: subtleAlpha(0.08), icon: '\u{1F4C5}', label: 'Event' },
  task: { color: palette.accent, bg: accentAlpha(0.08), icon: '\u25A3', label: 'Task' },
  followup: { color: palette.muted, bg: mutedAlpha(0.08), icon: '\u{1F4DE}', label: 'Follow-up' },
};

type ViewMode = 'month' | 'week';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(s: string): string {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    if (s.length === 10) return 'All day';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // Start from Monday of the week containing the 1st
  let startDow = first.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to 0=Mon
  const start = new Date(first);
  start.setDate(start.getDate() - startDow);

  // End on Sunday of the week containing the last day
  let endDow = last.getDay();
  endDow = endDow === 0 ? 6 : endDow - 1;
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - endDow));

  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function getWeekDays(refDate: Date): Date[] {
  const d = new Date(refDate);
  let dow = d.getDay(); // 0=Sun
  dow = dow === 0 ? 6 : dow - 1; // 0=Mon
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(day.getDate() + i);
    return day;
  });
}

export function CalendarTab() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [refDate, setRefDate] = useState<Date>(new Date()); // controls which month/week we're viewing

  useEffect(() => {
    fetchCalendar().then(d => {
      setEvents(d.events || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const today = useMemo(() => new Date(), []);

  // Index events by date for fast lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of events) {
      const d = e.start?.slice(0, 10);
      if (d) (map[d] = map[d] || []).push(e);
    }
    return map;
  }, [events]);

  const monthDays = useMemo(() => getMonthDays(refDate.getFullYear(), refDate.getMonth()), [refDate]);
  const weekDays = useMemo(() => getWeekDays(refDate), [refDate]);

  const selectedDateStr = isoDate(selectedDate);
  const selectedEvents = eventsByDate[selectedDateStr] || [];

  function navigate(dir: -1 | 1) {
    const d = new Date(refDate);
    if (view === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setRefDate(d);
  }

  function goToday() {
    const t = new Date();
    setRefDate(t);
    setSelectedDate(t);
  }

  const monthLabel = refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekLabel = (() => {
    const days = getWeekDays(refDate);
    const s = days[0];
    const e = days[6];
    if (s.getMonth() === e.getMonth()) {
      return `${s.toLocaleDateString('en-US', { month: 'long' })} ${s.getDate()}\u2013${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${s.toLocaleDateString('en-US', { month: 'short' })} ${s.getDate()} \u2013 ${e.toLocaleDateString('en-US', { month: 'short' })} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  if (loading) return <div className="text-muted-foreground">Loading calendar...</div>;

  return (
    <div className="space-y-4">
      {/* Header: navigation + view toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-balance">Calendar</h2>
          <button onClick={goToday}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-border/50 hover:bg-white/[0.04] transition-colors">
            Today
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="size-7 flex items-center justify-center rounded-md hover:bg-white/[0.04] transition-colors" aria-label="Previous">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={() => navigate(1)} className="size-7 flex items-center justify-center rounded-md hover:bg-white/[0.04] transition-colors" aria-label="Next">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <span className="text-sm font-semibold tabular-nums">{view === 'month' ? monthLabel : weekLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-border/50 p-0.5">
          {(['month', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                view === v ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid + day detail side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

        {/* Calendar grid */}
        <div className="glass-card rounded-xl overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border/30">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {view === 'month' ? (
            /* Month grid */
            <div className="grid grid-cols-7">
              {monthDays.map((day, i) => {
                const dateStr = isoDate(day);
                const isCurrentMonth = day.getMonth() === refDate.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDate);
                const dayEvts = eventsByDate[dateStr] || [];
                return (
                  <button key={i} onClick={() => setSelectedDate(new Date(day))}
                    className={`relative px-1.5 py-1.5 min-h-[72px] text-left border-b border-r border-border/10 transition-colors ${
                      isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                    } ${!isCurrentMonth ? 'opacity-30' : ''}`}>
                    <span className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-medium tabular-nums ${
                      isToday ? 'text-white' : isSelected ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                      style={isToday ? { background: palette.accent } : undefined}>
                      {day.getDate()}
                    </span>
                    {dayEvts.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvts.slice(0, 2).map((e, j) => {
                          const s = TYPE_STYLES[e.type] || TYPE_STYLES.calendar;
                          return (
                            <div key={j} className="truncate text-[9px] leading-tight px-1 py-0.5 rounded"
                              style={{ background: s.bg, color: s.color }}>
                              {e.title}
                            </div>
                          );
                        })}
                        {dayEvts.length > 2 && (
                          <div className="text-[9px] text-muted-foreground px-1">+{dayEvts.length - 2}</div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Week grid — taller cells with more detail */
            <div className="grid grid-cols-7">
              {weekDays.map((day, i) => {
                const dateStr = isoDate(day);
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, selectedDate);
                const dayEvts = eventsByDate[dateStr] || [];
                return (
                  <button key={i} onClick={() => setSelectedDate(new Date(day))}
                    className={`relative px-2 py-2 min-h-[280px] text-left border-r border-border/10 transition-colors ${
                      isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                    }`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`inline-flex items-center justify-center size-7 rounded-full text-sm font-semibold tabular-nums ${
                        isToday ? 'text-white' : 'text-muted-foreground'
                      }`}
                        style={isToday ? { background: palette.accent } : undefined}>
                        {day.getDate()}
                      </span>
                      {dayEvts.length > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{dayEvts.length}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayEvts.slice(0, 6).map((e, j) => {
                        const s = TYPE_STYLES[e.type] || TYPE_STYLES.calendar;
                        const time = formatTime(e.start);
                        return (
                          <div key={j} className="rounded px-1.5 py-1 text-[10px] leading-tight"
                            style={{ background: s.bg }}>
                            <div className="flex items-center gap-1">
                              <span className="font-mono tabular-nums shrink-0" style={{ color: s.color }}>
                                {time === 'All day' ? '\u2014' : time}
                              </span>
                            </div>
                            <div className="truncate mt-0.5 text-foreground/80">{e.title}</div>
                          </div>
                        );
                      })}
                      {dayEvts.length > 6 && (
                        <div className="text-[9px] text-muted-foreground px-1">+{dayEvts.length - 6}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Day detail sidebar */}
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-balance">
              <span className="w-1 h-4 rounded-full" style={{ background: palette.accent }} />
              {sameDay(selectedDate, today) ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <span className="text-[11px] text-muted-foreground tabular-nums">{selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</span>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No events</div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e, i) => {
                const style = TYPE_STYLES[e.type] || TYPE_STYLES.calendar;
                return (
                  <div key={i} className="rounded-lg p-2.5 transition-colors hover:bg-white/[0.03]"
                    style={{ background: style.bg }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: style.color }}>{formatTime(e.start)}</span>
                      {e.end && e.start !== e.end && (
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">\u2013 {formatTime(e.end)}</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium ml-auto shrink-0"
                        style={{ color: style.color }}>{style.label}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{e.title}</div>
                    {(e.location || e.energy || e.value != null || e.stage) && (
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                        {e.location && <span className="truncate">{e.location}</span>}
                        {e.energy && <span>{'\u26A1'} {e.energy}</span>}
                        {e.value != null && <span className="font-mono tabular-nums" style={{ color: palette.accent }}>{'\u20AC'}{e.value.toLocaleString()}</span>}
                        {e.stage && <span className="px-1.5 py-0.5 rounded bg-white/[0.06]">{e.stage}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/20">
            {Object.entries(TYPE_STYLES).map(([type, style]) => (
              <div key={type} className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: style.color }} />
                <span className="text-[10px] text-muted-foreground">{style.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
