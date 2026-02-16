import chalk from 'chalk';
import { ensureInitialized, readHistory } from '../store';
import { isJsonMode, out, formatPost } from '../output';

export async function historyCommand() {
  ensureInitialized();
  const history = await readHistory();

  if (isJsonMode()) return out(history);

  if (!history.length) {
    console.log(chalk.dim('No published posts yet'));
    return;
  }

  console.log(chalk.bold(`\n  ID        Status      Platform  Text`));
  console.log(chalk.dim('  ' + '─'.repeat(70)));
  history.forEach(p => console.log('  ' + formatPost(p, true)));
  console.log();
}
