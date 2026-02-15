import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { palette } from '../theme';

interface Props {
  onLogin: () => void;
}

/* ── Animated counter ── */
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        const duration = 1600;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          setVal(Math.round(ease * target));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="tabular-nums">
      {val.toLocaleString()}{suffix}
    </span>
  );
}

/* ── Blinking cursor ── */
function Cursor() {
  return <span className="landing-cursor" aria-hidden="true">_</span>;
}

/* ── Feature data ── */
const FEATURES = [
  {
    tag: 'observe',
    title: 'Look under the hood',
    description: 'Every task, every decision, every synapse firing — visible in real time. Watch your content agent research, draft, and publish while you sip coffee.',
    terminal: '$ openbrain inspect --live\n> streaming 14 agent feeds...\n> content-writer: drafting linkedin post\n> lead-nurture: scoring 3 new prospects',
    span: 'sm:col-span-1',
  },
  {
    tag: 'control',
    title: 'Steer the lobster',
    description: 'Your agents are powerful, but you\'re the captain. Redirect workflows mid-flight, reprioritize tasks, pause and resume any agent instantly.',
    terminal: '$ openbrain steer --agent content-writer\n> pausing current task...\n> redirecting to linkedin-q4-campaign\n> agent acknowledged, resuming',
    span: 'sm:col-span-1',
  },
  {
    tag: 'orchestrate',
    title: 'Puppet master mode',
    description: 'Chain agents into multi-step workflows. Research feeds into drafting, drafting feeds into review, review feeds into publishing. One click, full pipeline.',
    terminal: '$ openbrain workflow run content-pipeline\n> 4 agents spawned\n> research → draft → review → publish\n> ETA: 12 minutes for 3 articles',
    span: 'sm:col-span-2',
  },
  {
    tag: 'rewire',
    title: 'Mess with its brain',
    description: 'Your AI has a soul file, memory, personality traits, and tool connections. Edit any of them. Make it funnier. Make it more formal. Your call.',
    terminal: '$ openbrain brain edit --personality\n> loading SOUL.md...\n> tone: "professional but slightly unhinged"\n> saved. agent reloading personality.',
    span: 'sm:col-span-2',
  },
];

const STATS = [
  { value: 847, suffix: '', label: 'agents deployed' },
  { value: 12, suffix: 'k', label: 'tasks completed' },
  { value: 99.7, suffix: '%', label: 'uptime' },
  { value: 0, suffix: '', label: 'lobsters harmed' },
];

const MODULES = ['Tasks', 'Pipeline', 'Content', 'Calendar', 'Brain', 'Cron', 'Memory', 'Feed'];

const USE_CASES = [
  {
    title: 'Content generation',
    subtitle: 'LinkedIn, blogs, newsletters — on autopilot',
    description: 'Your content agent researches topics, writes drafts in your voice, queues them for review, and publishes on schedule. You approve with one click or let it fly.',
    details: ['Multi-platform publishing', 'Voice & tone matching', 'Research-backed writing', 'Scheduled queue with approval flow'],
  },
  {
    title: 'Lead nurturing',
    subtitle: 'From cold to closed, automatically',
    description: 'Track prospects through your pipeline. Your agent scores leads, sends personalized follow-ups, books meetings, and alerts you when a deal is heating up.',
    details: ['Automated lead scoring', 'Personalized outreach sequences', 'CRM pipeline visualization', 'Real-time deal alerts'],
  },
  {
    title: 'Task orchestration',
    subtitle: 'The to-do list that does itself',
    description: 'Break down projects into tasks, assign them to agents or yourself, track progress with kanban boards, and let AI handle the grunt work while you focus on strategy.',
    details: ['Kanban board with drag-and-drop', 'AI-assisted task breakdown', 'Due dates, stakes & energy levels', 'Daily briefings & streak tracking'],
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect your agents',
    description: 'Point Open Brain at your AI infrastructure. Works with any agent framework — OpenClaw, LangChain, custom scripts, cron jobs. If it runs, we can see it.',
  },
  {
    step: '02',
    title: 'Configure the brain',
    description: 'Define your agent\'s personality, memory, and tool connections. Upload a soul file. Set up workflows. Tell it what you care about and how you want things done.',
  },
  {
    step: '03',
    title: 'Watch it work',
    description: 'Open the dashboard and see everything happening in real time. Tasks being completed, content being written, leads being nurtured. Intervene when you want — or don\'t.',
  },
  {
    step: '04',
    title: 'Pull the strings',
    description: 'Approve content before it publishes. Redirect an agent that\'s going off-track. Adjust priorities on the fly. You\'re always in control, even when you\'re not watching.',
  },
];

