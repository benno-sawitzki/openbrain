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
  renderTasks();
  renderPipeline();
  renderContent();
  renderInbox();
  renderAgents();
  renderActivity();
  renderHelp();
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
  
  const sortedTasks = [...state.tasks];

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
        <div class="section-header"><div class="panel-title">Today's Tasks</div><span class="powered-by">⚡ taskpipe</span></div>
        ${sortedTasks.slice(0, 3).map((t, i) => `
          <div class="task-card dash-task-card energy-${t.energy || 'medium'} ${t.status === 'done' ? 'done' : ''}" draggable="true" data-task-id="${t.id}">
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
        ${sortedTasks.length > 3 ? `
          <div id="dash-tasks-more" style="display:none">
            ${sortedTasks.slice(3).map((t, i) => `
              <div class="task-card dash-task-card energy-${t.energy || 'medium'} ${t.status === 'done' ? 'done' : ''}" draggable="true" data-task-id="${t.id}">
                <div class="task-title">${t.status === 'done' ? '✅ ' : ''}${esc(t.content)}</div>
                <div class="task-meta">
                  <span>${energyEmoji(t.energy)} ${t.energy || 'medium'}</span>
                  ${t.estimate ? `<span>${t.estimate}m</span>` : ''}
                  ${t.due ? `<span>📅 ${t.due}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <button class="show-more-btn" onclick="const m=document.getElementById('dash-tasks-more');const v=m.style.display==='none';m.style.display=v?'block':'none';this.textContent=v?'Show less ↑':'+ ${sortedTasks.length - 3} more tasks'">+ ${sortedTasks.length - 3} more tasks</button>
        ` : ''}
      </div>
      <div class="panel">
        <div class="section-header"><div class="panel-title">Pipeline Overview</div><span class="powered-by">🎯 leadpipe</span></div>
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
        <div class="section-header"><div class="panel-title">Content Queue</div><span class="powered-by">📝 contentq</span></div>
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

  // Dashboard drag-to-reorder
  let dragSrcId = null;
  el.querySelectorAll('.dash-task-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrcId = card.dataset.taskId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSrcId);
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      el.querySelectorAll('.dash-task-card').forEach(c => {
        c.classList.remove('drag-insert-above', 'drag-insert-below');
      });
      dragSrcId = null;
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card.dataset.taskId === dragSrcId) return;
      el.querySelectorAll('.dash-task-card').forEach(c => {
        c.classList.remove('drag-insert-above', 'drag-insert-below');
      });
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        card.classList.add('drag-insert-above');
      } else {
        card.classList.add('drag-insert-below');
      }
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-insert-above', 'drag-insert-below');
    });
    card.addEventListener('drop', async e => {
      e.preventDefault();
      card.classList.remove('drag-insert-above', 'drag-insert-below');
      const srcId = e.dataTransfer.getData('text/plain');
      const targetId = card.dataset.taskId;
      if (srcId === targetId) return;

      // Build new order
      const ids = sortedTasks.map(t => t.id);
      const srcIdx = ids.indexOf(srcId);
      if (srcIdx === -1) return;
      ids.splice(srcIdx, 1);
      let targetIdx = ids.indexOf(targetId);
      const rect = card.getBoundingClientRect();
      if (e.clientY >= rect.top + rect.height / 2) targetIdx++;
      ids.splice(targetIdx, 0, srcId);

      // Reorder state locally
      const taskMap = new Map(state.tasks.map(t => [t.id, t]));
      const reordered = ids.map(id => taskMap.get(id)).filter(Boolean);
      for (const t of taskMap.values()) {
        if (!ids.includes(t.id)) reordered.push(t);
      }
      state.tasks = reordered;
      render();

      try {
        await fetch('/api/tasks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: reordered.map(t => t.id) })
        });
        showToast('✅ Tasks reordered');
      } catch {
        showToast('❌ Failed to save order');
      }
    });
  });
}

// === TASKS ===
const TASK_STATUSES = [
  { key: 'todo', label: 'To Do' },
  { key: 'doing', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
];

const energyColor = e => ({ high: '#ef4444', medium: '#eab308', low: '#22c55e' }[e] || '#eab308');

async function moveTask(taskId, newStatus) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  if (!res.ok) throw new Error('Move failed');
  return res.json();
}

async function deleteTask(taskId, taskName) {
  // no confirmation, just delete
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  if (res.ok) {
    showToast(`🗑️ Deleted: ${taskName}`);
    await fetchAll();
  }
}

function renderTasks() {
  const el = document.getElementById('tasks');
  const todayStr = today();
  let firstTodo = true;

  el.innerHTML = `
    <div class="section-header"><h2 style="margin:0">Tasks</h2><span class="powered-by">⚡ taskpipe</span></div>
    <div class="kanban">${TASK_STATUSES.map(({ key, label }) => {
      const tasks = state.tasks.filter(t => t.status === key);
      return `
        <div class="kanban-col task-column" data-status="${key}">
          <div class="kanban-header">
            <span>${label}</span>
            <span class="kanban-count">${tasks.length}</span>
          </div>
          ${tasks.map(t => {
            const isNow = key === 'todo' && firstTodo;
            if (key === 'todo' && firstTodo) firstTodo = false;
            const overdue = t.due && t.due < todayStr && key !== 'done';
            return `
              <div class="task-card energy-${t.energy || 'medium'}" draggable="true" data-task-id="${t.id}" onclick="if(!this._wasDragged)this.classList.toggle('expanded')">
                <div class="task-title">
                  ${isNow ? '<span class="badge badge-now">NOW</span> ' : ''}
                  ${energyEmoji(t.energy)} ${esc(t.content)}
                </div>
                <div class="task-meta">
                  ${t.estimate ? `<span>${t.estimate}m</span>` : ''}
                  ${t.due ? `<span style="${overdue ? 'color:var(--red)' : ''}">📅 ${t.due}</span>` : ''}
                  ${t.campaign ? `<span class="badge badge-scheduled">${esc(t.campaign)}</span>` : ''}
                  ${t.stake ? '<span>💰</span>' : ''}
                  ${(t.tags || []).map(tag => `<span class="badge" style="background:rgba(255,255,255,.08);color:var(--muted)">${esc(tag)}</span>`).join('')}
                </div>
                <div class="task-detail">
                  ${t.stake ? `<div><strong>💰 Stake:</strong> ${esc(t.stake)}</div>` : ''}
                  ${t.campaign ? `<div><strong>Campaign:</strong> ${esc(t.campaign)}</div>` : ''}
                  ${t.energy ? `<div><strong>Energy:</strong> ${t.energy}</div>` : ''}
                  ${t.estimate ? `<div><strong>Estimate:</strong> ${t.estimate}m${t.actual ? ` (actual: ${t.actual}m)` : ''}</div>` : ''}
                  ${t.difficulty ? `<div><strong>Difficulty:</strong> ${t.difficulty}</div>` : ''}
                  ${t.due ? `<div><strong>Due:</strong> ${t.due}</div>` : ''}
                  ${Object.keys(t.links || {}).length ? `<div><strong>Links:</strong> ${Object.entries(t.links).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>` : ''}
                  ${t.tags?.length ? `<div><strong>Tags:</strong> ${t.tags.join(', ')}</div>` : ''}
                  ${t.delegatedTo ? `<div><strong>Delegated to:</strong> ${esc(t.delegatedTo)}</div>` : ''}
                  ${t.reminders?.length ? `<div><strong>Reminders:</strong> ${t.reminders.map(r => r.at?.slice(0, 16)).join(', ')}</div>` : ''}
                  ${t.notes?.length ? `<div style="margin-top:.5rem"><strong>Notes:</strong>${t.notes.map(n => `<div>• ${esc(n)}</div>`).join('')}</div>` : ''}
                  <div style="margin-top:.5rem;color:var(--muted);font-size:.7rem">
                    Created: ${t.createdAt?.slice(0, 10)} · Updated: ${t.updatedAt?.slice(0, 10)}
                    ${t.completedAt ? ` · Completed: ${t.completedAt.slice(0, 10)}` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
                  <div class="task-mobile-move lead-mobile-move" style="flex:1">
                    <select class="move-select" onchange="handleMobileTaskMove(this, '${t.id}', '${esc(t.content).replace(/'/g, "\\'")}')">
                      <option value="">Move to…</option>
                      ${TASK_STATUSES.filter(s => s.key !== key).map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
                    </select>
                  </div>
                  <button class="delete-task-btn" onclick="deleteTask('${t.id}', '${esc(t.content).replace(/'/g, "\\'")}')" title="Delete task">🗑️</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}</div>
  `;

  // Drag events
  el.querySelectorAll('.task-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.taskId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      el.querySelectorAll('.task-column.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
  });

  el.querySelectorAll('.task-column').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task || task.status === newStatus) return;
      try {
        const updated = await moveTask(taskId, newStatus);
        task.status = updated.status;
        task.updatedAt = updated.updatedAt;
        const label = TASK_STATUSES.find(s => s.key === newStatus)?.label || newStatus;
        showToast(`✅ Task moved to ${label}`);
        render();
      } catch (err) {
        showToast('❌ Failed to move task');
      }
    });
  });
}

async function handleMobileTaskMove(select, taskId, taskName) {
  const newStatus = select.value;
  if (!newStatus) return;
  select.value = '';
  try {
    const updated = await moveTask(taskId, newStatus);
    const task = state.tasks.find(t => t.id === taskId);
    if (task) { task.status = updated.status; task.updatedAt = updated.updatedAt; }
    const label = TASK_STATUSES.find(s => s.key === newStatus)?.label || newStatus;
    showToast(`✅ Task moved to ${label}`);
    render();
  } catch (err) {
    showToast('❌ Failed to move task');
  }
}

// === PIPELINE ===
const PIPELINE_STAGES = ['cold', 'warm', 'hot', 'proposal', 'won', 'lost'];

function showToast(msg) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

async function moveLead(leadId, newStage) {
  const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: newStage })
  });
  if (!res.ok) throw new Error('Move failed');
  return res.json();
}

function renderPipeline() {
  const el = document.getElementById('pipeline');
  
  el.innerHTML = `<div class="section-header"><h2 style="margin:0 0 12px">Pipeline</h2><span class="powered-by">🎯 leadpipe</span></div><div class="kanban">${PIPELINE_STAGES.map(stage => {
    const leads = state.leads.filter(l => l.stage === stage);
    const total = leads.reduce((s, l) => s + (l.value || 0), 0);
    return `
      <div class="kanban-col pipeline-column" data-stage="${stage}">
        <div class="kanban-header">
          <span>${stage}</span>
          <span><span class="kanban-count">${leads.length}</span> · €${total.toLocaleString()}</span>
        </div>
        ${leads.map(l => `
          <div class="lead-card ${staleClass(l)}" draggable="true" data-lead-id="${l.id}" onclick="if(!this._wasDragged)this.classList.toggle('expanded')">
            <div><span class="lead-name">${esc(l.name)}</span></div>
            <div><span class="lead-value">€${(l.value || 0).toLocaleString()}</span></div>
            <div class="lead-meta">${esc(l.source)} ${l.tags?.length ? '· ' + l.tags.join(', ') : ''}</div>
            <div class="lead-mobile-move">
              <select class="move-select" onchange="handleMobileMove(this, '${l.id}', '${esc(l.name)}')" onclick="event.stopPropagation()">
                <option value="">Move to…</option>
                ${PIPELINE_STAGES.filter(s => s !== stage).map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
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

  // Attach drag events
  el.querySelectorAll('.lead-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      card._wasDragged = false;
      e.dataTransfer.setData('text/plain', card.dataset.leadId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      el.querySelectorAll('.pipeline-column.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
  });

  el.querySelectorAll('.pipeline-column').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      const newStage = col.dataset.stage;
      const lead = state.leads.find(l => l.id === leadId);
      if (!lead || lead.stage === newStage) return;
      try {
        const updated = await moveLead(leadId, newStage);
        lead.stage = updated.stage;
        lead.updatedAt = updated.updatedAt;
        showToast(`✅ ${lead.name} moved to ${newStage}`);
        render();
      } catch (err) {
        showToast(`❌ Failed to move lead`);
      }
    });
  });
}

async function handleMobileMove(select, leadId, leadName) {
  const newStage = select.value;
  if (!newStage) return;
  select.value = '';
  try {
    const updated = await moveLead(leadId, newStage);
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) { lead.stage = updated.stage; lead.updatedAt = updated.updatedAt; }
    showToast(`✅ ${leadName} moved to ${newStage}`);
    render();
  } catch (err) {
    showToast(`❌ Failed to move lead`);
  }
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
    <div class="section-header"><h2 style="margin:0 0 12px">Content Queue</h2><span class="powered-by">📝 contentq</span></div>
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
      <div class="section-header"><div class="panel-title">Daily Activity (last 14 days)</div><span class="powered-by">📊 taskpipe</span></div>
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
    <div class="section-header"><h2 style="margin:0 0 12px">Inbox</h2><span class="powered-by">📝 contentq</span></div>
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
      <div class="section-header"><div class="panel-title">Workflows</div><span class="powered-by">🐜 antfarm</span></div>
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

// === HELP / KNOWLEDGE BASE ===
const HELP_SECTIONS = [
  {
    title: '🚀 Quick Start',
    content: [
      { type: 'text', text: 'Your daily routine — just 3 commands:' },
      { type: 'cmd', cmd: 'taskpipe briefing', desc: 'full day overview' },
      { type: 'cmd', cmd: 'taskpipe now', desc: 'the one thing to do next' },
      { type: 'cmd', cmd: 'taskpipe wins', desc: 'celebrate what you did' },
      { type: 'text', text: 'Dashboard: <a href="http://192.168.178.22:4000" style="color:var(--accent)">http://192.168.178.22:4000</a>' },
      { type: 'text', text: 'Everything lives in <code class="help-cmd">~/clawd/marketing/</code>' },
    ]
  },
  {
    title: '💬 WhatsApp Triggers (say these to A.M.A.)',
    content: [
      { type: 'item', text: 'Send screenshot + "save for social" → saves to content inbox (social)' },
      { type: 'item', text: 'Send image + "inspo" or "save for inspo" → saves to inspiration folder' },
      { type: 'item', text: 'Send text/voice + "save idea" → idea saved' },
      { type: 'item', text: 'Send anything + "save for later" → general inbox' },
      { type: 'item', text: '"add task: [description]" → creates task' },
      { type: 'item', text: '"add lead: [name]" → creates lead' },
      { type: 'item', text: '"post this to LinkedIn" → queues content' },
    ]
  },
  {
    title: '✅ Task Management (taskpipe)',
    content: [
      { type: 'cmd', cmd: 'taskpipe add "task description"', desc: 'add a task' },
      { type: 'cmd', cmd: 'taskpipe add "task" --due tomorrow --energy high --estimate 30', desc: 'with details' },
      { type: 'cmd', cmd: 'taskpipe list', desc: 'all open tasks' },
      { type: 'cmd', cmd: 'taskpipe list --today', desc: 'due today' },
      { type: 'cmd', cmd: 'taskpipe done <id>', desc: 'mark complete' },
      { type: 'cmd', cmd: 'taskpipe done <id> --time 20 --difficulty easy', desc: 'with tracking' },
      { type: 'cmd', cmd: 'taskpipe edit <id> --due friday --priority high', desc: 'edit task' },
      { type: 'cmd', cmd: 'taskpipe delete <id>', desc: 'remove task' },
      { type: 'cmd', cmd: 'taskpipe now', desc: 'what to do next' },
      { type: 'cmd', cmd: 'taskpipe quick', desc: 'tasks under 15 min' },
      { type: 'cmd', cmd: 'taskpipe stuck', desc: 'tasks you\'ve been avoiding' },
      { type: 'cmd', cmd: 'taskpipe plan --2h', desc: 'plan next 2 hours' },
      { type: 'cmd', cmd: 'taskpipe plan --calendar', desc: 'plan around meetings' },
      { type: 'cmd', cmd: 'taskpipe focus "project name"', desc: 'lock in' },
      { type: 'cmd', cmd: 'taskpipe unfocus', desc: 'back to everything' },
      { type: 'cmd', cmd: 'taskpipe streak', desc: 'your streak' },
      { type: 'cmd', cmd: 'taskpipe stakes', desc: 'what\'s at risk' },
      { type: 'cmd', cmd: 'taskpipe remind <id> "tomorrow 9am"', desc: 'set reminder' },
      { type: 'cmd', cmd: 'taskpipe reminders', desc: 'upcoming reminders' },
      { type: 'cmd', cmd: 'taskpipe ghost', desc: 'auto-suggested tasks' },
      { type: 'cmd', cmd: 'taskpipe review', desc: 'weekly review' },
      { type: 'cmd', cmd: 'taskpipe briefing', desc: 'morning briefing' },
      { type: 'cmd', cmd: 'taskpipe setup', desc: 'configure notifications' },
      { type: 'cmd', cmd: 'taskpipe activity status', desc: 'your rhythm profile' },
    ]
  },
  {
    title: '🎯 Lead Management (leadpipe)',
    content: [
      { type: 'cmd', cmd: 'leadpipe add "Name" --email x --source linkedin --value 3500', desc: 'add lead' },
      { type: 'cmd', cmd: 'leadpipe list', desc: 'all leads' },
      { type: 'cmd', cmd: 'leadpipe list --stage hot', desc: 'filter by stage' },
      { type: 'cmd', cmd: 'leadpipe move <id> --stage hot', desc: 'change stage' },
      { type: 'cmd', cmd: 'leadpipe touch <id> "Had intro call" --type call', desc: 'log interaction' },
      { type: 'cmd', cmd: 'leadpipe follow-up <id> "2026-02-20"', desc: 'set follow-up' },
      { type: 'cmd', cmd: 'leadpipe due', desc: 'who needs attention today' },
      { type: 'cmd', cmd: 'leadpipe stale', desc: 'forgotten leads (7+ days)' },
      { type: 'cmd', cmd: 'leadpipe context <id>', desc: 'everything about one lead' },
      { type: 'cmd', cmd: 'leadpipe stats', desc: 'pipeline overview' },
      { type: 'cmd', cmd: 'leadpipe funnel', desc: 'conversion rates' },
      { type: 'cmd', cmd: 'leadpipe score <id> --add 20 --reason "replied"', desc: 'adjust score' },
      { type: 'cmd', cmd: 'leadpipe search "query"', desc: 'search leads' },
      { type: 'cmd', cmd: 'leadpipe export --csv', desc: 'export data' },
      { type: 'text', text: 'Pipeline stages: <code class="help-cmd">cold → warm → hot → proposal → won → lost</code>' },
    ]
  },
  {
    title: '📝 Content Queue (contentq)',
    content: [
      { type: 'cmd', cmd: 'contentq add "post text here"', desc: 'add to queue' },
      { type: 'cmd', cmd: 'contentq add --from draft.md', desc: 'from file' },
      { type: 'cmd', cmd: 'contentq list', desc: 'all queued content' },
      { type: 'cmd', cmd: 'contentq show <id>', desc: 'view details' },
      { type: 'cmd', cmd: 'contentq edit <id> "new text"', desc: 'edit' },
      { type: 'cmd', cmd: 'contentq schedule <id> "2026-02-17 09:00"', desc: 'schedule' },
      { type: 'cmd', cmd: 'contentq publish <id>', desc: 'publish now (via Late API)' },
      { type: 'cmd', cmd: 'contentq inbox', desc: 'browse saved media/ideas' },
      { type: 'cmd', cmd: 'contentq inbox --social', desc: 'social screenshots' },
      { type: 'cmd', cmd: 'contentq inbox --inspo', desc: 'inspiration' },
      { type: 'cmd', cmd: 'contentq inbox --ideas', desc: 'text ideas' },
      { type: 'cmd', cmd: 'contentq inbox promote <id>', desc: 'move to queue as draft' },
      { type: 'cmd', cmd: 'contentq stats', desc: 'overview' },
      { type: 'cmd', cmd: 'contentq platforms', desc: 'configured platforms' },
    ]
  },
  {
    title: '🏗️ Architecture',
    content: [
      { type: 'item', text: 'CLI tools are the engine, dashboard is the display' },
      { type: 'item', text: 'All data is local JSON files in <code class="help-cmd">~/clawd/marketing/</code>' },
      { type: 'item', text: '<code class="help-cmd">.taskpipe/</code> — tasks, activity, patterns' },
      { type: 'item', text: '<code class="help-cmd">.leadpipe/</code> — leads, pipeline' },
      { type: 'item', text: '<code class="help-cmd">.contentq/</code> — content queue, inbox' },
      { type: 'item', text: 'Dashboard reads the same files CLI tools write' },
      { type: 'item', text: 'Drag-and-drop in dashboard writes back to files' },
      { type: 'item', text: 'Agent (A.M.A.) orchestrates via CLI commands' },
      { type: 'item', text: 'Antfarm runs multi-agent workflows' },
    ]
  },
  {
    title: '⚡ Proactive Check-ins',
    content: [
      { type: 'item', text: '☀️ 9:00am — Morning briefing' },
      { type: 'item', text: '🔥 12:30pm — Midday pulse' },
      { type: 'item', text: '🏁 6:00pm — End of day wrap' },
      { type: 'item', text: 'Smart nudges: streak protection, stale tasks, overdue leads' },
      { type: 'item', text: 'Schedule adapts to your rhythm over time' },
    ]
  },
  {
    title: '🔧 System Info',
    content: [
      { type: 'item', text: 'Dashboard: <a href="http://192.168.178.22:4000" style="color:var(--accent)">http://192.168.178.22:4000</a> (port 4000)' },
      { type: 'item', text: 'Data: <code class="help-cmd">~/clawd/marketing/</code>' },
      { type: 'item', text: 'Tools: <code class="help-cmd">~/clawd/tools/</code> (contentq, leadpipe, taskpipe, marketing-hq)' },
      { type: 'item', text: 'GitHub: benno-sawitzki/contentq, /leadpipe, /taskpipe, /marketing-hq' },
      { type: 'item', text: 'Powered by: OpenClaw + A.M.A. (Ghost in the Machine 👻⚡)' },
    ]
  },
];

function renderHelp() {
  const el = document.getElementById('help');
  el.innerHTML = `
    <div class="section-header"><h2 style="margin:0">📚 Knowledge Base</h2><span class="powered-by">👻⚡ A.M.A.</span></div>
    <input type="text" class="help-search" placeholder="Search commands, triggers, anything..." id="help-search-input">
    <div id="help-sections">
      ${HELP_SECTIONS.map((section, i) => `
        <div class="help-section" data-section="${i}">
          <div class="help-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>${section.title}</span>
            <span class="help-chevron">▼</span>
          </div>
          <div class="help-body">
            ${section.content.map(item => {
              if (item.type === 'cmd') {
                return `<div class="help-entry"><code class="help-cmd">${item.cmd}</code> <span class="help-desc">— ${item.desc}</span></div>`;
              } else if (item.type === 'item') {
                return `<div class="help-entry help-item">${item.text}</div>`;
              } else {
                return `<div class="help-entry help-text">${item.text}</div>`;
              }
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="help-footer">powered by Agent Smith 👻⚡</div>
  `;

  document.getElementById('help-search-input').addEventListener('keyup', function() {
    const query = this.value.toLowerCase().trim();
    document.querySelectorAll('.help-section').forEach(section => {
      if (!query) {
        section.style.display = '';
        section.classList.remove('collapsed');
        section.querySelectorAll('.help-highlight').forEach(h => {
          h.outerHTML = h.textContent;
        });
        return;
      }
      const text = section.textContent.toLowerCase();
      if (text.includes(query)) {
        section.style.display = '';
        section.classList.remove('collapsed');
        // Highlight matches in entries
        section.querySelectorAll('.help-entry').forEach(entry => {
          const entryText = entry.textContent.toLowerCase();
          if (entryText.includes(query)) {
            entry.style.display = '';
          } else {
            entry.style.display = 'none';
          }
        });
      } else {
        section.style.display = 'none';
      }
    });
  });
}

// Init
fetchAll();
setInterval(fetchAll, 30000);
