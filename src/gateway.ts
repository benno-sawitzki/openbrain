import crypto from 'crypto';

// --- Types ---

export interface GatewayConfig {
  url: string;
  token: string;
}

interface RpcResponse {
  ok: boolean;
  payload?: any;
  error?: { code: string; message: string };
}

type EventHandler = (event: string, payload: any) => void;

// --- Gateway Client ---

const RECONNECT_DELAY_MS = 3000;
const RPC_TIMEOUT_MS = 10000;

export class GatewayClient {
  private config: GatewayConfig;
  private ws: WebSocket | null = null;
  private deviceId: string = '';
  private pubKeyB64url: string = '';
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;
  private connected = false;
  private connectSent = false;
  private challengeNonce: string | null = null;
  private pendingRpc = new Map<string, { resolve: (v: RpcResponse) => void; timer: ReturnType<typeof setTimeout> }>();
  private rpcCounter = 0;
  private eventHandlers: EventHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  lastActivity = Date.now();

  constructor(config: GatewayConfig) {
    this.config = config;

    // Derive a stable Ed25519 keypair from the token so the device ID
    // stays the same across restarts — once paired, it stays paired.
    const seed = crypto.createHash('sha256').update(`openbrain:${config.token}`).digest().subarray(0, 32);
    // Ed25519 private key = OID prefix + 32-byte seed
    const ed25519OidPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const seedPrivDer = Buffer.concat([ed25519OidPrefix, seed]);
    this.privateKey = crypto.createPrivateKey({ key: seedPrivDer, format: 'der', type: 'pkcs8' });
    this.publicKey = crypto.createPublicKey(this.privateKey);

    const spki = this.publicKey.export({ type: 'spki', format: 'der' });
    const rawPub = (spki as Buffer).subarray(spki.length - 32);
    this.deviceId = crypto.createHash('sha256').update(rawPub).digest('hex');
    this.pubKeyB64url = rawPub.toString('base64url');
  }

  // --- Public API ---

  connect(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  async rpc(method: string, params: any = {}): Promise<any> {
    this.lastActivity = Date.now();
    if (!this.connected) {
      throw new Error('Gateway not connected');
    }
    const id = `rpc-${++this.rpcCounter}`;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpc.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);

      this.pendingRpc.set(id, {
        resolve: (res: RpcResponse) => {
          clearTimeout(timer);
          if (res.ok) resolve(res.payload);
          else reject(new Error(`${res.error?.code}: ${res.error?.message}`));
        },
        timer,
      });

      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  // Wait for initial connection (up to timeoutMs)
  async waitForConnection(timeoutMs = 5000): Promise<boolean> {
    if (this.connected) return true;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.connected) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return this.connected;
  }

  // Convenience methods
  async cronList(): Promise<any> { return this.rpc('cron.list'); }
  async health(): Promise<any> { return this.rpc('health'); }
  async status(): Promise<any> { return this.rpc('status'); }
  async sessionsList(): Promise<any> { return this.rpc('sessions.list'); }
  async agentsList(): Promise<any> { return this.rpc('agents.list'); }
  async skillsStatus(): Promise<any> { return this.rpc('skills.status'); }

  // --- Internal ---

  private doConnect(): void {
    this.connectSent = false;
    this.challengeNonce = null;
    this.connected = false;

    try {
      this.ws = new WebSocket(this.config.url);
    } catch (e: any) {
      console.error('[gateway] WebSocket creation failed:', e.message);
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      console.log('[gateway] WebSocket connected, waiting for challenge...');
      setTimeout(() => this.sendConnect(), 2000);
    });

