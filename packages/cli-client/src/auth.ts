import { loadOpenBrainConfig } from './config';

const DEFAULT_URL = 'https://openbrain.bennosan.com';

export function resolveApiKey(): string | null {
  // 1. Env var (for agents on Mac Mini)
  if (process.env.OPENBRAIN_API_KEY) return process.env.OPENBRAIN_API_KEY;
  // 2. Config file
  const config = loadOpenBrainConfig();
  return config.api_key || null;
}

export function resolveApiUrl(): string {
  // 1. Env var
  if (process.env.OPENBRAIN_URL) return process.env.OPENBRAIN_URL;
  // 2. Config file
  const config = loadOpenBrainConfig();
  return config.api_url || DEFAULT_URL;
}

/**
 * Determine if we should use cloud mode.
 * Priority: OPENBRAIN_MODE env > --cloud flag (caller checks) > config file > default local
 */
export function isCloudMode(): boolean {
  if (process.env.OPENBRAIN_MODE === 'cloud') return true;
  if (process.env.OPENBRAIN_MODE === 'local') return false;
  const config = loadOpenBrainConfig();
  return config.mode === 'cloud';
}
