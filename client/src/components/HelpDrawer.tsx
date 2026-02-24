import { palette, blackAlpha } from '../theme';

const sections = [
  {
    title: 'Quick Start',
    icon: '\u25C8',
    color: palette.accent,
    items: [
      { cmd: 'taskpipe add "task name"', desc: 'Add a task' },
      { cmd: 'leadpipe add "Name" --email x@y.com', desc: 'Add a lead' },
      { cmd: 'contentq draft "post text"', desc: 'Draft content' },
      { cmd: 'taskpipe briefing', desc: 'Morning briefing' },
    ],
  },
  {
    title: 'WhatsApp Triggers',
    icon: '\u25C6',
    color: palette.subtle,
    items: [
      { cmd: '"save for social" + message', desc: 'Save to social inbox folder' },
      { cmd: '"inspo" + message', desc: 'Save to inspo folder' },
      { cmd: '"save idea" + message', desc: 'Save to ideas folder' },
      { cmd: 'Any message to A.M.A.', desc: 'Logged as activity for adaptive timing' },
    ],
  },
  {
    title: 'Task Management',
    icon: '\u25A3',
    color: palette.accent,
    items: [
      { cmd: 'taskpipe add "task" --due tomorrow --energy high --estimate 30', desc: 'Add with details' },
      { cmd: 'taskpipe list --today', desc: "Today's tasks" },
      { cmd: 'taskpipe start <id>', desc: 'Start working' },
      { cmd: 'taskpipe done <id>', desc: 'Complete task' },
      { cmd: 'taskpipe edit <id> --due friday', desc: 'Edit task' },
      { cmd: 'taskpipe remind <id> --at "3pm"', desc: 'Set reminder' },
      { cmd: 'taskpipe wins', desc: 'See completed tasks' },
      { cmd: 'taskpipe streak', desc: 'Productivity streak' },
      { cmd: 'taskpipe briefing', desc: 'Full morning briefing' },
      { cmd: 'taskpipe cal today', desc: 'Google Calendar events' },
      { cmd: 'taskpipe setup', desc: 'Setup wizard (notifications, cron)' },
    ],
  },
  {
    title: 'Lead Management',
    icon: '\u25C9',
    color: palette.muted,
    items: [
      { cmd: 'leadpipe add "Name" --email x --value 5000 --stage warm', desc: 'Add lead' },
      { cmd: 'leadpipe list', desc: 'All leads' },
      { cmd: 'leadpipe touch <id> --type call --note "discussed pricing"', desc: 'Log touch' },
      { cmd: 'leadpipe move <id> hot', desc: 'Change stage' },
      { cmd: 'leadpipe due', desc: 'Overdue follow-ups' },
      { cmd: 'leadpipe stale', desc: 'Stale leads (no recent contact)' },
      { cmd: 'leadpipe score <id>', desc: 'View/update lead score' },
      { cmd: 'leadpipe pipeline revenue', desc: 'Pipeline by stage with revenue' },
      { cmd: 'leadpipe import contacts.csv', desc: 'Import from CSV' },
      { cmd: 'leadpipe export --format csv', desc: 'Export to CSV' },
    ],
  },
  {
    title: 'Content Queue',
    icon: '\u2756',
    color: palette.muted,
    items: [
      { cmd: 'contentq draft "post text"', desc: 'Create draft' },
      { cmd: 'contentq list', desc: 'All content' },
      { cmd: 'contentq schedule <id> --date 2026-02-20', desc: 'Schedule post' },
      { cmd: 'contentq publish <id>', desc: 'Publish to platform' },
      { cmd: 'contentq inbox', desc: 'View saved content inbox' },
      { cmd: 'contentq platforms', desc: 'Configured platforms' },
    ],
  },
  {
    title: 'Architecture',
    icon: '\u2B21',
    color: palette.muted,
    items: [
      { cmd: '~/.taskpipe/', desc: 'Task data (JSON)' },
      { cmd: '~/.leadpipe/', desc: 'Lead data (JSON)' },
      { cmd: '~/.contentq/', desc: 'Content data (JSON)' },
      { cmd: 'All tools use --json flag', desc: 'Machine-readable output' },
      { cmd: 'Pipe between tools', desc: 'Unix philosophy: small tools, compose freely' },
    ],
  },
  {
    title: 'Proactive Check-ins',
    icon: '\u27F3',
    color: palette.subtle,
    items: [
      { cmd: '9:00 AM', desc: 'Morning briefing \u2014 tasks, calendar, plan' },
      { cmd: '12:30 PM', desc: 'Midday pulse \u2014 progress + nudge' },
      { cmd: '6:00 PM', desc: 'End of day \u2014 wins, streak, tomorrow preview' },
      { cmd: 'Smart triggers', desc: 'Streak protection, stale tasks, overdue leads' },
    ],
  },
  {
    title: 'System Info',
    icon: '\u25EB',
    color: palette.muted,
    items: [
      { cmd: 'Port 4000', desc: 'This dashboard (Open Brain)' },
      { cmd: 'Port 3333', desc: 'OpenClaw Logdash' },
      { cmd: 'Port 9999', desc: 'Voice Indicator' },
      { cmd: '~/clawd/marketing/', desc: 'All marketing data' },
      { cmd: '~/clawd/tools/', desc: 'All CLI tools' },
    ],
  },
];

