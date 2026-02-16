import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { fetchAll, fetchModules, slotActive } from './api';
import type { Modules } from './api';
import type { AppState } from './types';
import { DashboardTab } from './tabs/Dashboard';
import { TasksTab } from './tabs/Tasks';
import { PipelineTab } from './tabs/Pipeline';
import { ContentTab } from './tabs/Content';
import { BrainTab } from './tabs/Brain';
import { FeedTab } from './tabs/Feed';
import { CalendarTab } from './tabs/Calendar';
import { WorkflowsTab } from './tabs/Workflows';
import { SystemTab } from './tabs/System';
import { SettingsTab } from './tabs/Settings';
import { HelpDrawer } from './components/HelpDrawer';
import { LoginPage } from './pages/Login';
import { LandingPage } from './pages/Landing';
import { ConnectPage } from './pages/Connect';
import { useAuth } from './hooks/useAuth';
import { palette, colors, accentAlpha } from './theme';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\u25C8' },
  { id: 'tasks', label: 'Tasks', icon: '\u25A3' },
  { id: 'pipeline', label: 'Pipeline', icon: '\u25C9' },
  { id: 'content', label: 'Content', icon: '\u2756' },
  { id: 'calendar', label: 'Calendar', icon: '\u25A6' },
  { id: 'workflows', label: 'Workflows', icon: '\u2699' },
  { id: 'brain', label: 'Brain', icon: '\u2B21' },
  { id: 'feed', label: 'Feed', icon: '\u25CE' },
  { id: 'system', label: 'System', icon: '\u2661' },
  { id: 'settings', label: 'Settings', icon: '\u2318' },
] as const;

const emptyState: AppState = {
  tasks: [], leads: [], content: [], inbox: [],
  activity: {}, stats: {}, config: {}, agents: {},
};

// Which slot (if any) each tab requires to be visible
const TAB_REQUIRES: Partial<Record<string, 'tasks' | 'crm' | 'content' | '_any'>> = {
  tasks: 'tasks',
  pipeline: 'crm',
  content: 'content',
  feed: '_any', // shown when at least one module is active
};

