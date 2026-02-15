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

// Init
fetchAll();
setInterval(fetchAll, 30000);
