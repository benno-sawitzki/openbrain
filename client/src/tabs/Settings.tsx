import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { palette, status, accentAlpha } from '../theme';
import { supabase, isCloudMode } from '../supabase';
import {
  testGateway,
  fetchSyncStatus,
  reconnectGateway,
  deleteAccount,
} from '../api';

/* ── Types ── */
interface Props {
  auth: {
    user: { email?: string } | null;
    workspace: { name: string; gateway_url: string | null; gateway_token: string | null } | null;
    isCloudMode: boolean;
    signOut: () => Promise<void>;
    updateWorkspace: (data: any) => Promise<string | null>;
  };
  notify: (msg: string) => void;
}

/* ── Helpers ── */
const relativeTime = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
};

/* ── Main Component ── */
export function SettingsTab({ auth, notify }: Props) {
  // Account
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Workspace
  const [workspaceName, setWorkspaceName] = useState(auth.workspace?.name || '');
  const [gatewayUrl, setGatewayUrl] = useState(auth.workspace?.gateway_url || '');
  const [gatewayToken, setGatewayToken] = useState(auth.workspace?.gateway_token || '');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Connection Status
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Danger Zone
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchConnectionData = async () => {
    try {
      const sync = await fetchSyncStatus();
      setSyncStatus(sync);
    } catch (e) {
      console.error('Failed to fetch connection data', e);
    }
  };

  useEffect(() => {
    if (auth.isCloudMode) {
      fetchConnectionData();
    }
  }, []);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      notify('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password: newPassword });
      if (error) {
        notify('Failed to change password: ' + error.message);
      } else {
        notify('Password updated successfully');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      notify('Failed to change password');
    }
    setChangingPassword(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testGateway({ gateway_url: gatewayUrl, gateway_token: gatewayToken });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult('Connected successfully');
      } else {
        setTestResult(data.error || 'Connection failed');
      }
    } catch {
      setTestResult('Connection failed — check URL and token');
    }
    setTesting(false);
  };

  const handleSaveWorkspace = async () => {
    setSaving(true);
    try {
      const err = await auth.updateWorkspace({
        name: workspaceName,
        gateway_url: gatewayUrl || null,
        gateway_token: gatewayToken || null,
      });
      if (err) {
        notify('Failed to save: ' + err);
      } else {
        await reconnectGateway();
        notify('Workspace saved and gateway reconnected');
        fetchConnectionData();
      }
    } catch {
      notify('Failed to save workspace');
    }
    setSaving(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchConnectionData();
    setRefreshing(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const err = await auth.updateWorkspace({ gateway_url: null, gateway_token: null });
      if (err) {
        notify('Failed to disconnect: ' + err);
      } else {
        setGatewayUrl('');
        setGatewayToken('');
        notify('Gateway disconnected');
        fetchConnectionData();
      }
    } catch {
      notify('Failed to disconnect gateway');
    }
    setDisconnecting(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail !== auth.user?.email) {
      notify('Email does not match — type your email to confirm');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount();
      await auth.signOut();
    } catch {
      notify('Failed to delete account');
      setDeleting(false);
    }
  };

  const lastSync = syncStatus?.latest || '';
  const syncAgeMs = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
  const connected = syncAgeMs < 120_000; // Green if synced within 2 minutes
  const syncTypeCount = syncStatus?.types ? Object.keys(syncStatus.types).length : 0;

  return (
    <div className="space-y-6">
      {/* ── Section 1: Account ── */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full" style={{ background: palette.accent }} />
          Account
        </h2>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Email</Label>
            <div className="mt-1.5 text-sm font-mono px-3 py-2 rounded-lg bg-white/[0.03] text-muted-foreground">
              {auth.user?.email || 'Not signed in'}
            </div>
          </div>

          {/* Password Change */}
          {isCloudMode && supabase && (
            <div className="space-y-3 pt-2">
              <Label className="text-xs text-muted-foreground uppercase">Change Password</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="rounded-lg font-semibold"
                style={{ background: palette.accent, color: palette.white }}
                disabled={changingPassword || !newPassword || !confirmPassword}
                onClick={handleChangePassword}
              >
                {changingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          )}

          {/* Sign Out */}
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              onClick={() => auth.signOut()}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* ── Section 2: Workspace (cloud mode only) ── */}
      {auth.isCloudMode && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ background: palette.muted }} />
            Workspace
          </h2>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Workspace Name</Label>
              <Input
                className="mt-1.5"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                placeholder="My Workspace"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase">Gateway URL</Label>
              <Input
                className="mt-1.5"
                value={gatewayUrl}
                onChange={e => setGatewayUrl(e.target.value)}
                placeholder="https://your-gateway.example.com"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase">Gateway Token</Label>
              <Input
                className="mt-1.5"
                type="password"
                value={gatewayToken}
                onChange={e => setGatewayToken(e.target.value)}
                placeholder="Bearer token"
              />
            </div>

            {testResult && (
              <div
                className="text-sm px-3 py-2 rounded-lg"
                style={{
                  background: testResult.includes('success') ? status.success.bg : status.error.bg,
                  color: testResult.includes('success') ? status.success.color : status.error.color,
                  border: `1px solid ${testResult.includes('success') ? status.success.border : status.error.border}`,
                }}
              >
                {testResult}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                className="rounded-lg"
                disabled={testing || !gatewayUrl}
                onClick={handleTestConnection}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                size="sm"
                className="rounded-lg font-semibold"
                style={{ background: palette.accent, color: palette.white }}
                disabled={saving}
                onClick={handleSaveWorkspace}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Connection Status (cloud mode only) ── */}
      {auth.isCloudMode && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ background: palette.subtle }} />
            Connection Status
          </h2>

          <div className="space-y-4">
            {/* Connected indicator */}
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: connected ? '#22C55E' : '#EF4444' }}
              />
              <span className="text-sm font-semibold">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
              {lastSync && (
                <span className="text-xs text-muted-foreground">
                  Last sync: {relativeTime(lastSync)}
                </span>
              )}
            </div>

            {/* Status details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-white/[0.02] p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Data Sources</div>
                <div className="font-mono text-xs">{syncTypeCount} synced</div>
              </div>

              <div className="rounded-lg bg-white/[0.02] p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Sync Interval</div>
                <div className="font-mono text-xs">every 30s</div>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Section 4: Danger Zone ── */}
      <div
        className="glass-card rounded-xl p-6"
        style={{ border: `1px solid ${status.error.border}` }}
      >
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: status.error.color }}>
          <span className="w-1 h-5 rounded-full" style={{ background: status.error.color }} />
          Danger Zone
        </h2>

        <div className="space-y-5">
          {/* Disconnect Gateway */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Disconnect the gateway. This clears your gateway URL and token.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              style={{ borderColor: status.error.border, color: status.error.color }}
              disabled={disconnecting}
              onClick={handleDisconnect}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect Gateway'}
            </Button>
          </div>

          {/* Delete Account (cloud mode only) */}
          {auth.isCloudMode && (
            <div className="pt-2 border-t" style={{ borderColor: status.error.border }}>
              <p className="text-sm text-muted-foreground mb-2">
                Permanently delete your account and all data. This cannot be undone.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-semibold">{auth.user?.email}</span> to confirm
                  </Label>
                  <Input
                    className="mt-1.5"
                    placeholder="your@email.com"
                    value={deleteConfirmEmail}
                    onChange={e => setDeleteConfirmEmail(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="rounded-lg font-semibold"
                  style={{
                    background: deleteConfirmEmail === auth.user?.email ? status.error.color : accentAlpha(0.15),
                    color: deleteConfirmEmail === auth.user?.email ? palette.white : palette.muted,
                  }}
                  disabled={deleting || deleteConfirmEmail !== auth.user?.email}
                  onClick={handleDeleteAccount}
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
