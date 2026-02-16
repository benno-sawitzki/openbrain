import { OpenBrainClient } from './api';

export { OpenBrainClient } from './api';
export { isCloudMode, resolveApiKey, resolveApiUrl } from './auth';
export { loadOpenBrainConfig, saveOpenBrainConfig, getConfigPath } from './config';
export type { OpenBrainConfig } from './config';

let _client: OpenBrainClient | null = null;

export function getClient(): OpenBrainClient {
  if (!_client) _client = new OpenBrainClient();
  return _client;
}
