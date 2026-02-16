import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { getCqDir, writeConfig, writeQueue, writeHistory, writeInbox, ensureInboxDirs } from '../store';
import { Config } from '../types';
import { isJsonMode, out } from '../output';

export async function initCommand(opts?: { cloud?: boolean; url?: string; key?: string }) {
  if (opts?.cloud) {
    const { OpenBrainClient, saveOpenBrainConfig, getConfigPath } = await import('@openbrain/cli-client');
    const url = opts.url || process.env.OPENBRAIN_URL || 'https://openbrain.bennosan.com';
    const key = opts.key || process.env.OPENBRAIN_API_KEY;
    if (!key) {
      if (isJsonMode()) return out({ success: false, error: 'API key required' });
      console.error(chalk.red('API key required. Use --key <key> or set OPENBRAIN_API_KEY'));
      process.exit(1);
    }
    process.stdout.write('Testing connection... ');
    try {
      const client = new OpenBrainClient(key, url);
      const ok = await client.testConnection();
      if (!ok) throw new Error('Connection failed');
      console.log(chalk.green('OK ✓'));
    } catch (e: any) { console.log(chalk.red('FAILED')); console.error(e.message); process.exit(1); }
    saveOpenBrainConfig({ api_url: url, api_key: key, mode: 'cloud' });
    if (isJsonMode()) return out({ success: true, mode: 'cloud', configPath: getConfigPath() });
    console.log(chalk.green(`✓ Cloud mode configured. Config saved to ${getConfigPath()}`));
    return;
  }

  const dir = getCqDir();
  if (fs.existsSync(dir)) {
    if (isJsonMode()) return out({ success: false, error: 'Already initialized' });
    console.log(chalk.yellow('Already initialized in .contentq/'));
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });

  const config: Config = {
    platforms: {
      linkedin: {
        adapter: 'linkedin',
        apiKey: '',
        accountId: '698f07784525118cee8daad0',
        profileId: '698e1a7211ffd99f0d2eebd9',
      },
    },
    defaults: {
      platform: 'linkedin',
    },
  };

  await writeConfig(config);
  await writeQueue([]);
  await writeHistory([]);
  ensureInboxDirs();
  await writeInbox([]);

  if (isJsonMode()) return out({ success: true, path: dir });
  console.log(chalk.green('✓ Initialized .contentq/'));
  console.log(chalk.dim('  Edit .contentq/config.yaml to add your API keys'));
}
