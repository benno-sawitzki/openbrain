import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { palette } from '../theme';

interface Props {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string) => Promise<string | null>;
}

export function LoginPage({ onSignIn, onSignUp }: Props) {
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
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">{'\\u{1F9E0}'}</span>
          <h1 className="text-2xl font-bold mt-3 text-balance">Open Brain</h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty">See what your Open Claw is doing</p>
        </div>

        {signupSuccess ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-sm text-pretty">Check your email to confirm your account, then sign in.</p>
            <Button variant="secondary" size="sm" className="mt-4 rounded-lg" onClick={() => { setSignupSuccess(false); setMode('signin'); }}>
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Email</Label>
              <Input
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
              <Label className="text-xs text-muted-foreground uppercase">Password</Label>
              <Input
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
              className="w-full rounded-lg font-semibold"
              style={{ background: palette.accent, color: palette.black }}
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
      </div>
    </div>
  );
}
