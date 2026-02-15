import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { palette, accentAlpha } from '../theme';

interface Props {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string) => Promise<string | null>;
  onBack?: () => void;
}

export function LoginPage({ onSignIn, onSignUp, onBack }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fn = mode === 'signin' ? onSignIn : onSignUp;
    const err = await fn(email, password);
    setLoading(false);

    if (err) {
      setError(err);
    } else if (mode === 'signup') {
      setSignupSuccess(true);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.03] pointer-events-none"
        style={{ background: `radial-gradient(circle, ${palette.accent}, transparent 70%)` }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo with orbiting dots */}
        <div className="text-center mb-10">
          <div className="inline-block relative">
            {/* Orbit ring */}
            <div className="landing-orbit" style={{ inset: '-14px' }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="landing-orbit-dot" style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
            {/* Second orbit, counter direction */}
            <div className="landing-orbit" style={{ inset: '-24px', animationDirection: 'reverse', animationDuration: '18s' }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="landing-orbit-dot" style={{ '--i': i, opacity: 0.3 } as React.CSSProperties} />
              ))}
            </div>
            <span className="text-5xl block" role="img" aria-label="Brain and lobster">🧠</span>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-5">
            <span className="text-lg">🦞</span>
            <h1 className="text-2xl font-bold text-balance">Open Brain</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 text-pretty">
            Peek inside the lobster's mind
          </p>
        </div>

        {signupSuccess ? (
          <div className="glass-card rounded-xl p-6 text-center border border-border/50">
            <div className="text-3xl mb-3">📬</div>
            <p className="text-sm text-pretty text-zinc-300">Check your email to confirm your account, then sign in.</p>
            <Button variant="secondary" size="sm" className="mt-4 rounded-lg" onClick={() => { setSignupSuccess(false); setMode('signin'); }}>
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-4 border border-border/50 relative">
            {/* Top shimmer line */}
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${accentAlpha(0.2)}, transparent)` }} />

            <div>
              <Label htmlFor="login-email" className="text-xs text-muted-foreground uppercase">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1.5"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="login-password" className="text-xs text-muted-foreground uppercase">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 6 characters' : ''}
                className="mt-1.5"
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              className="landing-cta-btn w-full rounded-lg font-semibold"
              disabled={loading}
            >
              {loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {mode === 'signin' ? (
                <>No account? <button type="button" className="underline hover:no-underline" style={{ color: palette.accent }} onClick={() => { setMode('signup'); setError(null); }}>Sign up</button></>
              ) : (
                <>Have an account? <button type="button" className="underline hover:no-underline" style={{ color: palette.accent }} onClick={() => { setMode('signin'); setError(null); }}>Sign in</button></>
              )}
            </p>
          </form>
        )}

        {/* Back to landing */}
        {onBack && (
          <div className="text-center mt-6">
            <button onClick={onBack} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
              &larr; Back to home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