const syncSetup = {
  title: 'Connect Your Local Agent',
  icon: '\u26A1',
  color: '#22C55E',
  steps: [
    { step: '1', text: 'Copy your API key from Settings > API Key' },
    { step: '2', text: 'Open Terminal on your Mac and run:' },
    { step: '3', text: 'The sync agent starts automatically and runs in the background' },
  ],
  command: 'curl -fsSL https://openbrain.space/install.sh | bash',
  details: [
    { label: 'What it does', text: 'Watches your local OpenClaw files and pushes changes to the cloud every 60 seconds' },
    { label: 'Requirements', text: 'macOS with Node.js installed' },
    { label: 'Check status', cmd: 'launchctl list | grep openbrain' },
    { label: 'View logs', cmd: 'tail -f /tmp/openbrain-sync.log' },
    { label: 'Uninstall', cmd: 'launchctl unload ~/Library/LaunchAgents/com.openbrain.sync.plist && rm -rf ~/.openbrain ~/Library/LaunchAgents/com.openbrain.sync.plist' },
  ],
};

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-border/50"
        style={{
          background: `linear-gradient(180deg, ${palette.black} 0%, ${palette.dark} 100%)`,
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border/50"
          style={{ background: blackAlpha(0.95), backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight">Help & Commands</h2>
            <span className="text-[10px] text-muted-foreground font-mono tracking-wider">knowledge base</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {sections.map(section => (
            <div key={section.title} className="glass-card rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 tracking-wide flex items-center gap-2">
                <span className="w-1 h-4 rounded-full" style={{ background: section.color }} />
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex gap-4 text-sm items-start py-1">
                    <code className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] font-mono shrink-0" style={{ color: palette.accent }}>
                      {item.cmd}
                    </code>
                    <span className="text-muted-foreground text-xs leading-relaxed pt-0.5">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* ── Connect Your Local Agent ── */}
          <div className="glass-card rounded-xl p-5 mt-2" style={{ border: `1px solid ${syncSetup.color}33` }}>
            <h3 className="text-sm font-semibold mb-4 tracking-wide flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: syncSetup.color }} />
              {syncSetup.title}
            </h3>

            <div className="space-y-3 mb-4">
              {syncSetup.steps.map((s, i) => (
                <div key={i} className="flex gap-3 text-sm items-start">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: `${syncSetup.color}22`, color: syncSetup.color }}>
                    {s.step}
                  </span>
                  <span className="text-muted-foreground text-xs leading-relaxed pt-0.5">{s.text}</span>
                </div>
              ))}
            </div>

            {/* Install command */}
            <div className="relative group">
              <code className="block text-xs px-4 py-3 rounded-lg bg-white/[0.06] font-mono break-all" style={{ color: syncSetup.color }}>
                {syncSetup.command}
              </code>
              <button
                className="absolute top-1.5 right-1.5 text-[10px] px-2 py-1 rounded bg-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.12] transition-all opacity-0 group-hover:opacity-100"
                onClick={() => { navigator.clipboard.writeText(syncSetup.command); }}
              >
                copy
              </button>
            </div>

            {/* Details */}
            <div className="mt-4 space-y-2">
              {syncSetup.details.map((d, i) => (
                <div key={i} className="text-xs">
                  <span className="text-muted-foreground">{d.label}: </span>
                  {d.cmd
                    ? <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/[0.04]" style={{ color: palette.accent }}>{d.cmd}</code>
                    : <span className="text-foreground/70">{d.text}</span>
                  }
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-10 font-mono">{'\u{1F9E0}'} Open Brain \u2014 powered by OpenClaw {'\u{1F47B}\u26A1'}</p>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
