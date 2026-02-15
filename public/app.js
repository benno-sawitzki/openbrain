// State
let state = { tasks: [], leads: [], content: [], activity: {}, stats: {}, config: {}, inbox: [], agents: {} };

// Tab switching
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Fetch all data
async function fetchAll() {
  const [tasks, leads, content, activity, stats, config, inbox, agents] = await Promise.all([
    fetch('/api/tasks').then(r => r.json()),
    fetch('/api/leads').then(r => r.json()),
    fetch('/api/content').then(r => r.json()),
    fetch('/api/activity').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/config').then(r => r.json()),
    fetch('/api/inbox').then(r => r.json()),
    fetch('/api/agents').then(r => r.json()),
  ]);
  state = { tasks, leads, content, activity, stats, config, inbox, agents };
  render();
}

// Render all tabs
let inboxFilter = 'all';

function render() {
  renderDashboard();
  renderPipeline();
  renderContent();
  renderInbox();
  renderAgents();
  renderActivity();
}

// Helpers
const esc = s => s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
const energyEmoji = e => ({ high: '⚡', medium: '🔋', low: '🪫' }[e] || '🔋');
const today = () => new Date().toISOString().slice(0, 10);

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function staleClass(lead) {
  const lastTouch = lead.touches?.length ? lead.touches[lead.touches.length - 1].date : lead.updatedAt;
  const days = daysSince(lastTouch);
  if (days >= 7) return 'stale-danger';
  if (days >= 3) return 'stale-warning';
  return '';
}