    this.ws.addEventListener('message', (event) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      this.handleMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.rejectAllPending('Connection closed');
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', (e: any) => {
      console.error('[gateway] WebSocket error:', e.message || 'unknown');
    });
  }

  private handleMessage(msg: any): void {
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      this.challengeNonce = msg.payload?.nonce || null;
      this.sendConnect();
      return;
    }

    if (msg.type === 'res') {
      const pending = this.pendingRpc.get(msg.id);
      if (pending) {
        this.pendingRpc.delete(msg.id);
        pending.resolve({ ok: !!msg.ok, payload: msg.payload, error: msg.error });
        return;
      }

      if (msg.id === 'ob-connect') {
        if (msg.ok) {
          console.log('[gateway] Connected as operator');
          this.connected = true;
        } else {
          console.error('[gateway] Connect failed:', msg.error?.code, msg.error?.message);
          if (msg.error?.code === 'unauthorized') {
            this.shouldReconnect = false;
          }
        }
        return;
      }
    }

    if (msg.type === 'event' && msg.event !== 'connect.challenge') {
      for (const handler of this.eventHandlers) {
        try { handler(msg.event, msg.payload || {}); } catch {}
      }
    }
  }

  private sendConnect(): void {
    if (this.connectSent || !this.ws) return;
    this.connectSent = true;

    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing'];
    const role = 'operator';
    const now = Date.now();
    const nonce = this.challengeNonce;
    const version = nonce ? 'v2' : 'v1';

    const parts = [version, this.deviceId, 'gateway-client', 'backend', role, scopes.join(','), String(now), this.config.token];
    if (version === 'v2') parts.push(nonce || '');
    const message = parts.join('|');
    const sig = crypto.sign(null, Buffer.from(message, 'utf-8'), this.privateKey).toString('base64url');

    this.ws.send(JSON.stringify({
      type: 'req',
      id: 'ob-connect',
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'gateway-client', version: '0.1', platform: process.platform, mode: 'backend', instanceId: 'openbrain' },
        role,
        scopes,
        device: { id: this.deviceId, publicKey: this.pubKeyB64url, signature: sig, signedAt: now, nonce: nonce || undefined },
        auth: { token: this.config.token },
        caps: [],
      },
    }));
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRpc) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: { code: 'disconnected', message: reason } });
    }
    this.pendingRpc.clear();
  }
}

// --- Connection Pool (multi-tenant) ---

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // Disconnect after 5 min idle

class GatewayPool {
  private clients = new Map<string, GatewayClient>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Periodically clean up idle connections
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  async getOrConnect(workspaceId: string, config: GatewayConfig): Promise<GatewayClient> {
    let client = this.clients.get(workspaceId);
    if (client?.isConnected()) {
      client.lastActivity = Date.now();
      return client;
    }

    // Disconnect stale client if exists
    if (client) {
      client.disconnect();
      this.clients.delete(workspaceId);
    }

    // Create new connection
    client = new GatewayClient(config);
    client.connect();
    this.clients.set(workspaceId, client);

    // Wait for connection
    const ok = await client.waitForConnection(6000);
    if (!ok) {
      client.disconnect();
      this.clients.delete(workspaceId);
      throw new Error('Gateway connection failed');
    }

    return client;
  }

  disconnect(workspaceId: string): void {
    const client = this.clients.get(workspaceId);
    if (client) {
      client.disconnect();
      this.clients.delete(workspaceId);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.lastActivity > IDLE_TIMEOUT_MS) {
        client.disconnect();
        this.clients.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    for (const [, client] of this.clients) {
      client.disconnect();
    }
    this.clients.clear();
  }
}

// --- Exports ---

// Singleton for local mode
let localGateway: GatewayClient | null = null;

export function initLocalGateway(): GatewayClient | null {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const url = process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789';

  if (!token) {
    console.log('[gateway] No OPENCLAW_GATEWAY_TOKEN set — local Gateway disabled');
    return null;
  }

  localGateway = new GatewayClient({ url, token });
  localGateway.connect();
  return localGateway;
}

export function getLocalGateway(): GatewayClient | null {
  return localGateway;
}

// Pool for cloud mode
export const gatewayPool = new GatewayPool();
