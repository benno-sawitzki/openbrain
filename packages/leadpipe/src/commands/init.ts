import { Command } from 'commander';
import chalk from 'chalk';
import { initStore } from '../store.js';

export function initCmd(program: Command): void {
  program.command('init').description('Initialize .leadpipe/ directory')
    .option('--cloud', 'Configure cloud mode')
    .option('--url <url>', 'Open Brain API URL')
    .option('--key <key>', 'API key')
    .action(async (opts: any) => {
      if (opts.cloud) {
        const { OpenBrainClient, saveOpenBrainConfig, getConfigPath } = await import('@openbrain/cli-client');
        const url = opts.url || process.env.OPENBRAIN_URL || 'https://openbrain.bennosan.com';
        const key = opts.key || process.env.OPENBRAIN_API_KEY;
        if (!key) { console.error(chalk.red('API key required. Use --key <key> or set OPENBRAIN_API_KEY')); process.exit(1); }
        process.stdout.write('Testing connection... ');
        try {
          const client = new OpenBrainClient(key, url);
          const ok = await client.testConnection();
          if (!ok) throw new Error('Connection failed');
          console.log(chalk.green('OK ✓'));
        } catch (e: any) { console.log(chalk.red('FAILED')); console.error(e.message); process.exit(1); }
        saveOpenBrainConfig({ api_url: url, api_key: key, mode: 'cloud' });
        console.log(chalk.green(`✓ Cloud mode configured. Config saved to ${getConfigPath()}`));
        return;
      }
      initStore();
    });
}
