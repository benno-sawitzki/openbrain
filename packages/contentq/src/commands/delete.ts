import chalk from 'chalk';
import { ensureInitialized, readQueue, writeQueue } from '../store';
import { isJsonMode, out } from '../output';

export async function deleteCommand(id: string) {
  ensureInitialized();
  const posts = await readQueue();
  const idx = posts.findIndex(p => p.id === id || p.id.startsWith(id));

  if (idx === -1) {
    if (isJsonMode()) return out({ success: false, error: 'Post not found' });
    console.error(chalk.red(`Post not found: ${id}`));
    process.exit(1);
  }

  const removed = posts.splice(idx, 1)[0];
  await writeQueue(posts);

  if (isJsonMode()) return out({ success: true, deleted: removed.id });
  console.log(chalk.green(`✓ Deleted post ${chalk.dim(removed.id.slice(0, 8))}`));
}
