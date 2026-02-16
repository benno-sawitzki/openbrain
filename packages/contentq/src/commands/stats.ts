import chalk from 'chalk';
import { ensureInitialized, readQueue, readHistory } from '../store';
import { isJsonMode, out } from '../output';

export async function statsCommand() {
  ensureInitialized();
  const queue = await readQueue();
  const history = await readHistory();
  const all = [...queue, ...history];

  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  all.forEach(p => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
  });

  if (isJsonMode()) return out({ total: all.length, byStatus, byPlatform });

  console.log(chalk.bold('\n📊 Content Queue Stats\n'));
  console.log(chalk.bold('By Status:'));
  Object.entries(byStatus).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
  console.log(chalk.bold('\nBy Platform:'));
  Object.entries(byPlatform).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
  console.log(`\n  ${chalk.bold('Total:')} ${all.length}\n`);
}
