import { useState } from 'react';
import { testGateway } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { palette } from '../theme';

interface Props {
  onConnect: (data: { gateway_url: string; gateway_token: string }) => Promise<string | null>;
  onSignOut: () => void;
  email?: string;
}

export function ConnectPage({ onConnect, onSignOut, email }: Props) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTesting(true);

    // Normalize URL — add wss:// if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
      normalizedUrl = `wss://${normalizedUrl}`;
    }

    // Test the connection via our server
    try {
      const res = await testGateway({ gateway_url: normalizedUrl, gateway_token: token.trim() });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Connection failed');
        setTesting(false);
        return;
      }
    } catch {
      setError('Could not reach the server');
      setTesting(false);
      return;
    }

    // Save to workspace
    const err = await onConnect({ gateway_url: normalizedUrl, gateway_token: token.trim() });
    setTesting(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">{'\u{1F9E0}'}</span>
          <h1 className="text-2xl font-bold mt-3 text-balance">Connect your Open Claw</h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty">
            Enter your Gateway URL and token to see what your Open Claw is doing.
          </p>
        </div>

        <form onSubmit={handleConnect} className="glass-card rounded-xl p-6 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Gateway URL</Label>
            <Input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="wss://your-tunnel.trycloudflare.com"
              className="mt-1.5 font-mono text-sm"
              required
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground/60 mt-1 text-pretty">
              The WebSocket URL where your Open Claw Gateway is reachable.
            </p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground uppercase">Gateway Token</Label>
            <Input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Your OPENCLAW_GATEWAY_TOKEN"
              className="mt-1.5 font-mono text-sm"
              required
            />
            <p className="text-[11px] text-muted-foreground/60 mt-1 text-pretty">
              Found in your Open Claw config or OPENCLAW_GATEWAY_TOKEN env var.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full rounded-lg font-semibold"
            style={{ background: palette.accent, color: palette.black }}
            disabled={testing}
          >
            {testing ? 'Testing connection...' : 'Connect'}
          </Button>

          {/* How to get these */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">How do I get these?</summary>
            <div className="mt-3 space-y-2 text-pretty leading-relaxed">
              <p><strong>1. Expose your Gateway:</strong> Run <code className="px-1 py-0.5 rounded bg-white/[0.06]">cloudflared tunnel --url localhost:18789</code> on the machine running Open Claw. This gives you a public URL.</p>
              <p><strong>2. Find your token:</strong> Check your Open Claw LaunchAgent plist or run <code className="px-1 py-0.5 rounded bg-white/[0.06]">echo $OPENCLAW_GATEWAY_TOKEN</code> in the shell where Open Claw runs.</p>
            </div>
          </details>
        </form>

        <div className="text-center mt-4">
          <button onClick={onSignOut} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Signed in as {email} \u00B7 Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