// === DASHBOARD ===
function renderDashboard() {
  const s = state.stats;
  const el = document.getElementById('dashboard');
  
  const todoTasks = state.tasks.filter(t => t.status !== 'done');
  const doneTasks = state.tasks.filter(t => t.status === 'done');
  const sortedTasks = [...todoTasks.sort((a, b) => {
    const prio = { high: 0, medium: 1, low: 2 };
    return (prio[a.priority] || 1) - (prio[b.priority] || 1);
  }), ...doneTasks];

  // Pipeline stages
  const stages = ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'];
  const stageCounts = {};
  const stageValues = {};
  stages.forEach(st => {
    const ls = state.leads.filter(l => l.stage === st);
    stageCounts[st] = ls.length;
    stageValues[st] = ls.reduce((s, l) => s + (l.value || 0), 0);
  });

  // Leads needing attention
  const attentionLeads = state.leads
    .filter(l => !['won', 'lost'].includes(l.stage))
    .sort((a, b) => {
      const aStale = daysSince(a.updatedAt);
      const bStale = daysSince(b.updatedAt);
      return bStale - aStale;
    }).slice(0, 3);

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">🔥 Streak</div><div class="stat-value">${s.streak || 0} days</div></div>
      <div class="stat-card"><div class="stat-label">✅ Done Today</div><div class="stat-value">${s.doneToday || 0}</div></div>
      <div class="stat-card"><div class="stat-label">📊 Pipeline</div><div class="stat-value">€${(s.pipelineValue || 0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">📝 Drafts</div><div class="stat-value">${s.drafts || 0}</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-title">Today's Tasks</div>
        ${sortedTasks.map((t, i) => `
          <div class="task-card energy-${t.energy || 'medium'} ${t.status === 'done' ? 'done' : ''}">
            <div class="task-title">
              ${i === 0 && t.status !== 'done' ? '<span class="badge badge-now">NOW</span> ' : ''}
              ${t.status === 'done' ? '✅ ' : ''}${esc(t.content)}
            </div>
            <div class="task-meta">
              <span>${energyEmoji(t.energy)} ${t.energy || 'medium'}</span>
              ${t.estimate ? `<span>${t.estimate}m</span>` : ''}
              ${t.due ? `<span>📅 ${t.due}</span>` : ''}
              ${t.stake ? `<span>💰 ${esc(t.stake)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="panel">
        <div class="panel-title">Pipeline Overview</div>
        <div class="mini-kanban">
          ${stages.filter(st => !['lost'].includes(st)).slice(0, 6).map(st => `
            <div class="mini-stage">
              <div class="mini-stage-label">${st}</div>
              <div class="mini-stage-count">${stageCounts[st]}</div>
              <div class="mini-stage-value">€${stageValues[st].toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
        <div class="panel-title" style="margin-top:.75rem">Needs Attention</div>
        ${attentionLeads.map(l => `
          <div class="lead-card ${staleClass(l)}">
            <div><span class="lead-name">${esc(l.name)}</span> <span class="lead-value">€${(l.value || 0).toLocaleString()}</span></div>
            <div class="lead-meta">${l.stage} · ${l.source}${l.followUp ? ` · follow-up ${l.followUp}` : ''}</div>
          </div>
        `).join('')}
      </div>
      <div class="panel">
        <div class="panel-title">Content Queue</div>
        ${state.content.map(c => `
          <div class="content-preview">
            <span class="badge badge-${c.status}">${c.status}</span> ${esc(c.platform)}
            <div class="content-preview-text">${esc((c.text || '').slice(0, 100))}${(c.text || '').length > 100 ? '…' : ''}</div>
            ${c.scheduledFor ? `<div class="content-preview-text">📅 ${c.scheduledFor}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
    ${renderDashboardInbox()}
    ${s.stakeRisk > 0 ? `
      <div class="stakes-bar">⚠️ €${s.stakeRisk.toLocaleString()} at risk — ${s.overdueStakes} task${s.overdueStakes !== 1 ? 's' : ''} overdue</div>
    ` : ''}
  `;
}

// === PIPELINE ===
function renderPipeline() {
  const stages = ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'];
  const el = document.getElementById('pipeline');
  
  el.innerHTML = `<div class="kanban">${stages.map(stage => {
    const leads = state.leads.filter(l => l.stage === stage);
    const total = leads.reduce((s, l) => s + (l.value || 0), 0);
    return `
      <div class="kanban-col">
        <div class="kanban-header">
          <span>${stage}</span>
          <span><span class="kanban-count">${leads.length}</span> · €${total.toLocaleString()}</span>
        </div>
        ${leads.map(l => `
          <div class="lead-card ${staleClass(l)}" onclick="this.classList.toggle('expanded')">
            <div><span class="lead-name">${esc(l.name)}</span></div>
            <div><span class="lead-value">€${(l.value || 0).toLocaleString()}</span></div>
            <div class="lead-meta">${esc(l.source)} ${l.tags?.length ? '· ' + l.tags.join(', ') : ''}</div>
            <div class="lead-detail">
              ${l.company ? `<div>Company: ${esc(l.company)}</div>` : ''}
              ${l.email ? `<div>Email: ${esc(l.email)}</div>` : ''}
              ${l.followUp ? `<div>Follow-up: ${l.followUp}</div>` : ''}
              ${l.score ? `<div>Score: ${l.score}</div>` : ''}
              ${l.touches?.length ? `<div style="margin-top:.5rem"><strong>Touches:</strong>${l.touches.map(t => `<div>• ${t.date?.slice(0, 10)} [${t.type}] ${esc(t.note)}</div>`).join('')}</div>` : '<div>No touches yet</div>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('')}</div>`;
}

// === CONTENT ===
function renderContent() {
  const el = document.getElementById('content');
  const sorted = [...state.content].sort((a, b) => {
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (b.status === 'scheduled' && a.status !== 'scheduled') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  el.innerHTML = `
    <div class="content-table">
      <div class="content-row" style="font-weight:600;color:var(--muted);font-size:.75rem;cursor:default">
        <div>Status</div><div>Platform</div><div>Content</div><div>Created</div><div>Scheduled</div>
      </div>
      ${sorted.map(c => `
        <div class="content-row" onclick="this.classList.toggle('expanded')">
          <div><span class="badge badge-${c.status}">${statusEmoji(c.status)} ${c.status}</span></div>
          <div>${esc(c.platform)}</div>
          <div>${esc((c.text || '').slice(0, 100))}${(c.text || '').length > 100 ? '…' : ''}</div>
          <div style="font-size:.75rem;color:var(--muted)">${c.createdAt?.slice(0, 10) || ''}</div>
          <div style="font-size:.75rem;color:var(--muted)">${c.scheduledFor || '—'}</div>
          <div class="content-full">${esc(c.text)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function statusEmoji(s) {
  return { draft: '🟡', scheduled: '🔵', published: '🟢', failed: '🔴' }[s] || '⚪';
}

// === ACTIVITY ===
function renderActivity() {
  const el = document.getElementById('activity');
  const { activity, patterns } = state.activity;
  const events = activity?.events || [];
  const profile = activity?.profile;

  // Group events by day for last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dayEvents = {};
  days.forEach(d => { dayEvents[d] = []; });
  events.forEach(e => {
    const d = e.ts?.slice(0, 10);
    if (dayEvents[d]) dayEvents[d].push(e);
  });

  const maxHours = 16;
  const bars = days.map(d => {
    const evts = dayEvents[d];
    if (!evts.length) return { day: d, hours: 0 };
    const times = evts.map(e => new Date(e.ts).getHours() + new Date(e.ts).getMinutes() / 60);
    const hours = Math.max(...times) - Math.min(...times) || 1;
    return { day: d, hours: Math.min(hours, maxHours) };
  });

  // Completion patterns
  const dailyComp = patterns?.dailyCompletions || {};
  const compBars = days.map(d => ({ day: d, count: dailyComp[d] || 0 }));
  const maxComp = Math.max(...compBars.map(b => b.count), 1);

  el.innerHTML = `
    <div class="panel" style="margin-bottom:1.5rem">
      <div class="panel-title">Daily Activity (last 14 days)</div>
      <div class="activity-chart">
        ${bars.map(b => `
          <div class="activity-bar-wrap">
            <div class="activity-bar" style="height:${(b.hours / maxHours) * 120}px" title="${b.hours.toFixed(1)}h"></div>
            <div class="activity-label">${b.day.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ${profile ? `
    <div class="profile-stats">
      <div class="stat-card"><div class="stat-label">Avg Wake Time</div><div class="stat-value">${profile.avgWake || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Avg Active Hours</div><div class="stat-value">${profile.avgActiveHours || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Peak Hours</div><div class="stat-value">${profile.peakHours || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Confidence</div><div class="stat-value">${profile.confidence || '—'}%</div></div>
    </div>` : ''}
    <div class="panel" style="margin-top:1.5rem">
      <div class="panel-title">Task Completions (last 14 days)</div>
      <div class="activity-chart">
        ${compBars.map(b => `
          <div class="activity-bar-wrap">
            <div class="activity-bar" style="height:${(b.count / maxComp) * 120}px;background:var(--accent2)" title="${b.count} tasks"></div>
            <div class="activity-label">${b.day.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

const INBOX_TYPE_EMOJI = { social: '📱', inspo: '💡', idea: '💭', general: '📥' };

function inboxPreview(item) {
  return item.title || item.note || item.text || item.url || '(empty)';
}

function renderDashboardInbox() {
  const items = (state.inbox || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  if (!items.length) return '';
  const counts = { social: 0, inspo: 0, idea: 0, general: 0 };
  (state.inbox || []).forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
  const total = state.inbox?.length || 0;
  return `
    <div class="panel" style="margin-top:1.5rem;grid-column:1/-1">
      <div class="panel-title">📥 Inbox <span style="font-weight:400;text-transform:none">${total} items (${counts.social} social, ${counts.inspo} inspo, ${counts.idea} ideas)</span></div>
      <div class="inbox-grid">
        ${items.map(i => `
          <div class="inbox-card">
            <span class="inbox-type-badge">${INBOX_TYPE_EMOJI[i.type] || '📥'}</span>
            ${i.media && i.mediaType?.startsWith('image/') ? `<img class="inbox-thumb" src="/${i.media}" alt="">` : ''}
            <div class="inbox-card-text">${esc(inboxPreview(i).slice(0, 80))}</div>
            <div class="inbox-card-meta">${i.createdAt?.slice(0, 10) || ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderInbox() {
  const el = document.getElementById('inbox');
  const items = (state.inbox || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filtered = inboxFilter === 'all' ? items : items.filter(i => i.type === inboxFilter);

  el.innerHTML = `
    <div class="inbox-filters">
      ${['all', 'social', 'inspo', 'idea', 'general'].map(f => `
        <button class="inbox-filter-btn ${inboxFilter === f ? 'active' : ''}" onclick="inboxFilter='${f}';renderInbox()">
          ${f === 'all' ? 'All' : (INBOX_TYPE_EMOJI[f] || '') + ' ' + f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      `).join('')}
    </div>
    ${filtered.length ? `
      <div class="inbox-full-grid">
        ${filtered.map(i => `
          <div class="inbox-full-card" onclick="this.classList.toggle('expanded')">
            <span class="inbox-type-badge">${INBOX_TYPE_EMOJI[i.type] || '📥'}</span>
            ${i.media && i.mediaType?.startsWith('image/') ? `<img class="inbox-thumb-lg" src="/${i.media}" alt="">` : ''}
            <div class="inbox-card-title">${esc(inboxPreview(i))}</div>
            ${i.note ? `<div class="inbox-card-note">${esc(i.note)}</div>` : ''}
            <div class="inbox-card-meta">${i.createdAt?.slice(0, 10) || ''} ${i.tags?.length ? '· ' + i.tags.join(', ') : ''} ${i.promoted ? '<span class="badge badge-published">promoted</span>' : ''}</div>
            <div class="inbox-detail">
              ${i.text ? `<div style="margin-top:.5rem;white-space:pre-wrap">${esc(i.text)}</div>` : ''}
              ${i.url ? `<div>🔗 <a href="${esc(i.url)}" target="_blank" style="color:var(--accent)">${esc(i.url)}</a></div>` : ''}
              ${i.media ? `<div>📎 ${esc(i.media)}</div>` : ''}
              <div style="margin-top:.5rem;font-size:.7rem;color:var(--muted)">ID: ${i.id} · Source: ${i.source}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div style="color:var(--muted);text-align:center;padding:3rem">No inbox items</div>'}
  `;
}

function renderAgents() {
  const el = document.getElementById('agents');
  const agents = state.agents || {};

  if (!agents.available) {
    el.innerHTML = `
      <div class="panel" style="text-align:center;padding:3rem">
        <div style="font-size:2rem;margin-bottom:1rem">🐜</div>
        <div style="font-size:1.1rem;font-weight:600;margin-bottom:.5rem">Antfarm Not Configured</div>
        <div style="color:var(--muted)">Set up Antfarm to enable multi-agent workflows</div>
      </div>
    `;
    return;
  }

  const statusBadge = s => {
    const map = { running: '🟢', waiting: '🟡', idle: '⚪', completed: '✅', failed: '🔴' };
    return (map[s] || '⚪') + ' ' + (s || 'unknown');
  };

  const workflows = agents.workflows || [];

  el.innerHTML = `
    <div class="panel" style="margin-bottom:1rem">
      <div style="color:var(--accent);font-weight:600">✅ Antfarm Connected</div>
    </div>
    <div class="panel">
      <div class="panel-title">Workflows</div>
      ${workflows.length ? workflows.map(w => `
        <div class="agent-card">
          <div class="agent-name">${esc(w.name || w.id || 'Workflow')}</div>
          <div class="agent-status">${statusBadge(w.status)}</div>
          ${w.task ? `<div class="agent-task">${esc(w.task)}</div>` : ''}
          ${w.step ? `<div class="agent-meta">Step: ${esc(w.step)}</div>` : ''}
          ${w.startedAt ? `<div class="agent-meta">Started: ${w.startedAt}</div>` : ''}
        </div>
      `).join('') : '<div style="color:var(--muted)">No active workflows</div>'}
    </div>
    ${agents.logs ? `
      <div class="panel" style="margin-top:1rem">
        <div class="panel-title">Recent Logs</div>
        <pre style="font-size:.75rem;color:var(--muted);white-space:pre-wrap;max-height:300px;overflow-y:auto">${esc(agents.logs)}</pre>
      </div>
    ` : ''}
  `;
}

// Init
fetchAll();
setInterval(fetchAll, 30000);