export default function App() {
  const auth = useAuth();

  type TabId = typeof TABS[number]['id'];
  const [modules, setModules] = useState<Modules>({});

  const visibleTabs = useMemo(() => {
    const hasAny = slotActive(modules, 'tasks') || slotActive(modules, 'crm') || slotActive(modules, 'content');
    return TABS.filter(t => {
      const req = TAB_REQUIRES[t.id];
      if (!req) return true; // always shown
      if (req === '_any') return hasAny;
      return slotActive(modules, req);
    });
  }, [modules]);

  const getTabFromHash = useCallback((): TabId => {
    const hash = window.location.hash.replace('#', '');
    const found = visibleTabs.find(t => t.id === hash);
    return (found?.id || 'dashboard') as TabId;
  }, [visibleTabs]);

  const [tab, setTabState] = useState<TabId>(getTabFromHash);
  const setTab = (id: TabId) => {
    window.location.hash = id;
    setTabState(id);
  };

  // Redirect to dashboard if current tab becomes hidden
  useEffect(() => {
    if (!visibleTabs.find(t => t.id === tab)) {
      setTab('dashboard');
    }
  }, [visibleTabs, tab]);

  useEffect(() => {
    const onHash = () => setTabState(getTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [getTabFromHash]);
  const [state, setState] = useState<AppState>(emptyState);
  const [helpOpen, setHelpOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Use a ref so refresh() always reads current modules without depending on them
  const modulesRef = useRef(modules);
  modulesRef.current = modules;

  const refresh = useCallback(async (mods?: Modules) => {
    try {
      const data = await fetchAll(mods ?? modulesRef.current);
      setState(data);
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.isCloudMode && !auth.user) return;
    if (auth.isCloudMode && !auth.workspace?.gateway_url) return;
    // Fetch modules first, then data
    fetchModules().then(mods => {
      setModules(mods);
      return refresh(mods);
    }).catch(() => refresh());
    const id = setInterval(() => refresh(), 30000);
    return () => clearInterval(id);
  }, [refresh, auth.user, auth.workspace?.gateway_url, auth.isCloudMode]);

  const notify = (msg: string) => toast(msg);

  const [showLogin, setShowLogin] = useState(false);

  // Local mode: allow #landing to preview the landing page
  if (!auth.isCloudMode && window.location.hash === '#landing') {
    return <LandingPage onLogin={() => { window.location.hash = 'dashboard'; }} />;
  }

  // Cloud mode: auth flow
  if (auth.isCloudMode) {
    if (auth.loading) {
      return <div className="min-h-dvh bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
    }
    if (!auth.user) {
      if (showLogin) {
        return <LoginPage onSignIn={auth.signIn} onSignUp={auth.signUp} onBack={() => setShowLogin(false)} />;
      }
      return <LandingPage onLogin={() => setShowLogin(true)} />;
    }
    if (!auth.workspace?.gateway_url) {
      return (
        <ConnectPage
          onConnect={async (data) => {
            const err = await auth.updateWorkspace(data);
            if (!err) refresh();
            return err;
          }}
          onSignOut={() => { setShowLogin(false); auth.signOut(); }}
          email={auth.user.email}
        />
      );
    }
  }

  if (initialLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="landing-orbit" style={{ inset: '-14px' }}>
            {[0, 1, 2].map(i => (
              <span key={i} className="landing-orbit-dot" style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>
          <div className="landing-orbit" style={{ inset: '-24px', animationDirection: 'reverse', animationDuration: '18s' }}>
            {[0, 1, 2].map(i => (
              <span key={i} className="landing-orbit-dot" style={{ '--i': i, opacity: 0.3 } as React.CSSProperties} />
            ))}
          </div>
          <span className="text-5xl block">🧠</span>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Warming up the lobster...</p>
          <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">connecting to your agents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: palette.dark,
            border: `1px solid ${colors.border}`,
            color: palette.white,
            fontFamily: "'Geist Sans', 'Inter', sans-serif",
            boxShadow: `0 8px 32px -4px rgba(0, 0, 0, 0.5), 0 0 0 1px ${colors.borderSubtle}`,
          }
        }}
      />

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Header */}
      <header className="relative border-b border-border/50 px-6 py-0"
        style={{ background: `linear-gradient(180deg, ${colors.bgCardHover} 0%, transparent 100%)` }}>

        {/* Glow line at top */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent 10%, ${accentAlpha(0.2)} 50%, transparent 90%)` }} />

        <div className="flex items-center justify-between h-14 max-w-[1600px] mx-auto">
          {/* Logo */}
          <button onClick={() => setTab('dashboard')} className="group flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="relative">
              <span className="text-2xl">{'\u{1F9E0}'}</span>
              <div className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `radial-gradient(circle, ${accentAlpha(0.15)}, transparent)` }} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight gradient-text">Open Brain</span>
              <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground hidden md:inline">Command</span>
            </div>
          </button>

          {/* Navigation */}
          <nav className="flex items-center gap-0.5">
            {visibleTabs.map(t => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.03]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 rounded-lg"
                      style={{
                        background: accentAlpha(0.08),
                        boxShadow: `inset 0 0 0 1px ${accentAlpha(0.12)}`,
                      }} />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <span className={`text-[11px] ${isActive ? 'opacity-80' : 'opacity-40'}`}>{t.icon}</span>
                    <span>{t.label}</span>
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-px"
                      style={{ background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)` }} />
                  )}
                </button>
              );
            })}

            {/* Help button */}
            <button
              onClick={() => setHelpOpen(true)}
              className="relative px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 text-muted-foreground hover:text-foreground/80 hover:bg-white/[0.03]"
              title="Help & Commands"
            >
              <span className="text-[11px] opacity-40">?</span>
            </button>
          </nav>

          {/* External links (local mode) / Sign out (cloud mode) */}
          <div className="hidden lg:flex items-center gap-1 border-l border-border/50 pl-3 ml-2">
            {auth.isCloudMode ? (
              <button onClick={() => { setShowLogin(false); auth.signOut(); }}
                className="px-2 py-1 rounded-md text-[11px] text-muted-foreground/70 hover:text-muted-foreground hover:bg-white/[0.03] transition-all">
                Sign out
              </button>
            ) : (
              [
                { label: 'Logdash', href: `http://${window.location.hostname}:3333`, icon: '\u25C8' },
                { label: 'Antfarm', href: `http://${window.location.hostname}:3333/#agents`, icon: '\u2B22' },
                { label: 'Voice', href: `http://${window.location.hostname}:9999`, icon: '\u25C9' },
              ].map(link => (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                  className="px-2 py-1 rounded-md text-[11px] text-muted-foreground/70 hover:text-muted-foreground hover:bg-white/[0.03] transition-all">
                  <span className="opacity-50 mr-1">{link.icon}</span>
                  {link.label}
                </a>
              ))
            )}
          </div>
        </div>
      </header>

      {/* Content with entrance animation */}
      <main className="p-6 max-w-[1600px] mx-auto animate-fade-up" key={tab}>
        {tab === 'dashboard' && <DashboardTab state={state} onRefresh={refresh} notify={notify} modules={modules} />}
        {tab === 'tasks' && <TasksTab tasks={state.tasks} onRefresh={refresh} notify={notify} setState={setState} />}
        {tab === 'pipeline' && <PipelineTab leads={state.leads} onRefresh={refresh} notify={notify} setState={setState} />}
        {tab === 'content' && <ContentTab content={state.content} inbox={state.inbox} onRefresh={refresh} notify={notify} />}
        {tab === 'calendar' && <CalendarTab />}
        {tab === 'workflows' && <WorkflowsTab notify={notify} />}
        {tab === 'brain' && <BrainTab />}
        {tab === 'feed' && <FeedTab activity={state.activity} onNavigate={(t) => setTab(t as TabId)} />}
        {tab === 'system' && <SystemTab agents={state.agents} notify={notify} />}
        {tab === 'settings' && <SettingsTab auth={auth} notify={notify} />}
      </main>
    </div>
  );
}
