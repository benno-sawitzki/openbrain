import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { palette, status, accentAlpha } from '../theme';
import { supabase, isCloudMode } from '../supabase';
import {
  testGateway,
  fetchSyncStatus,
  reconnectGateway,
  deleteAccount,
  fetchProviderRegistry,
  fetchProviderConfig,
  saveProviderConfig,
  testProviderConnection,
  fetchApiKey,
  generateApiKey,
  revokeApiKey,
  testHyperFokusConnection,
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
  onRefresh?: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

interface ProviderDef {
  id: string;
  name: string;
  slot: string;
  fields: FieldDef[];
}

/* ── Helpers ── */
const relativeTime = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
};

/* ── SlotConfig — renders provider dropdown + config fields for one slot ── */
function SlotConfig({
  slot: _slot,
  slotLabel,
  providers,
  selectedProvider,
  providerSettings,
  testResult,
  testingProvider,
  onSelectProvider,
  onFieldChange,
  onTest,
}: {
  slot: string;
  slotLabel: string;
  providers: ProviderDef[];
  selectedProvider: string;
  providerSettings: Record<string, any>;
  testResult: { ok: boolean; message: string } | null;
  testingProvider: boolean;
  onSelectProvider: (providerId: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onTest: () => void;
}) {
  const activeDef = providers.find(p => p.id === selectedProvider);
  const hasFields = activeDef && activeDef.fields.length > 0;

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground uppercase">{slotLabel}</Label>
      <Select value={selectedProvider} onValueChange={onSelectProvider}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Auto-detect" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto-detect</SelectItem>
          {providers.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFields && (
        <div className="rounded-lg bg-white/[0.02] p-4 space-y-3" style={{ border: `1px solid rgba(63, 63, 70, 0.2)` }}>
          {activeDef.fields.map(field => (
            <div key={field.key}>
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required && <span style={{ color: palette.accent }}> *</span>}
              </Label>
              <Input
                className="mt-1"
                type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={providerSettings[field.key] || ''}
                onChange={e => onFieldChange(field.key, e.target.value)}
              />
              {field.helpText && (
                <p className="text-[11px] text-muted-foreground/70 mt-1">{field.helpText}</p>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              disabled={testingProvider}
              onClick={onTest}
            >
              {testingProvider ? 'Testing...' : 'Test Connection'}
            </Button>
            {testResult && (
              <span
                className="text-xs font-medium px-2 py-1 rounded"
                style={{
                  background: testResult.ok ? status.success.bg : status.error.bg,
                  color: testResult.ok ? status.success.color : status.error.color,
                  border: `1px solid ${testResult.ok ? status.success.border : status.error.border}`,
                }}
              >
                {testResult.ok ? 'Connected' : testResult.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function SettingsTab({ auth, notify, onRefresh }: Props) {
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

  // Integrations
  const [registry, setRegistry] = useState<{ slots: string[]; slotLabels: Record<string, string>; providers: ProviderDef[] } | null>(null);
  const [providerConfig, setProviderConfig] = useState<any>({});
  const [providerTestResults, setProviderTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [testingSlot, setTestingSlot] = useState<string | null>(null);
  const [savingProviders, setSavingProviders] = useState(false);

  // Connection Status
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // API Key
  const [apiKeyInfo, setApiKeyInfo] = useState<{ exists: boolean; masked?: string } | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokingKey, setRevokingKey] = useState(false);

  // HyperFokus integration
  const [hfUrl, setHfUrl] = useState('');
  const [hfApiKey, setHfApiKey] = useState('');
  const [hfTestResult, setHfTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [hfTesting, setHfTesting] = useState(false);

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
      fetchApiKey().then(setApiKeyInfo).catch(() => {});
    }
    // Fetch provider registry and current config
    Promise.all([fetchProviderRegistry(), fetchProviderConfig()])
      .then(([reg, config]) => {
        setRegistry(reg);
        setProviderConfig(config || {});
        // Load HyperFokus config
        if (config?.hyperfokus) {
          setHfUrl(config.hyperfokus.url || '');
          setHfApiKey(config.hyperfokus.api_key || '');
        }
      })
      .catch(e => console.error('Failed to load provider config', e));
  }, []);

  // Get selected provider for a slot from config
  const getSelectedProvider = (slot: string): string => {
    return providerConfig?.providers?.[slot] || 'auto';
  };

  // Get provider-specific settings (e.g. todoist api_key)
  const getProviderSettings = (providerId: string): Record<string, any> => {
    return providerConfig?.[providerId] || {};
  };

  const handleSelectProvider = (slot: string, providerId: string) => {
    setProviderConfig((prev: any) => ({
      ...prev,
      providers: {
        ...(prev?.providers || {}),
        [slot]: providerId === 'auto' ? undefined : providerId,
      },
    }));
    // Clear test result for this slot
    setProviderTestResults(prev => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  };

  const handleFieldChange = (providerId: string, key: string, value: string) => {
    setProviderConfig((prev: any) => ({
      ...prev,
      [providerId]: {
        ...(prev?.[providerId] || {}),
        [key]: value,
      },
    }));
  };

  const handleTestProvider = async (slot: string) => {
    const providerId = getSelectedProvider(slot);
    if (!providerId || providerId === 'auto') return;
    setTestingSlot(slot);
    try {
      const result = await testProviderConnection(providerId, getProviderSettings(providerId));
      setProviderTestResults(prev => ({
        ...prev,
        [slot]: { ok: result.ok, message: result.error || result.message || 'Connected' },
      }));
    } catch (e: any) {
      setProviderTestResults(prev => ({
        ...prev,
        [slot]: { ok: false, message: e.message || 'Test failed' },
      }));
    }
    setTestingSlot(null);
  };

  const handleSaveProviders = async () => {
    setSavingProviders(true);
    try {
      // Clean up: remove undefined provider entries
      const cleanConfig = { ...providerConfig };
      if (cleanConfig.providers) {
        for (const [k, v] of Object.entries(cleanConfig.providers)) {
          if (!v) delete cleanConfig.providers[k];
        }
      }
      const result = await saveProviderConfig(cleanConfig);
      if (result.ok) {
        notify('Providers saved and reloaded');
        onRefresh?.();
      } else {
        notify('Failed to save: ' + (result.error || 'unknown error'));
      }
    } catch {
      notify('Failed to save provider config');
    }
    setSavingProviders(false);
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      const { key } = await generateApiKey();
      setNewKey(key);
      setApiKeyInfo({ exists: true, masked: key.slice(0, 3) + '****' + key.slice(-4) });
      notify('API key generated — copy it now, it won\'t be shown again');
    } catch {
      notify('Failed to generate API key');
    }
    setGeneratingKey(false);
  };

  const handleRevokeKey = async () => {
    setRevokingKey(true);
    try {
      await revokeApiKey();
      setApiKeyInfo({ exists: false });
      setNewKey(null);
      notify('API key revoked');
    } catch {
      notify('Failed to revoke API key');
    }
    setRevokingKey(false);
  };

  const handleCopyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      notify('API key copied to clipboard');
    }
  };

  const handleTestHyperFokus = async () => {
    setHfTesting(true);
    setHfTestResult(null);
    // Save current values first so the server-side test uses them
    try {
      await saveProviderConfig({
        ...providerConfig,
        hyperfokus: { url: hfUrl || 'https://api.hyperfok.us', api_key: hfApiKey },
      });
    } catch {
      setHfTestResult({ ok: false, message: 'Failed to save config before testing' });
      setHfTesting(false);
      return;
    }
    try {
      const result = await testHyperFokusConnection();
      setHfTestResult({
        ok: result.ok,
        message: result.ok ? `Connected (${result.user})` : (result.error || 'Failed'),
      });
    } catch {
      setHfTestResult({ ok: false, message: 'Connection failed' });
    }
    setHfTesting(false);
  };

  const handleSaveHyperFokus = async () => {
    // Merge into providerConfig and save
    const updated = {
      ...providerConfig,
      hyperfokus: {
        url: hfUrl || 'https://api.hyperfok.us',
        api_key: hfApiKey,
      },
    };
    setSavingProviders(true);
    try {
      const result = await saveProviderConfig(updated);
      if (result.ok) {
        setProviderConfig(updated);
        notify('HyperFokus config saved');
      } else {
        notify('Failed to save: ' + (result.error || 'unknown error'));
      }
    } catch {
      notify('Failed to save HyperFokus config');
    }
    setSavingProviders(false);
  };

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
  const syncIntervalMs: number | null = syncStatus?.intervalMs ?? null;
  const syncIntervalLabel = syncIntervalMs
    ? syncIntervalMs >= 60000
      ? `every ${Math.round(syncIntervalMs / 60000)}m`
      : `every ${Math.round(syncIntervalMs / 1000)}s`
    : '\u2014';

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

      {/* ── Section 2: API Key (cloud mode only) ── */}
      {auth.isCloudMode && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ background: palette.subtle }} />
            API Key
          </h2>

          <div className="space-y-4">
            {newKey ? (
              /* Just generated — show full key once */
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Your API Key</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono px-3 py-2 rounded-lg border border-border/50"
                    style={{ background: 'rgba(220, 38, 38, 0.06)', color: palette.accent }}>
                    {newKey}
                  </code>
                  <Button variant="secondary" size="sm" className="rounded-lg shrink-0" onClick={handleCopyKey}>
                    Copy
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                  Copy this key now — it won't be shown in full again.
                </p>
              </div>
            ) : apiKeyInfo?.exists ? (
              /* Key exists — show masked */
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Current Key</Label>
                <div className="mt-1.5 text-sm font-mono px-3 py-2 rounded-lg bg-white/[0.03] text-muted-foreground">
                  {apiKeyInfo.masked}
                </div>
              </div>
            ) : (
              /* No key */
              <p className="text-sm text-muted-foreground">
                No API key yet. Generate one to use the CLI tools from any machine.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-lg font-semibold"
                style={{ background: palette.accent, color: palette.white }}
                disabled={generatingKey}
                onClick={handleGenerateKey}
              >
                {generatingKey ? 'Generating...' : apiKeyInfo?.exists ? 'Regenerate Key' : 'Generate API Key'}
              </Button>
              {apiKeyInfo?.exists && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  disabled={revokingKey}
                  onClick={handleRevokeKey}
                >
                  {revokingKey ? 'Revoking...' : 'Revoke'}
                </Button>
              )}
            </div>

            {/* Usage instructions */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">How to use</summary>
              <div className="mt-3 space-y-2 text-pretty leading-relaxed">
                <p><strong>CLI tools:</strong> Run <code className="px-1 py-0.5 rounded bg-white/[0.06]">taskpipe init --cloud</code> and paste your API key when prompted.</p>
                <p><strong>Environment variables:</strong> Set <code className="px-1 py-0.5 rounded bg-white/[0.06]">OPENBRAIN_API_KEY</code> and <code className="px-1 py-0.5 rounded bg-white/[0.06]">OPENBRAIN_URL=https://openbrain.space</code> for agents and scripts.</p>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* ── Section 3: Integrations ── */}
      {registry && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full" style={{ background: palette.accent }} />
            Integrations
          </h2>

          <div className="space-y-6">
            {(registry.slots || []).map(slot => (
              <SlotConfig
                key={slot}
                slot={slot}
                slotLabel={registry.slotLabels?.[slot] || slot}
                providers={registry.providers.filter(p => p.slot === slot)}
                selectedProvider={getSelectedProvider(slot)}
                providerSettings={getProviderSettings(getSelectedProvider(slot))}
                testResult={providerTestResults[slot] || null}
                testingProvider={testingSlot === slot}
                onSelectProvider={(id) => handleSelectProvider(slot, id)}
                onFieldChange={(key, val) => handleFieldChange(getSelectedProvider(slot), key, val)}
                onTest={() => handleTestProvider(slot)}
              />
            ))}

            <Button
              size="sm"
              className="rounded-lg font-semibold"
              style={{ background: palette.accent, color: palette.white }}
              disabled={savingProviders}
              onClick={handleSaveProviders}
            >
              {savingProviders ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* ── HyperFokus Integration ── */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full" style={{ background: '#6366F1' }} />
          HyperFokus
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Connect to HyperFokus to send tasks for deep focus sessions.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">HyperFokus URL</Label>
            <Input
              className="mt-1.5"
              value={hfUrl}
              onChange={e => setHfUrl(e.target.value)}
              placeholder="https://api.hyperfok.us"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">API Key</Label>
            <Input
              className="mt-1.5"
              type="password"
              value={hfApiKey}
              onChange={e => setHfApiKey(e.target.value)}
              placeholder="hf_..."
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              disabled={hfTesting || !hfApiKey}
              onClick={handleTestHyperFokus}
            >
              {hfTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              size="sm"
              className="rounded-lg font-semibold"
              style={{ background: '#6366F1', color: '#fff' }}
              disabled={savingProviders || !hfApiKey}
              onClick={handleSaveHyperFokus}
            >
              {savingProviders ? 'Saving...' : 'Save'}
            </Button>
            {hfTestResult && (
              <span
                className="text-xs font-medium px-2 py-1 rounded"
                style={{
                  background: hfTestResult.ok ? status.success.bg : status.error.bg,
                  color: hfTestResult.ok ? status.success.color : status.error.color,
                  border: `1px solid ${hfTestResult.ok ? status.success.border : status.error.border}`,
                }}
              >
                {hfTestResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Workspace (cloud mode only) ── */}
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

      {/* ── Section 4: Connection Status (cloud mode only) ── */}
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
                <div className="font-mono text-xs">{syncIntervalLabel}</div>
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

      {/* ── Section 5: Danger Zone ── */}
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
