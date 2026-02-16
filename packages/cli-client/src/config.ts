import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OpenBrainConfig {
  api_url?: string;
  api_key?: string;
  mode?: 'local' | 'cloud';
}

const CONFIG_DIR = path.join(os.homedir(), '.openbrain');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadOpenBrainConfig(): OpenBrainConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveOpenBrainConfig(config: OpenBrainConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