export function LandingPage({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setSubmitting(false);
    setEmail('');
  };

  const WaitlistForm = ({ id }: { id: string }) =>
    !submitted ? (
      <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row w-full max-w-sm gap-2">
        <label htmlFor={id} className="sr-only">Email address</label>
        <Input
          id={id}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-full h-10 px-4 bg-white/[0.06] border-border/30 placeholder:text-muted-foreground/30 focus:bg-white/[0.08]"
          required
        />
        <Button
          type="submit"
          className="landing-cta-btn rounded-full h-10 px-5 text-[13px] font-semibold shrink-0"
          disabled={submitting}
        >
          {submitting ? 'Joining...' : 'Join waitlist'}
        </Button>
      </form>
    ) : (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-border/30 bg-white/[0.04]">
        <span className="size-4 rounded-full flex items-center justify-center text-[10px]"
          style={{ background: palette.accent, color: '#fff' }}>{'\u2713'}</span>
        <span className="text-sm text-muted-foreground">You're on the list. We'll be in touch.</span>
      </div>
    );

  const SectionDivider = ({ label }: { label: string }) => (
    <div className="flex items-center gap-3 mb-12 mx-auto max-w-[1000px] px-6">
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(63,63,70,0.3))' }} />
      <span className="font-mono text-[11px] text-muted-foreground/50 uppercase">{label}</span>
      <div className="h-px flex-1" style={{ background: 'linear-gradient(270deg, transparent, rgba(63,63,70,0.3))' }} />
    </div>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground landing-page">
      {/* Scanline */}
      <div className="landing-scanline" aria-hidden="true" />

      {/* ═══ Nav ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-[1200px] flex items-center justify-between px-6 h-14 backdrop-blur-[16px]"
          style={{ background: 'rgba(9, 9, 11, 0.7)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{'\u{1F9E0}'}</span>
            <span className="text-[15px] font-semibold text-foreground">Open Brain</span>
            <span className="landing-status-pill">
              <span className="landing-status-dot" />
              stealth
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={onLogin} className="hidden sm:block text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </button>
            <Button onClick={onLogin} size="sm" className="landing-cta-btn rounded-full px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium">
              Get started
            </Button>
          </div>
        </div>
        <div className="h-px w-full" style={{
          background: 'linear-gradient(90deg, transparent 5%, rgba(220, 38, 38, 0.15) 30%, rgba(220, 38, 38, 0.15) 70%, transparent 95%)',
        }} />
      </nav>

      {/* ═══ Hero — full-bleed lobster ═══ */}
      <section className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden">
        {/* Lobster background */}
        <div className="absolute inset-0">
          <img src="/lobster.jpg" alt="" aria-hidden="true" className="w-full h-full object-cover object-center opacity-30" />
          <div className="absolute inset-0" style={{
            background: `
              radial-gradient(ellipse 60% 50% at 50% 45%, rgba(9,9,11,0.6) 0%, rgba(9,9,11,0.92) 70%),
              linear-gradient(180deg, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.3) 30%, rgba(9,9,11,0.3) 60%, rgba(9,9,11,1) 100%)
            `,
          }} />
          <div className="absolute inset-0 mix-blend-soft-light opacity-15"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${palette.accent}, transparent 70%)` }} />
        </div>

        {/* Hero content — with dark backdrop for readability */}
        <div className="relative z-10 text-center px-6 max-w-[820px] mx-auto">
          <div className="landing-hero-backdrop rounded-3xl px-4 py-10 sm:px-12 sm:py-16">
            <div className="font-mono text-xs text-zinc-400 mb-6 flex items-center justify-center gap-2">
              <span className="text-[10px] opacity-50">{'//'}</span>
              <span>agent orchestration platform</span>
              <span className="text-[10px] opacity-50">{'//'}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-balance leading-[1.05] text-white"
              style={{ letterSpacing: '-0.035em', textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
              The command center
              <br />
              <span className="landing-hero-accent">for your AI lobster</span>
            </h1>

            <p className="mt-5 sm:mt-7 text-base sm:text-lg md:text-xl text-zinc-300 max-w-[520px] mx-auto text-pretty leading-relaxed"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
              See what your agents are doing. Steer them.
              Mess with their brains. Control the fleet
              like a cosmic puppet master<Cursor />
            </p>

            <div className="mt-10 flex flex-col items-center gap-4">
              <WaitlistForm id="hero-email" />
              <span className="text-[11px] text-zinc-500 font-mono">
                early access &middot; free during beta
              </span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">scroll</span>
          <div className="w-px h-8" style={{ background: 'linear-gradient(180deg, rgba(220,38,38,0.4), transparent)' }} />
        </div>
      </section>

      {/* ═══ Stats bar ═══ */}
      <section className="relative border-y border-border/20 py-8 px-6">
        <div className="mx-auto max-w-[1000px] grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground"
                style={s.label === 'lobsters harmed' ? { color: '#22C55E' } : {}}>
                <Counter target={s.value} suffix={s.suffix} />
              </div>
              <div className="text-[11px] text-zinc-500 font-mono mt-1.5 uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ What is Open Brain ═══ */}
      <section className="py-16 sm:py-24 px-6">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-balance leading-tight text-foreground"
            style={{ letterSpacing: '-0.03em' }}>
            Your AI is doing things.<br />
            <span className="text-zinc-400">Do you know what?</span>
          </h2>
          <p className="mt-6 text-base sm:text-lg text-zinc-400 max-w-[600px] mx-auto text-pretty leading-relaxed">
            AI agents are powerful — but they're black boxes. They write content you didn't approve,
            nurture leads you didn't know about, and complete tasks you forgot you assigned.
            Open Brain gives you a window into everything your agents do, and a steering wheel
            to keep them on track.
          </p>
        </div>
      </section>

      {/* ═══ How it works ═══ */}
      <section className="pb-16 sm:pb-24">
        <SectionDivider label="how it works" />
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="glass-card rounded-xl p-6 relative overflow-hidden">
                <div className="flex items-start gap-4">
                  <span className="landing-step-number font-mono text-[11px] shrink-0">{step.step}</span>
                  <div>
                    <h3 className="text-[16px] font-semibold text-foreground leading-tight">{step.title}</h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed text-pretty">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Capabilities — bento grid ═══ */}
      <section className="pb-16 sm:pb-24">
        <SectionDivider label="capabilities" />
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-children">
            {FEATURES.map((f, i) => (
              <div key={i} className={`landing-feature-card glass-card rounded-xl overflow-hidden ${f.span}`}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <span className="landing-tag font-mono text-[10px] uppercase">{f.tag}</span>
                  <span className="text-zinc-600 text-[10px] font-mono">0{i + 1}</span>
                </div>
                <div className="px-5 pb-4">
                  <h3 className="text-[17px] font-semibold text-foreground leading-tight">{f.title}</h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed text-pretty">{f.description}</p>
                </div>
                <div className="landing-terminal mx-4 mb-4 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="size-2 rounded-full bg-red-500/40" />
                    <span className="size-2 rounded-full bg-yellow-500/30" />
                    <span className="size-2 rounded-full bg-emerald-500/30" />
                  </div>
                  <pre className="font-mono text-[11px] leading-relaxed text-zinc-500 whitespace-pre-wrap">{f.terminal}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Use cases ═══ */}
      <section className="pb-16 sm:pb-24">
        <SectionDivider label="use cases" />
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-balance text-foreground" style={{ letterSpacing: '-0.03em' }}>
              Built for people who ship
            </h2>
            <p className="mt-3 text-zinc-400 max-w-[500px] mx-auto text-pretty">
              Whether you're a solo founder, a small team, or a marketing department — Open Brain
              turns your AI agents into a reliable workforce.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {USE_CASES.map((uc, i) => (
              <div key={i} className="glass-card rounded-xl p-6 flex flex-col">
                <span className="landing-tag font-mono text-[10px] uppercase self-start mb-4">
                  {['content', 'pipeline', 'tasks'][i]}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{uc.title}</h3>
                <p className="text-[13px] text-zinc-500 mt-0.5">{uc.subtitle}</p>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed text-pretty flex-1">{uc.description}</p>
                <ul className="mt-4 space-y-1.5 border-t border-border/20 pt-4">
                  {uc.details.map((d, j) => (
                    <li key={j} className="flex items-center gap-2 text-[13px] text-zinc-400">
                      <span className="size-1 rounded-full shrink-0" style={{ background: palette.accent }} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Modules strip ═══ */}
      <section className="py-14 sm:py-20 px-6 border-y border-border/10">
        <div className="mx-auto max-w-[800px] text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-balance leading-tight text-foreground"
            style={{ letterSpacing: '-0.03em' }}>
            One brain to rule them all
          </h2>
          <p className="mt-4 text-zinc-400 max-w-[540px] mx-auto text-pretty leading-relaxed">
            Eight modules working together. Content writers, lead nurturers, task runners,
            cron jobs — orchestrated from a single dashboard.
            Inspect memory. Tune personality. Pull the strings when they go off-script.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {MODULES.map((m, i) => (
              <span key={m} className="landing-module-pill" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="size-1 rounded-full opacity-40" style={{ background: palette.accent }} />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Why now / differentiator ═══ */}
      <section className="py-16 sm:py-24 px-6">
        <div className="mx-auto max-w-[1000px]">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-balance text-foreground" style={{ letterSpacing: '-0.03em' }}>
              Not another dashboard
            </h2>
            <p className="mt-3 text-zinc-400 max-w-[500px] mx-auto text-pretty">
              Open Brain isn't a chatbot wrapper. It's mission control for autonomous AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: 'Agent-native',
                description: 'Built from the ground up for multi-agent workflows. Not a chat interface with a sidebar — a real operational dashboard.',
              },
              {
                title: 'Framework agnostic',
                description: 'Works with OpenClaw, LangChain, CrewAI, custom scripts, or plain cron jobs. If it runs code, Open Brain can see it.',
              },
              {
                title: 'Human-in-the-loop',
                description: 'Your agents work autonomously, but you\'re always one click away from stepping in. Approve, redirect, or override at any point.',
              },
            ].map((item, i) => (
              <div key={i} className="glass-card rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="size-2 rounded-full" style={{ background: palette.accent }} />
                  <h3 className="text-[15px] font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed text-pretty">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Bottom CTA ═══ */}
      <section className="py-16 sm:py-28 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-[0.03] pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, ${palette.accent}, transparent 70%)` }} />

        <div className="relative z-10 mx-auto max-w-[480px] text-center">
          <div className="landing-orbit-container mx-auto mb-8 size-20 relative flex items-center justify-center">
            <span className="text-4xl relative z-10">{'\u{1F9E0}'}</span>
            <div className="landing-orbit" aria-hidden="true">
              <span className="landing-orbit-dot" style={{ '--i': 0 } as React.CSSProperties} />
              <span className="landing-orbit-dot" style={{ '--i': 1 } as React.CSSProperties} />
              <span className="landing-orbit-dot" style={{ '--i': 2 } as React.CSSProperties} />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-balance leading-tight text-foreground"
            style={{ letterSpacing: '-0.03em' }}>
            Ready to take the controls?
          </h2>
          <p className="mt-3 text-sm text-zinc-400 text-pretty leading-relaxed">
            We're in stealth mode. Drop your email and we'll
            let you in when it's your turn to steer the lobster.
          </p>

          <div className="mt-8 flex justify-center">
            <WaitlistForm id="cta-email" />
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-border/15 py-6 sm:py-8 px-6">
        <div className="mx-auto max-w-[1000px] flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{'\u{1F9E0}'}</span>
            <span className="text-xs text-zinc-500 font-mono">open brain v0.2</span>
          </div>
          <p className="text-[11px] text-zinc-600 font-mono text-center">
            no lobsters were harmed in the making of this product
          </p>
        </div>
      </footer>
    </div>
  );
}
